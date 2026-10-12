import path from 'node:path'
import { configFingerprint, loadConfig } from './config.js'
import { HistoryStore } from './history/recorder.js'
import { consoleSink, createLogger, fileSink, type Logger } from './logger.js'
import { InflightStore } from './mention/inflight.js'
import { failureAdvice } from './mention/failure.js'
import { MentionResponder } from './mention/responder.js'
import {
  checkClaudeCredential,
  claudeCredential,
} from './sandbox/claude-credential.js'
import { connectSlack } from './messengers/slack/connect.js'
import { createReasoner } from './reasoners/cli.js'
import { hostCliProblems } from './reasoners/host-check.js'
import { DockerSandbox } from './sandbox/docker.js'
import { HostSandbox } from './sandbox/host.js'
import { VmSandbox } from './sandbox/vm.js'
import type { Sandbox } from './sandbox/runtime.js'
import { DiagramRenderer } from './render/diagrams.js'
import { RECHECK_SANDBOX, SandboxHealth } from './runtime/sandbox-health.js'
import { BotStatusFile, LOG_FILE } from './runtime/status.js'
import {
  botLockDirs,
  securePrivateDir,
  securePrivateFile,
} from './settings/home.js'
import { envFilePath, pacenoteHome } from './settings/paths.js'
import { secretValues } from './settings/fields.js'
import { loadEnv } from './settings/load-env.js'

/**
 * The channel to the desktop app when it runs the bot as an Electron
 * utilityProcess; absent in a terminal
 */
function parentPort():
  | { on(event: 'message', listener: (event: { data: unknown }) => void): void }
  | undefined {
  return (process as { parentPort?: ReturnType<typeof parentPort> }).parentPort
}

/**
 * Holds the logger once created, so startup failures also reach the log file.
 */
let startupLog: Logger | undefined
/**
 * Set once the bot receives mentions; failures before that are startup failures
 */
let running = false

