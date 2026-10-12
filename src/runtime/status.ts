import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { BotStatus, BotStatusView, SocketState } from './types.js'

export const STATUS_FILE = 'bot.json'
export const LOG_FILE = path.join('logs', 'bot.log')
/**
 * The desktop app's own log, beside the bot's: Pace's exits and restarts,
 * builds, and errors in the window
 */
export const DESKTOP_LOG_FILE = path.join('logs', 'desktop.log')

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM means the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * How long a process has been running, from ps's etime ("[[dd-]hh:]mm:ss"), in
 * milliseconds
 */
export function parseElapsed(etime: string): number | undefined {
  const match = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(etime.trim())
  if (!match) return undefined
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match
  return (((+days * 24 + +hours) * 60 + +minutes) * 60 + +seconds) * 1000
}

/** When the process started, or undefined when ps cannot tell */
function processStartedAt(pid: number): number | undefined {
  const ps = spawnSync('ps', ['-o', 'etime=', '-p', String(pid)], {
    encoding: 'utf8',
    timeout: 2_000,
  })
  const elapsed = ps.status === 0 ? parseElapsed(ps.stdout) : undefined
  return elapsed === undefined ? undefined : Date.now() - elapsed
}

/**
 * ps counts whole seconds, and a bot writes startedAt a moment after its
 * process starts.
 */
const START_SLACK_MS = 2_000
/** How long a pid confirmed as the bot's goes unchecked */
const CONFIRMED_FOR_MS = 60_000
const confirmed = new Map<string, number>()

/**
 * Whether the bot that wrote this status still runs. Its pid alone is not
 * enough: after a crash or a power cut, bot.json stays behind and another
 * process can get the same pid. A process that started after the bot wrote
 * startedAt is not the bot.
 */
export function isBotRunning(
  status: Pick<BotStatus, 'pid' | 'startedAt'>
): boolean {
  if (!isAlive(status.pid)) return false
  const startedAt = Date.parse(status.startedAt)
  if (Number.isNaN(startedAt)) return true
  const key = `${status.pid}@${status.startedAt}`
  if (Date.now() - (confirmed.get(key) ?? -Infinity) < CONFIRMED_FOR_MS)
    return true
  const since = processStartedAt(status.pid)
  // Without ps there is only the pid to go by.
  if (since !== undefined && since > startedAt + START_SLACK_MS) return false
  if (confirmed.size > 50) confirmed.clear()
  confirmed.set(key, Date.now())
  return true
}

/**
 * The first bot alive among these data folders (see botLockDirs), else the
 * status of the first folder
 */
export function readRunningBot(dataDirs: readonly string[]): BotStatusView {
  const views = dataDirs.map(readBotStatus)
  return views.find((view) => view.alive) ?? views[0] ?? { alive: false }
}

export function readBotStatus(dataDir: string): BotStatusView {
  const file = path.join(dataDir, STATUS_FILE)
  if (!existsSync(file)) return { alive: false }
  try {
    const status = JSON.parse(readFileSync(file, 'utf8')) as BotStatus
    return { status, alive: isBotRunning(status) }
  } catch {
    return { alive: false }
  }
}

export class BotAlreadyRunningError extends Error {
  constructor(
    readonly pid: number,
    managedBy: string
  ) {
    super(
      `Pace is already running (pid ${pid}, ${managedBy === 'desktop' ? 'desktop app' : 'terminal'}). ` +
        'Running two with the same app token makes Slack split events between them, so only one runs.'
    )
  }
}

/** This process's status file. Acquired at startup and deleted on exit. */
export class BotStatusFile {
  private constructor(
    private readonly file: string,
    private status: BotStatus
  ) {}

  /**
   * If another bot is alive, waits up to waitMs for it to exit. (Time for the
   * previous process to finish in-progress requests on a pnpm dev restart) If
   * it is still alive, throws BotAlreadyRunningError. otherDirs are also
   * checked for a running bot (the default home, when the data folder is set
   * elsewhere), but the status file is written only to dataDir.
   */
  static async acquire(
    dataDir: string,
    managedBy: BotStatus['managedBy'],
    waitMs = 30_000,
    otherDirs: readonly string[] = []
  ): Promise<BotStatusFile> {
    const deadline = Date.now() + waitMs
    for (;;) {
      const current = readRunningBot([dataDir, ...otherDirs])
      if (!current.alive || current.status?.pid === process.pid) break
      if (Date.now() >= deadline) {
        throw new BotAlreadyRunningError(
          current.status!.pid,
          current.status!.managedBy
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const now = new Date().toISOString()
    const handle = new BotStatusFile(path.join(dataDir, STATUS_FILE), {
      version: 1,
      pid: process.pid,
      startedAt: now,
      updatedAt: now,
      state: 'starting',
      managedBy,
      socket: { state: 'disconnected', since: now, reconnects: 0 },
      problems: [],
      requests: { active: 0, handled: 0 },
    })
    handle.write()
    process.once('exit', () => handle.release())
    return handle
  }

  get current(): BotStatus {
    return this.status
  }

  update(
    patch: Partial<Omit<BotStatus, 'version' | 'pid' | 'startedAt'>>
  ): void {
    this.status = { ...this.status, ...patch }
    this.write()
  }

  socket(state: SocketState): void {
    const previous = this.status.socket
    if (previous.state === state) return
    this.update({
      socket: {
        state,
        since: new Date().toISOString(),
        reconnects: previous.reconnects + (state === 'reconnecting' ? 1 : 0),
      },
    })
  }

  /** Deletes the file only if this process wrote it. */
  release(): void {
    try {
      const onDisk = JSON.parse(readFileSync(this.file, 'utf8')) as BotStatus
      if (onDisk.pid === process.pid) rmSync(this.file, { force: true })
    } catch {
      // Already gone.
    }
  }

  private write(): void {
    this.status.updatedAt = new Date().toISOString()
    try {
      mkdirSync(path.dirname(this.file), { recursive: true })
      writeFileSync(
        `${this.file}.tmp`,
        `${JSON.stringify(this.status, null, 2)}\n`
      )
      renameSync(`${this.file}.tmp`, this.file)
    } catch {
      // The bot keeps running even if the status file cannot be written.
    }
  }
}
