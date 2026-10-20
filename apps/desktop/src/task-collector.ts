import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { McpLaunch } from '../../../src/history/mcp-clients.js'
import type { HistoryStore } from '../../../src/history/recorder.js'
import type { RunEvent } from '../../../src/history/types.js'
import {
  claudeResultUsage,
  runUsage,
  type TokenUsage,
} from '../../../src/history/usage.js'
import { failureCause } from '../../../src/mention/failure.js'
import { claudeLineToEvents } from '../../../src/reasoners/claude.js'
import {
  codexLineToEvents,
  type CodexDefaults,
} from '../../../src/reasoners/codex.js'
import { collectPrompt } from '../../../src/tasks/mcp.js'
import {
  CLI_NAMES,
  switchWords,
  unableFrom,
  type OwnCli,
  type Switch,
  type Unable,
} from '../../../src/tasks/own-ai.js'
import {
  SOURCE_IDS,
  SOURCES,
  sourceNames,
  sourceOfTool,
  type SourceId,
} from '../../../src/tasks/sources.js'
import type { CollectOutcome, TasksCollect } from '../../../src/tasks/types.js'
import { connectorCommand, type Bins } from './headless.js'
import { OwnAi } from './own-ai.js'

const TASK_TOOLS = [
  'collect_context',
  'add_tasks',
  'update_task',
  'close_task',
  'wrap_up_task',
  'my_tasks',
]
const TIMEOUT_MS = 10 * 60_000
/** What to do when the sources' connectors are not in the CLI */
const noConnector = (cli: OwnCli, sources: readonly SourceId[]) =>
  `${CLI_NAMES[cli]} has no ${sourceNames(sources)} connector. Connect ${sourceNames(sources)} in ${SOURCES[sources[0] ?? 'slack'].connectors[cli].where}, then collect again.`
const STOPPED = 'Stopped.'
/**
 * Collecting runs the CLI on this Mac, whichever one answers mentions, so it
 * may be signed out there while Pace answers.
 */
export const SIGNED_OUT: Record<OwnCli, string> = {
  claude:
    'Claude Code on this Mac is signed out, and collecting reads Slack through it.',
  codex:
    'Codex on this Mac is signed out, and collecting reads Slack through it.',
}

/**
 * The command for one collection: the CLI, headless, running Pacenote's
 * collect_tasks prompt with only its sources' read tools and Pacenote's task
 * tools (headless.ts). Claude Code runs the prompt from Pacenote's server;
 * codex is given its text (collectInput).
 */
export function collectCommand(
  launch: McpLaunch,
  options: {
    cli?: OwnCli
    bin?: string
    sources?: readonly SourceId[]
    codex?: CodexDefaults
  } = {}
): [string, string[]] {
  const cli = options.cli ?? 'claude'
  return connectorCommand(cli, options.bin ?? cli, {
    launch,
    tools: TASK_TOOLS,
    sources: options.sources ?? SOURCE_IDS,
    slash: '/mcp__pacenote__collect_tasks',
    codex: options.codex,
  })
}

/** A collection's stdin: nothing for claude, the prompt for codex */
export const collectInput = (cli: OwnCli): string | undefined =>
  cli === 'codex' ? collectPrompt() : undefined

interface ClaudeEvent {
  type?: string
  subtype?: string
  mcp_servers?: { name: string; status: string }[]
  message?: { content?: unknown }
  is_error?: boolean
  result?: string
  usage?: Record<string, number>
  total_cost_usd?: number
}

interface ContentBlock {
  type?: string
  id?: string
  name?: string
  tool_use_id?: string
  is_error?: boolean
  content?: unknown
}

interface CodexEvent {
  type?: string
  message?: string
  error?: { message?: string }
  item?: {
    id?: string
    type?: string
    server?: string
    tool?: string
    text?: string
    result?: { content?: unknown } | null
    error?: { message?: string } | string | null
  }
}

/**
 * Reads a collection's output (Claude Code's stream-json, or codex's --json
 * events): how many times it read its sources, what add_tasks answered, how
 * the run ended and the tokens it spent.
 */
export class CollectStream {
  reads = 0
  /** The sources whose connector the run does not have, once it starts */
  missing: SourceId[] = []
  added?: { confidence?: string }[]
  skipped = 0
  addError?: string
  ended?: { ok: boolean; text: string }
  usage?: TokenUsage
  private addCall?: string
  private said?: string

  constructor(
    private readonly sources: readonly SourceId[] = SOURCE_IDS,
    readonly cli: OwnCli = 'claude'
  ) {}

  push(line: string): void {
    if (this.cli === 'codex') this.pushCodex(line)
    else this.pushClaude(line)
  }