async function main(): Promise<void> {
  loadEnv()
  const config = loadConfig()
  // Settings, run history and logs stay with this account.
  securePrivateDir(pacenoteHome())
  securePrivateDir(config.dataDir)
  securePrivateFile(envFilePath())
  // Logs to PACENOTE_DATA_DIR/logs/bot.log as well as the console. The desktop
  // app shows this file.
  const log = createLogger(config.logLevel, 'pacenote', [
    consoleSink,
    fileSink(path.join(config.dataDir, LOG_FILE)),
  ])
  startupLog = log
  const status = await BotStatusFile.acquire(
    config.dataDir,
    process.env.PACENOTE_MANAGED_BY === 'desktop' ? 'desktop' : 'terminal',
    undefined,
    botLockDirs(config.dataDir).slice(1)
  )
  status.update({ configHash: configFingerprint(process.env) })
  log.info(`Starting (pid ${process.pid}, ${status.current.managedBy})`)

  // Set up as soon as the status file is ours, so a stop while starting also
  // ends through process.exit, which takes the status file away.
  const started: {
    connection?: Awaited<ReturnType<typeof connectSlack>>
    responder?: MentionResponder
    sandbox?: Sandbox
  } = {}
  let stopping = false
  const shutdown = async (signal: string) => {
    if (stopping) return
    stopping = true
    status.update({ state: 'stopping' })
    log.info(
      `Received ${signal}, waiting for in-progress requests before shutting down.`
    )
    await started.connection?.stop().catch(() => undefined)
    // Unfinished requests stay in PACENOTE_DATA_DIR/inflight.json and resume on
    // the next start.
    if (started.responder && !(await started.responder.stop(15_000)))
      log.warn('Shutting down with requests still in progress.')
    await started.sandbox?.close?.().catch(() => undefined)
    log.info(`Stopped (pid ${process.pid})`)
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  const connection = await connectSlack({
    config,
    log,
    onState: (state) => status.socket(state),
    onFatal: (err) => {
      log.error(err.message)
      process.exit(1)
    },
    onLimits: () => status.update({ limits: connection.limits() }),
  })
  started.connection = connection
  const { messenger, bot } = connection
  /**
   * Problems fixed for this process's life (diagram rendering); the sandbox's
   * come from sandboxHealth
   */
  const problems: string[] = []
  /** Why the reasoner cannot answer, until it answers again */
  let reasonerProblem: string | undefined

  const sandbox: Sandbox = config.reasoner.sandbox
    ? new DockerSandbox(config.reasoner.sandbox)
    : config.reasoner.vm
      ? new VmSandbox(config.reasoner.vm, log.child('sandbox'))
      : new HostSandbox(config.reasoner.commands)
  started.sandbox = sandbox
  const reasoner = createReasoner(config.reasoner, sandbox)
  // If the sandbox is not ready, reasoner calls fail. They do not fall back to
  // the host. The check repeats while the bot runs, and right away when the
  // desktop app finishes a sandbox job, so the status (and the status bar)
  // follows a proxy that is started or stopped later.
  // On this Mac, the CLI itself is what to check: installed, signed in, and
  // recent enough, before a mention fails on it.
  const checked = sandbox.kind === 'host' ? 'Reasoner' : 'Sandbox'
  const allProblems = () => [
    ...sandboxHealth.current.map((problem) => `${checked}: ${problem}`),
    ...(reasonerProblem ? [`Reasoner: ${reasonerProblem}`] : []),
    ...problems,
  ]
  const sandboxHealth = new SandboxHealth(
    sandbox.kind === 'host'
      ? () =>
          hostCliProblems(
            reasoner.backend,
            config.reasoner.commands[reasoner.backend]
          )
      : () => sandbox.verify(),
    () => status.update({ problems: allProblems() }),
    log,
    checked
  )
  await sandboxHealth.check()
  if (config.mention.workspace && !reasoner.canReadFiles) {
    log.warn(
      `${reasoner.backend} cannot read files in the ${sandbox.kind} sandbox, so MENTION_WORKSPACE is not used.`
    )
  }

  let renderer: DiagramRenderer | undefined
  if (config.render.enabled) {
    const candidate = new DiagramRenderer({
      dockerBin: config.render.dockerBin,
      image: config.render.image,
      timeoutMs: 60_000,
    })
    const rendererProblems = await candidate.verify()
    for (const problem of rendererProblems) {
      log.warn(`Diagram rendering disabled: ${problem}`)
      problems.push(`Diagram rendering disabled: ${problem}`)
    }
    if (rendererProblems.length === 0) renderer = candidate
  }

  const history = config.history
    ? new HistoryStore(config.dataDir, log.child('history'))
    : undefined
  const pruneHistory = () => {
    if (!history || !config.history) return
    try {
      const removed = history.prune(config.history.retentionDays)
      if (removed > 0)
        log.info(
          `Deleted ${removed} ${removed === 1 ? 'day' : 'days'} of run history past the retention period.`
        )
    } catch (err) {
      log.warn(`Run history cleanup failed: ${(err as Error).message}`)
    }
  }
  pruneHistory()
  setInterval(pruneHistory, 6 * 60 * 60_000).unref()

  const responder = new MentionResponder({
    config,
    messengers: [messenger],
    reasoner,
    log: log.child('mention'),
    extractPdfText: (pdfPath) => sandbox.extractPdfText(pdfPath),
    renderer,
    inflight: new InflightStore(path.join(config.dataDir, 'inflight.json')),
    history,
    secrets: secretValues(process.env),
    onActivity: (requests) => status.update({ requests }),
    onReasoner: (problem) => {
      // An answer that went through settles what the check said before.
      if (!problem && sandboxHealth.current.length > 0)
        void sandboxHealth.check()
      if (problem === reasonerProblem) return
      reasonerProblem = problem
      status.update({ problems: allProblems() })
    },
  })
  started.responder = responder

  status.update({
    bot,
    reasoner: `${reasoner.backend}@${sandbox.kind}`,
    mcp: reasoner.mcpServerNames,
    diagrams: renderer !== undefined,
    history: history !== undefined,
    problems: allProblems(),
    limits: connection.limits(),
  })
  // A claude credential the API rejects (cut short, revoked) shows in the
  // status at once, not only when a mention fails on it.
  if (sandbox.isolated && reasoner.backend === 'claude')
    void checkClaudeCredential(
      claudeCredential(config.reasoner.auth?.env ?? {})
    ).then((state) => {
      if (state !== 'rejected' || reasonerProblem) return
      reasonerProblem = `${failureAdvice('auth', 'claude', sandbox.kind)?.text} (checked at startup)`
      status.update({ problems: allProblems() })
    })
  await connection.start((mention) => responder.handle(mention))
  status.update({ state: 'running' })
  running = true
  // The CLI's sign-in changes rarely; the sandbox's proxy may stop any time.
  sandboxHealth.start(sandbox.kind === 'docker' ? 30_000 : 5 * 60_000)
  // Messages from the desktop app
  parentPort()?.on('message', (event) => {
    const type = (event.data as { type?: string } | undefined)?.type
    if (type === RECHECK_SANDBOX) void sandboxHealth.check()
  })
  await responder.resumePending()
  const allowed = config.mention.allowedUserIds
  log.info(
    `Started: ${messenger.profile.name} bot=${bot.user} (${bot.userId}) @ ${bot.team}, ` +
      `reasoner=${reasoner.backend}@${sandbox.kind}, ` +
      `allowed users=${allowed.length > 0 ? `${allowed.length}` : 'all'}, ` +
      `reference directory=${config.mention.workspace && reasoner.canReadFiles ? config.mention.workspace : 'none'}, ` +
      `MCP=[${reasoner.mcpServerNames.join(', ')}], diagrams=${renderer ? 'on' : 'off'}, ` +
      `data=${config.dataDir}${history ? '' : ' (history off)'}`
  )
}

const fail = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  const text = running
    ? `Stopped on an unhandled error: ${message}`
    : `Startup failed: ${message}`
  if (startupLog) startupLog.error(text)
  else console.error(text)
  process.exit(1)
}
// Bolt checks the token on its own as well, and a rejected token fails that
// check outside main(). It should end the bot with a message in the log (which
// the desktop app reads for "Setup needed"), not a stack dump.
process.on('unhandledRejection', fail)
main().catch(fail)
