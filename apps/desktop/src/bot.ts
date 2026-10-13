import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { utilityProcess, type UtilityProcess } from 'electron'
import { RECHECK_SANDBOX } from '../../../src/runtime/sandbox-health.js'
import { readRunningBot } from '../../../src/runtime/status.js'
import { botLockDirs } from '../../../src/settings/home.js'
import {
  nextRetry,
  setupProblem,
  startFailureProblem,
} from './bot-readiness.js'
import type { SupervisorState } from '../../../src/runtime/types.js'

export type { SupervisorState }

/**
 * The desktop app runs and manages the bot (Socket Mode) as a child process.
 * - Runs the bot entry with Electron utilityProcess. Dev runs use the
 *   repository's dist/index.js and build first when the sources are newer. The
 *   packaged app uses the bundle inside the app (bot/index.mjs) as is.
 *   (app-paths.ts)
 * - If a bot is already running from a terminal (pnpm dev etc.), it is left
 *   alone and shown as "external".
 * - Before launching, the bot's environment is checked with the bot's own
 *   rules. Missing settings (a first run) or tokens Slack rejected show as
 *   "setup" instead of launching a bot that would only exit on them.
 * - A bot that exits when no one asked it to is started again, after a wait
 *   that doubles with each exit in a row (up to 5 minutes) and starts over
 *   after a run that went well (nextRetry). Stop ends the wait. Tokens Slack
 *   rejected are a setup problem instead, and are not tried again.
 * - Stopping sends SIGTERM. The bot gives active requests up to 15 seconds,
 *   stops the reasoner runs left, and resumes them on the next start.
 */
interface Settings {
  autoStartBot: boolean
}

const OUTPUT_LINES = 200
const STOP_TIMEOUT_MS = 30_000
/** A bot that exits sooner than this failed to start; later, it crashed. */
const STARTED_MS = 30_000

export class BotSupervisor extends EventEmitter<{ change: [SupervisorState] }> {
  /**
   * Asks the running bot to check the sandbox again now (after a sandbox job),
   * so its status follows at once.
   */
  recheckSandbox(): void {
    this.child?.postMessage({ type: RECHECK_SANDBOX })
  }

  private child?: UtilityProcess
  private childStartedAt = 0
  private stopRequested = false
  /** The app is quitting: nothing starts the bot again (dispose) */
  private disposed = false
  /** Exits no one asked for in a row (nextRetry) */
  private failures = 0
  /** Starts the bot again after such an exit */
  private retryTimer?: NodeJS.Timeout
  private poller?: NodeJS.Timeout
  private state: SupervisorState
  private readonly settingsFile: string

  constructor(
    private readonly options: {
      /** Bot entry file */
      entry: string
      /**
       * Dev runs only: the repository to rebuild. Without it, nothing is built.
       * (packaged app)
       */
      repoRoot?: string
      /** Bot working directory */
      cwd: string
      /** Settings file (outside the repository, src/settings/paths.ts) */
      envFile: string
      dataDir: string
      /**
       * Login shell PATH (an app launched from Finder lacks the docker, codex,
       * and pnpm paths)
       */
      toolPath: () => string
      log: (message: string) => void
    }
  ) {
    super()
    this.settingsFile = path.join(options.dataDir, 'desktop.json')
    this.state = {
      phase: 'idle',
      output: [],
      autoStart: this.readSettings().autoStartBot,
      restarts: 0,
      canBuild: options.repoRoot !== undefined,
    }
    this.refreshExternal()
    // Also tracks external bots starting and stopping.
    this.poller = setInterval(() => this.refreshExternal(), 2_000)
    this.poller.unref()
  }

  get current(): SupervisorState {
    return this.state
  }

  get managing(): boolean {
    return this.child !== undefined
  }

  setAutoStart(value: boolean): void {
    writeFileSync(
      this.settingsFile,
      `${JSON.stringify({ autoStartBot: value }, null, 2)}\n`
    )
    this.set({ autoStart: value })
  }