  private pushClaude(line: string): void {
    let event: ClaudeEvent
    try {
      event = JSON.parse(line) as ClaudeEvent
    } catch {
      return
    }
    if (event.type === 'system' && event.subtype === 'init') {
      this.missing = this.sources.filter((id) => {
        const server = event.mcp_servers?.find(
          (entry) => entry.name === SOURCES[id].connectors.claude.server
        )
        return !server || ['failed', 'needs-auth'].includes(server.status)
      })
      return
    }
    if (event.type === 'result') {
      this.ended = {
        ok: event.subtype === 'success' && !event.is_error,
        text: event.result ?? '',
      }
      if (event.usage) this.usage = claudeResultUsage(event)
      return
    }
    const content = event.message?.content
    if (!Array.isArray(content)) return
    for (const block of content as ContentBlock[]) {
      if (block.type === 'tool_use') {
        if (block.name && sourceOfTool(block.name)) this.reads += 1
        if (block.name === 'mcp__pacenote__add_tasks') this.addCall = block.id
      } else if (
        block.type === 'tool_result' &&
        block.tool_use_id === this.addCall
      ) {
        this.answered(textOf(block.content), Boolean(block.is_error))
      }
    }
  }

  private pushCodex(line: string): void {
    let event: CodexEvent
    try {
      event = JSON.parse(line) as CodexEvent
    } catch {
      return
    }
    if (event.type === 'turn.completed') {
      this.ended = { ok: true, text: this.said ?? '' }
      const usage = runUsage(codexLineToEvents(line))
      if (usage) this.usage = usage
      return
    }
    if (event.type === 'turn.failed' || event.type === 'error') {
      this.ended = {
        ok: false,
        text: event.error?.message ?? event.message ?? 'codex turn failed',
      }
      return
    }
    const item = event.item
    if (!item) return
    if (item.type === 'agent_message' && item.text) this.said = item.text
    if (item.type !== 'mcp_tool_call') return
    if (
      event.type === 'item.started' &&
      item.server === SOURCES.slack.connectors.codex.server &&
      item.tool &&
      sourceOfTool(item.tool, 'codex')
    )
      this.reads += 1
    if (
      event.type === 'item.completed' &&
      item.server === 'pacenote' &&
      item.tool === 'add_tasks'
    ) {
      const error =
        typeof item.error === 'string' ? item.error : item.error?.message
      if (error) this.answered(error, true)
      else this.answered(textOf(item.result?.content), false)
    }
  }

  /** What add_tasks answered */
  private answered(text: string, isError: boolean): void {
    if (isError) {
      this.addError = text
      return
    }
    try {
      const body = JSON.parse(text) as {
        added?: { confidence?: string }[]
        skipped?: unknown[]
      }
      this.added = body.added ?? []
      this.skipped = body.skipped?.length ?? 0
    } catch {
      this.addError = text
    }
  }

  /**
   * How the collection ended, once the process is gone; stderr, for a run
   * that stopped before its result. unable says when the CLI could not
   * collect at all (signed out, at its limit, no connector), so the other one
   * may.
   */
  outcome(
    at: string,
    fallback?: string,
    stderr = '',
    unable?: Unable
  ): CollectOutcome {
    const spent = {
      reads: this.reads,
      by: this.cli,
      ...(this.usage ? { usage: this.usage } : {}),
    }
    if (this.added)
      return {
        at,
        ok: true,
        added: this.added.filter((task) => task.confidence === 'sure').length,
        maybe: this.added.filter((task) => task.confidence !== 'sure').length,
        skipped: this.skipped,
        ...spent,
      }
    // Why the run itself failed comes first: signed out (in its result, or
    // on stderr when it stopped before one), there are no connectors at all.
    const said = this.ended ? (this.ended.ok ? '' : this.ended.text) : stderr
    if (!this.addError && fallback !== STOPPED && failureCause(said) === 'auth')
      return {
        at,
        ok: false,
        error: SIGNED_OUT[this.cli],
        signedOut: true,
        unable: 'auth',
        ...spent,
      }
    // codex says nothing of its apps up front: a run that read nothing and
    // ended had none.
    const missing =
      this.cli === 'codex' && this.ended?.ok && this.reads === 0
        ? this.sources
        : this.missing
    const failed =
      this.ended && !this.ended.ok ? firstLine(this.ended.text) : ''
    const noSources =
      missing.length && this.reads === 0
        ? noConnector(this.cli, missing)
        : undefined
    const error =
      this.addError ??
      fallback ??
      (failed || undefined) ??
      noSources ??
      (firstLine(this.ended?.text) ||
        'The collection stopped before it finished.')
    const why =
      this.addError || fallback === STOPPED
        ? undefined
        : (unable ??
          unableFrom(said) ??
          (error === noSources ? 'connector' : undefined))
    return { at, ok: false, error, ...(why ? { unable: why } : {}), ...spent }
  }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content.map((part: { text?: string }) => part.text ?? '').join('\n')
  return ''
}

