import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { McpLaunch } from '../../../src/history/mcp-clients.js'
import {
  claudeResultUsage,
  type TokenUsage,
} from '../../../src/history/usage.js'
import type {
  CollectionRecord,
  CollectOutcome,
  TasksCollect,
} from '../../../src/tasks/types.js'

const SLACK = 'mcp__claude_ai_Slack__'
/** The Slack connector's tools a collection may use: reading only */
export const SLACK_READ_TOOLS = [
  'slack_search_public',
  'slack_search_public_and_private',
  'slack_search_channels',
  'slack_search_users',
  'slack_read_channel',
  'slack_read_thread',
  'slack_get_reactions',
  'slack_list_user_channels',
  'slack_list_channel_members',
  'slack_read_user_profile',
].map((name) => SLACK + name)
/** Denied outright, whatever the user's Claude Code permissions say */
export const SLACK_WRITE_TOOLS = [
  'slack_send_message',
  'slack_send_message_draft',
  'slack_schedule_message',
  'slack_add_reaction',
  'slack_create_canvas',
  'slack_update_canvas',
].map((name) => SLACK + name)
const TASK_TOOLS = [
  'collect_context',
  'add_tasks',
  'close_task',
  'my_tasks',
].map((name) => `mcp__pacenote__${name}`)
const ADD_TASKS = 'mcp__pacenote__add_tasks'
const TIMEOUT_MS = 10 * 60_000
const NO_SLACK =
  "Claude Code has no Slack connector. Connect Slack in claude.ai's Settings > Connectors, then collect again."
const SIGNED_OUT =
  'Claude Code is not signed in. Run claude in a terminal and sign in, then collect again.'

/**
 * The command for one collection: Claude Code, headless, running Pacenote's
 * collect_tasks prompt with only the Slack connector's read tools and
 * Pacenote's task tools.
 * - Only project settings load (none, in the data folder), so the user's own
 *   Claude Code permissions, plugins, CLAUDE.md and MCP servers stay out; the
 *   claude.ai connectors still load.
 * - Pacenote's server comes from this app (--mcp-config), so Claude Code does
 *   not need it added.
 * - The only built-in tool is ToolSearch, to load the MCP tools.
 */
export function collectCommand(launch: McpLaunch): [string, string[]] {
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
      ...SLACK_READ_TOOLS,
      '--disallowedTools',
      ...SLACK_WRITE_TOOLS,
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
 * read Slack, what add_tasks answered, how the run ended and the tokens it
 * spent.
 */
export class CollectStream {
  reads = 0
  /** Set once it is clear the run cannot read Slack */
  noSlack = false
  added?: { confidence?: string }[]
  skipped = 0
  addError?: string
  ended?: { ok: boolean; text: string }
  usage?: TokenUsage
  private addCall?: string

  push(line: string): void {
    let event: StreamEvent
    try {
      event = JSON.parse(line) as StreamEvent
    } catch {
      return
    }
    if (event.type === 'system' && event.subtype === 'init') {
      const slack = event.mcp_servers?.find(
        (server) => server.name === 'claude.ai Slack'
      )
      if (!slack || ['failed', 'needs-auth'].includes(slack.status))
        this.noSlack = true
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
        if (block.name?.startsWith(SLACK)) this.reads += 1
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
      (this.noSlack && this.reads === 0 ? NO_SLACK : undefined) ??
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
 * Collect now on the Tasks screen: runs one collection at a time in Claude
 * Code (collectCommand) and keeps its progress and how the last one ended, for
 * the screen to show. Each finished collection goes to record (the log in the
 * data folder).
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
      /** Keeps a finished collection (src/tasks/collections.ts) */
      record?: (entry: CollectionRecord) => void
      /** How the last one ended, from the log, so the screen has it at start */
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
        try {
          this.options.record?.({ ...last, startedAt, trigger: 'now' })
        } catch {
          // A collection the log could not keep still ends as it did.
        }
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
            ? 'Collecting needs Claude Code, signed in, with its Slack connector: claude is not on this Mac.'
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
          stream.push(buffer.slice(0, end))
          buffer = buffer.slice(end + 1)
          const running = this.current.running
          if (stream.reads !== before && running)
            this.set({
              ...this.current,
              running: { ...running, reads: stream.reads },
            })
        }
      })
      child.on('close', (code) => {
        if (buffer) stream.push(buffer)
        finish(
          this.cancelled
            ? 'Stopped.'
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

  private set(state: TasksCollect): void {
    this.current = state
    this.emit('change', state)
  }

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString()
  }
}
