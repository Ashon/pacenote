import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { McpLaunch } from '../../../src/history/mcp-clients.js'
import type { HistoryStore } from '../../../src/history/recorder.js'
import type { RunEvent } from '../../../src/history/types.js'
import {
  claudeResultUsage,
  type TokenUsage,
} from '../../../src/history/usage.js'
import { claudeLineToEvents } from '../../../src/reasoners/claude.js'
import {
  readTools,
  SOURCE_IDS,
  SOURCES,
  sourceNames,
  sourceOfTool,
  writeTools,
  type SourceId,
} from '../../../src/tasks/sources.js'
import type { CollectOutcome, TasksCollect } from '../../../src/tasks/types.js'

const TASK_TOOLS = [
  'collect_context',
  'add_tasks',
  'update_task',
  'close_task',
  'my_tasks',
].map((name) => `mcp__pacenote__${name}`)
const ADD_TASKS = 'mcp__pacenote__add_tasks'
const TIMEOUT_MS = 10 * 60_000
/** What to do when the sources' connectors are not in Claude Code */
const noConnector = (sources: readonly SourceId[]) =>
  `Claude Code has no ${sourceNames(sources)} connector. Connect ${sourceNames(sources)} in claude.ai's Settings > Connectors, then collect again.`
const STOPPED = 'Stopped.'
const SIGNED_OUT =
  'Claude Code is not signed in. Run claude in a terminal and sign in, then collect again.'

/**
 * The command for one collection: Claude Code, headless, running Pacenote's
 * collect_tasks prompt with only its sources' read tools (sources.ts) and
 * Pacenote's task tools, every source's tools that write denied.
 * - Only project settings load (none, in the data folder), so the user's own
 *   Claude Code permissions, plugins, CLAUDE.md and MCP servers stay out; the
 *   claude.ai connectors still load.
 * - Pacenote's server comes from this app (--mcp-config), so Claude Code does
 *   not need it added.
 * - The only built-in tool is ToolSearch, to load the MCP tools.
 */
export function collectCommand(
  launch: McpLaunch,
  sources: readonly SourceId[] = SOURCE_IDS
): [string, string[]] {
  return [
    'claude',
    [
      '-p',
      '/mcp__pacenote__collect_tasks',
      '--setting-sources',
      'project',
      '--mcp-config',
      JSON.stringify({
        mcpServers: { pacenote: { type: 'stdio', ...launch } },
      }),
      '--tools',
      'ToolSearch',
      '--permission-mode',
      'default',
      '--allowedTools',
      ...TASK_TOOLS,
      ...readTools(sources),
      '--disallowedTools',
      ...writeTools(),
      '--no-session-persistence',
      '--output-format',
      'stream-json',
      '--verbose',
    ],
  ]
}