function firstLine(text: string | undefined): string {
  return (text ?? '').trim().split('\n')[0]?.trim() ?? ''
}

/**
 * A collection's output as run history steps, keeping what is yours out: the
 * model's own words (they quote your messages) are left out, and so are what a
 * connector's tools were asked and returned. Its tool calls stay (which tool,
 * when, how long); Pacenote's own tools keep their arguments and answers.
 */
export class CollectionEvents {
  private readonly connectorCalls = new Set<string>()

  constructor(private readonly cli: OwnCli = 'claude') {}

  from(line: string, at?: string): RunEvent[] {
    const kept: RunEvent[] = []
    const events =
      this.cli === 'codex'
        ? codexLineToEvents(line, at)
        : claudeLineToEvents(line, at)
    for (const event of events) {
      if (event.kind === 'message' || event.kind === 'reasoning') continue
      if (event.kind !== 'tool') {
        kept.push(event)
        continue
      }
      if (
        event.server.startsWith('claude_ai_') ||
        event.server === SOURCES.slack.connectors.codex.server
      )
        this.connectorCalls.add(event.id)
      if (!this.connectorCalls.has(event.id)) {
        kept.push(event)
        continue
      }
      kept.push({
        kind: 'tool',
        id: event.id,
        at: event.at,
        server: event.server,
        tool: event.tool,
        status: event.status,
        finishedAt: event.finishedAt,
      })
    }
    return kept
  }
}

/** Where a collection's run goes, as it runs (the run history in the app) */
export interface CollectionRecorder {
  event(event: RunEvent): void
  finish(outcome: CollectOutcome, attempts?: number): void
}

/**
 * A collection's run in the history: a CLI on this Mac, started by Collect
 * now. It ends succeeded when add_tasks answered, interrupted when stopped,
 * failed otherwise; backend names the CLI that collected (or tried last).
 */
export function recordCollection(
  history: Pick<HistoryStore, 'startCollection'>,
  startedAt: Date,
  cli: OwnCli = 'claude'
): CollectionRecorder {
  const run = history.startCollection(
    { trigger: 'now', backend: { reasoner: cli, sandbox: 'host' } },
    startedAt
  )
  return {
    event: (event) => run.event(event),
    finish: (outcome, attempts = 1) =>
      run.finish(
        outcome.ok
          ? 'succeeded'
          : outcome.error === STOPPED
            ? 'interrupted'
            : 'failed',
        {
          reads: outcome.reads,
          backend: { reasoner: outcome.by ?? cli, sandbox: 'host' },
          attempts,
          ...(outcome.switched ? { switched: outcome.switched } : {}),
          ...(outcome.ok
            ? {
                found: {
                  added: outcome.added,
                  maybe: outcome.maybe,
                  skipped: outcome.skipped,
                },
              }
            : { error: outcome.error }),
        },
        new Date(outcome.at)
      ),
  }
}