  async start(options: { rebuild?: boolean } = {}): Promise<void> {
    if (this.disposed || this.child || this.state.phase === 'building') return
    this.cancelRetry()
    this.refreshExternal()
    if (this.state.phase === 'external') return
    this.stopRequested = false
    const problem = setupProblem(this.botEnv())
    if (problem) {
      this.set({
        phase: 'setup',
        pid: undefined,
        message: problem.message,
        issues: problem.issues,
        output: [],
      })
      return
    }
    const { entry } = this.options
    if (
      this.options.repoRoot &&
      (options.rebuild || this.needsBuild(entry, this.options.repoRoot))
    ) {
      if (!(await this.build())) return
    }
    this.spawn(entry)
  }

  async stop(): Promise<void> {
    this.failures = 0
    // Waiting to start again, it stays stopped instead.
    if (this.retryTimer) {
      this.cancelRetry()
      this.set({
        phase: 'idle',
        pid: undefined,
        message: 'Stopped',
        restarts: 0,
      })
    }
    const child = this.child
    if (!child) return
    this.stopRequested = true
    this.set({
      phase: 'stopping',
      message: 'Finishing active requests before stopping.',
    })
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.pid) {
          try {
            process.kill(child.pid, 'SIGKILL')
          } catch {
            // Already exited
          }
        }
        resolve()
      }, STOP_TIMEOUT_MS)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill()
    })
  }

  async restart(options: { rebuild?: boolean } = {}): Promise<void> {
    await this.stop()
    await this.start(options)
  }

  /**
   * For a quitting app: no retry, no start from a startup still on its way or
   * an external bot that stops. A running bot is still stopped with stop().
   */
  dispose(): void {
    this.disposed = true
    if (this.poller) clearInterval(this.poller)
    this.cancelRetry()
  }

  private cancelRetry(): void {
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    if (this.state.retryAt !== undefined) this.set({ retryAt: undefined })
  }

  /** pnpm build (tsc). Output is kept in output. Called only in dev runs. */
  private build(): Promise<boolean> {
    this.set({
      phase: 'building',
      message: 'Building Pace (pnpm build)',
      output: [],
    })
    return new Promise((resolve) => {
      execFile(
        'pnpm',
        ['build'],
        {
          cwd: this.options.repoRoot!,
          env: { ...process.env, PATH: this.options.toolPath() },
          timeout: 180_000,
          maxBuffer: 4 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          const output = `${stdout}${stderr}`
            .split('\n')
            .filter(Boolean)
            .slice(-OUTPUT_LINES)
          if (err) {
            this.options.log(`bot build failed: ${err.message}`)
            this.set({ phase: 'failed', message: 'The build failed.', output })
            resolve(false)
            return
          }
          this.set({ phase: 'idle', message: undefined, output })
          resolve(true)
        }
      )
    })
  }

  /**
   * The bot's environment: the settings file under the app's own environment,
   * as with node --env-file.
   */
  private botEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    const { envFile } = this.options
    if (existsSync(envFile))
      Object.assign(env, parseEnv(readFileSync(envFile, 'utf8')))
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !key.startsWith('ELECTRON_')) env[key] = value
    }
    env.PATH = this.options.toolPath()
    env.PACENOTE_MANAGED_BY = 'desktop'
    env.PACENOTE_DATA_DIR = this.options.dataDir
    env.NODE_ENV = 'production'
    return env
  }

  private spawn(entry: string): void {
    const env = this.botEnv()
    const child = utilityProcess.fork(entry, [], {
      cwd: this.options.cwd,
      env,
      stdio: 'pipe',
      serviceName: 'Pace',
    })
    this.child = child
    this.childStartedAt = Date.now()
    this.set({
      phase: 'starting',
      pid: undefined,
      message: undefined,
      issues: undefined,
      output: [],
      retryAt: undefined,
    })

    const capture = (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      this.set({
        output: [...this.state.output, ...lines].slice(-OUTPUT_LINES),
      })
    }
    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)
    child.once('spawn', () => this.set({ pid: child.pid }))
    child.once('exit', (code) => this.onExit(child, code))
  }

  private onExit(child: UtilityProcess, code: number): void {
    if (this.child !== child) return
    this.child = undefined
    const uptime = Date.now() - this.childStartedAt
    this.options.log(`bot exited code=${code} uptime=${uptime}ms`)
    if (this.stopRequested || this.disposed) {
      this.set({ phase: 'idle', pid: undefined, message: 'Stopped' })
      return
    }
    // Tokens Slack or the hub rejected are a setup problem, which another try
    // does not fix.
    const problem = startFailureProblem(this.state.output)
    if (problem) {
      this.failures = 0
      this.set({
        phase: 'setup',
        pid: undefined,
        message: problem.message,
        issues: [],
        restarts: 0,
      })
      return
    }
    // Anything else is tried again, with the output kept.
    const retry = nextRetry(this.failures, uptime)
    this.failures = retry.failures
    // The last line without the log's time, level and scope
    const last = (this.state.output.at(-1) ?? '').replace(
      /^\S+\s+(?:DEBUG|INFO|WARN|ERROR)\s+\[[^\]]*\]\s*/,
      ''
    )
    this.set({
      pid: undefined,
      restarts: retry.failures,
      retryAt: Date.now() + retry.delayMs,
      ...(uptime < STARTED_MS
        ? {
            phase: 'failed',
            message:
              `Pace stopped right after starting (code ${code}). ${last}`.trim(),
          }
        : { phase: 'crashed', message: `Pace exited (code ${code}).` }),
    })
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void this.start()
    }, retry.delayMs)
  }

  /**
   * Syncs phase with bot.json. A bot started here is running; one started
   * elsewhere is external
   */
  private refreshExternal(): void {
    // A bot in the default home, when this data folder is elsewhere, also
    // counts as running elsewhere.
    const view = readRunningBot(botLockDirs(this.options.dataDir))
    if (this.child) {
      const ours = view.alive && view.status?.pid === this.child.pid
      const running = ours && view.status?.state === 'running'
      if (running && this.state.phase === 'starting')
        this.set({ phase: 'running' })
      return
    }
    const externalPid = view.alive ? view.status?.pid : undefined
    if (externalPid && this.state.phase !== 'external') {
      this.cancelRetry()
      this.set({
        phase: 'external',
        pid: externalPid,
        message:
          'Pace is running elsewhere, such as a terminal. Stop it there to manage it here.',
      })
    } else if (!externalPid && this.state.phase === 'external') {
      this.set({
        phase: 'idle',
        pid: undefined,
        message: 'Pace stopped running elsewhere.',
      })
      if (this.state.autoStart) void this.start()
    }
  }

  /** A build is needed when dist/index.js is missing or src is newer. */
  private needsBuild(entry: string, repoRoot: string): boolean {
    if (!existsSync(entry)) return true
    const built = statSync(entry).mtimeMs
    const newest = (dir: string): number =>
      readdirSync(dir, { withFileTypes: true }).reduce((max, item) => {
        const file = path.join(dir, item.name)
        const mtime = item.isDirectory() ? newest(file) : statSync(file).mtimeMs
        return Math.max(max, mtime)
      }, 0)
    return newest(path.join(repoRoot, 'src')) > built
  }

  private readSettings(): Settings {
    try {
      const parsed = JSON.parse(
        readFileSync(this.settingsFile, 'utf8')
      ) as Partial<Settings>
      return { autoStartBot: parsed.autoStartBot ?? true }
    } catch {
      return { autoStartBot: true }
    }
  }

  private set(patch: Partial<SupervisorState>): void {
    this.state = { ...this.state, ...patch }
    this.emit('change', this.state)
  }
}