interface StreamEvent {
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

/**
 * Reads Claude Code's stream-json output of a collection: how many times it
 * read its sources, what add_tasks answered, how the run ended and the tokens
 * it spent.
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

  constructor(private readonly sources: readonly SourceId[] = SOURCE_IDS) {}

  push(line: string): void {
    let event: StreamEvent
    try {
      event = JSON.parse(line) as StreamEvent
    } catch {
      return
    }
    if (event.type === 'system' && event.subtype === 'init') {
      this.missing = this.sources.filter((id) => {
        const server = event.mcp_servers?.find(
          (entry) => entry.name === SOURCES[id].connector.server
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
        if (block.name === ADD_TASKS) this.addCall = block.id
      } else if (
        block.type === 'tool_result' &&
        block.tool_use_id === this.addCall
      ) {
        const text = textOf(block.content)
        if (block.is_error) {
          this.addError = text
          continue
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
    }
  }

  /** How the collection ended, once the process is gone */
  outcome(at: string, fallback?: string): CollectOutcome {
    const spent = this.usage
      ? { reads: this.reads, usage: this.usage }
      : { reads: this.reads }
    if (this.added)
      return {
        at,
        ok: true,
        added: this.added.filter((task) => task.confidence === 'sure').length,
        maybe: this.added.filter((task) => task.confidence !== 'sure').length,
        skipped: this.skipped,
        ...spent,
      }
    // Why the run itself failed comes first: signed out, there are no
    // connectors at all.
    const failed =
      this.ended && !this.ended.ok ? firstLine(this.ended.text) : ''
    const error =
      this.addError ??
      fallback ??
      (/not logged in|\/login|invalid api key/i.test(failed)
        ? SIGNED_OUT
        : failed || undefined) ??
      (this.missing.length && this.reads === 0
        ? noConnector(this.missing)
        : undefined) ??
      (firstLine(this.ended?.text) ||
        'The collection stopped before it finished.')
    return { at, ok: false, error, ...spent }
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
 * claude.ai connector's tools were asked and returned. Its tool calls stay
 * (which tool, when, how long); Pacenote's own tools keep their arguments and
 * answers.
 */
export class CollectionEvents {
  private readonly connectorCalls = new Set<string>()

  from(line: string, at?: string): RunEvent[] {
    const kept: RunEvent[] = []
    for (const event of claudeLineToEvents(line, at)) {
      if (event.kind === 'message' || event.kind === 'reasoning') continue
      if (event.kind !== 'tool') {
        kept.push(event)
        continue
      }
      if (event.server.startsWith('claude_ai_'))
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
  finish(outcome: CollectOutcome): void
}

/**
 * A collection's run in the history: Claude Code on this Mac, started by
 * Collect now. It ends succeeded when add_tasks answered, interrupted when
 * stopped, failed otherwise.
 */
export function recordCollection(
  history: Pick<HistoryStore, 'startCollection'>,
  startedAt: Date
): CollectionRecorder {
  const run = history.startCollection(
    { trigger: 'now', backend: { reasoner: 'claude', sandbox: 'host' } },
    startedAt
  )
  return {
    event: (event) => run.event(event),
    finish: (outcome) =>
      run.finish(
        outcome.ok
          ? 'succeeded'
          : outcome.error === STOPPED
            ? 'interrupted'
            : 'failed',
        outcome.ok
          ? {
              reads: outcome.reads,
              found: {
                added: outcome.added,
                maybe: outcome.maybe,
                skipped: outcome.skipped,
              },
            }
          : { reads: outcome.reads, error: outcome.error },
        new Date(outcome.at)
      ),
  }
}

/**
 * Collect now on the Todo screen: runs one collection at a time in Claude
 * Code (collectCommand) and keeps its progress and how the last one ended, for
 * the screen to show. Each collection is recorded as a run as it goes.
 */
export class TaskCollector extends EventEmitter<{ change: [TasksCollect] }> {
  private child?: ChildProcess
  private current: TasksCollect = {}
  private cancelled = false

  constructor(
    private readonly options: {
      launch: () => McpLaunch
      /**
       * PATH from the login shell, so claude is found when the app starts from
       * Finder
       */
      toolPath: () => string
      /** Where Claude Code runs: the data folder, with no project settings */
      cwd: string
      /** Starts the run that records a collection */
      recorder?: (startedAt: Date) => CollectionRecorder
      /** How the last one ended, from the history, so the screen has it */
      last?: CollectOutcome
      /** For tests: the command in place of claude */
      command?: [string, string[]]
      timeoutMs?: number
      now?: () => Date
    }
  ) {
    super()
    if (options.last) this.current = { last: options.last }
  }

  get state(): TasksCollect {
    return this.current
  }

  run(): Promise<CollectOutcome> {
    if (this.child) {
      const running = this.current.running
      return Promise.resolve({
        at: running?.startedAt ?? this.now(),
        ok: false,
        error: 'A collection is already running.',
      })
    }
    this.cancelled = false
    const stream = new CollectStream()
    const startedAt = this.now()
    this.set({ last: this.current.last, running: { startedAt, reads: 0 } })
    const steps = new CollectionEvents()
    const recorder = this.keep(() =>
      this.options.recorder?.(new Date(startedAt))
    )

    return new Promise((resolve) => {
      let settled = false
      let buffer = ''
      let stderr = ''
      const finish = (fallback?: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.child?.kill('SIGTERM')
        this.child = undefined
        const last = stream.outcome(this.now(), fallback)
        this.set({ last })
        this.keep(() => recorder?.finish(last))
        resolve(last)
      }
      const [command, args] =
        this.options.command ?? collectCommand(this.options.launch())
      const child = spawn(command, args, {
        cwd: this.options.cwd,
        env: { ...process.env, PATH: this.options.toolPath() },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.child = child
      const timeoutMs = this.options.timeoutMs ?? TIMEOUT_MS
      const timer = setTimeout(
        () =>
          finish(
            `The collection did not finish in ${Math.round(timeoutMs / 60_000)} minutes.`
          ),
        timeoutMs
      )
      child.on('error', (error) =>
        finish(
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? `Collecting needs Claude Code, signed in, with its ${sourceNames()} connector: claude is not on this Mac.`
            : error.message
        )
      )
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let end: number
        while ((end = buffer.indexOf('\n')) >= 0) {
          const before = stream.reads
          const line = buffer.slice(0, end)
          stream.push(line)
          buffer = buffer.slice(end + 1)
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
      })
      child.on('close', (code) => {
        if (buffer) {
          stream.push(buffer)
          if (recorder)
            for (const step of steps.from(buffer, this.now()))
              this.keep(() => recorder.event(step))
        }
        finish(
          this.cancelled
            ? STOPPED
            : code !== 0 && !stream.ended
              ? firstLine(stderr) || `claude exited with code ${code}.`
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