/** A line for the run history when a collection goes to the other CLI */
const switchNote = (switched: Switch, to: OwnCli) =>
  `${switchWords(switched)}${
    switched.until
      ? ` until ${new Date(switched.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : ''
  }, so ${CLI_NAMES[to]} collected.`

/**
 * Collect now on the Todo screen: runs one collection at a time on the CLI
 * that does Pacenote's own work, the other one when it cannot (own-ai.ts),
 * and keeps its progress and how the last one ended, for the screen to show.
 * Each collection is recorded as a run as it goes.
 */
export class TaskCollector extends EventEmitter<{ change: [TasksCollect] }> {
  private child?: ChildProcess
  private current: TasksCollect = {}
  private cancelled = false
  private readonly ai: OwnAi

  constructor(
    private readonly options: {
      launch: () => McpLaunch
      /**
       * PATH from the login shell, so the CLIs are found when the app starts
       * from Finder
       */
      toolPath: () => string
      /** Where the CLI runs: the data folder, with no project settings */
      cwd: string
      /** Which CLI collects, and the other when it cannot */
      ai?: OwnAi
      /** The CLIs' commands (CLAUDE_BIN, CODEX_BIN) */
      bins?: () => Partial<Bins>
      /** Your codex model and reasoning effort */
      codex?: () => CodexDefaults
      /** Starts the run that records a collection */
      recorder?: (startedAt: Date, cli: OwnCli) => CollectionRecorder
      /** How the last one ended, from the history, so the screen has it */
      last?: CollectOutcome
      /** For tests: the command in place of the CLI's */
      command?: (cli: OwnCli) => [string, string[]]
      timeoutMs?: number
      now?: () => Date
    }
  ) {
    super()
    this.ai =
      options.ai ?? new OwnAi({ chosen: () => 'claude', fallback: () => false })
    // The history keeps the error alone
    const last = options.last
    if (last)
      this.current = {
        last:
          !last.ok && Object.values(SIGNED_OUT).includes(last.error)
            ? { ...last, signedOut: true }
            : last,
      }
  }

  get state(): TasksCollect {
    return this.current
  }

  async run(): Promise<CollectOutcome> {
    if (this.child || this.current.running) {
      const running = this.current.running
      return {
        at: running?.startedAt ?? this.now(),
        ok: false,
        error: 'A collection is already running.',
      }
    }
    this.cancelled = false
    const startedAt = this.now()
    this.set({ last: this.current.last, running: { startedAt, reads: 0 } })
    let recorder: CollectionRecorder | undefined
    let attempts = 0
    const ran = await this.ai.run(
      (cli, switched) => {
        attempts += 1
        recorder ??= this.keep(() =>
          this.options.recorder?.(new Date(startedAt), cli)
        )
        if (switched)
          this.keep(() =>
            recorder?.event({
              kind: 'note',
              at: this.now(),
              text: switchNote(switched, cli),
            })
          )
        return this.attempt(cli, startedAt, recorder, switched)
      },
      (outcome) =>
        !outcome.ok && outcome.unable && !this.cancelled
          ? { unable: outcome.unable, error: outcome.error }
          : undefined
    )
    // Only background work waits out a rest; this always runs.
    const last: CollectOutcome =
      'resting' in ran
        ? { at: this.now(), ok: false, error: 'The collection did not start.' }
        : {
            ...ran.result,
            by: ran.by,
            ...(ran.switched ? { switched: ran.switched } : {}),
          }
    this.set({ last })
    this.keep(() => recorder?.finish(last, attempts))
    return last
  }

  /** One collection on a CLI, to its end */
  private attempt(
    cli: OwnCli,
    startedAt: string,
    recorder: CollectionRecorder | undefined,
    switched?: Switch
  ): Promise<CollectOutcome> {
    const stream = new CollectStream(SOURCE_IDS, cli)
    const steps = new CollectionEvents(cli)
    this.set({
      last: this.current.last,
      running: {
        startedAt,
        reads: 0,
        by: cli,
        ...(switched ? { switched } : {}),
      },
    })
    return new Promise((resolve) => {
      let settled = false
      let buffer = ''
      let stderr = ''
      const finish = (fallback?: string, unable?: Unable) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.child?.kill('SIGTERM')
        this.child = undefined
        resolve(stream.outcome(this.now(), fallback, stderr, unable))
      }
      const bin = this.options.bins?.()[cli]?.trim() || cli
      const [command, args] =
        this.options.command?.(cli) ??
        collectCommand(this.options.launch(), {
          cli,
          bin,
          codex: this.options.codex?.(),
        })
      const input = collectInput(cli)
      const child = spawn(command, args, {
        cwd: this.options.cwd,
        env: { ...process.env, PATH: this.options.toolPath() },
        stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      })
      this.child = child
      if (input !== undefined) {
        child.stdin?.on('error', () => undefined)
        child.stdin?.end(input)
      }
      const timeoutMs = this.options.timeoutMs ?? TIMEOUT_MS
      const timer = setTimeout(
        () =>
          finish(
            `The collection did not finish in ${Math.round(timeoutMs / 60_000)} minutes.`
          ),
        timeoutMs
      )
      child.on('error', (error) =>
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? finish(
              `Collecting needs ${CLI_NAMES[cli]}, signed in, with its ${sourceNames()} connector: ${cli} is not on this Mac.`,
              'missing'
            )
          : finish(error.message)
      )
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      const read = (line: string) => {
        const before = stream.reads
        stream.push(line)
        if (recorder)
          for (const step of steps.from(line, this.now()))
            this.keep(() => recorder.event(step))
        const running = this.current.running
        if (stream.reads !== before && running)
          this.set({
            ...this.current,
            running: { ...running, reads: stream.reads },
          })
      }
      child.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let end: number
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 1)
          read(line)
        }
      })
      child.on('close', (code) => {
        if (buffer) read(buffer)
        finish(
          this.cancelled
            ? STOPPED
            : code !== 0 && !stream.ended
              ? firstLine(stderr) || `${cli} exited with code ${code}.`
              : undefined
        )
      })
    })
  }

  cancel(): void {
    if (!this.child) return
    this.cancelled = true
    this.child.kill('SIGTERM')
  }

  /** History that cannot be written never stops a collection */
  private keep<T>(write: () => T): T | undefined {
    try {
      return write()
    } catch {
      return undefined
    }
  }

  private set(state: TasksCollect): void {
    this.current = state
    this.emit('change', state)
  }

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString()
  }
}
