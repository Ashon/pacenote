import { open, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { codexLogs } from '../../../src/tasks/folders.js'
import type { WorkTool } from '../../../src/tasks/types.js'

/**
 * The Claude Code and Codex sessions on this Mac, from their own logs, as
 * much of each as tells whose work it was: its folder, the git branches it
 * was on, what you typed (not what the tools read or answered), and the tasks
 * it named to Pacenote's task tools. Logs only grow, so each is read once and
 * then from where it was left; a log cut shorter is read again.
 */

/** How far back sessions are kept: the last two weeks' */
const SESSION_WINDOW_MS = 14 * 86_400_000

/** What you typed in a session, at most this many, each cut this short */
const PROMPTS = 300
const PROMPT_CHARS = 1_000
const CHUNK = 4 * 1024 * 1024

export interface SessionSummary {
  tool: WorkTool
  file: string
  session: string
  cwd: string
  startedAt: string
  /** When it last wrote to its log */
  lastAt: string
  /** The git branches it was on, in the order it was first on each */
  branches: string[]
  /** The branch it was on last */
  branch?: string
  /** What you typed, oldest first */
  prompts: { at?: string; text: string }[]
  /** The tasks it named to Pacenote's task_context or close_task */
  taskRefs: string[]
}

type Reading = Omit<SessionSummary, 'session' | 'cwd' | 'startedAt'> & {
  session?: string
  cwd?: string
  startedAt?: string
}

interface FileState {
  size: number
  mtimeMs: number
  /** Where reading goes on: after the last whole line read */
  offset: number
  summary: Reading
}

const PACENOTE_TOOL = /pacenote[\W_]+(task_context|close_task)/

const field = (line: string, name: string): string | undefined => {
  const match = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(
    line
  )
  if (!match) return undefined
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return undefined
  }
}

/** A message's text: as written, or its parts of these types */
export function textOf(
  content: unknown,
  /** What you typed, unless told otherwise */
  types: readonly string[] = ['text', 'input_text']
): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part: { type?: string; text?: string }) =>
      part.type && types.includes(part.type) ? (part.text ?? '') : ''
    )
    .filter(Boolean)
    .join('\n')
}

function addPrompt(summary: Reading, text: string, at?: string) {
  const trimmed = text.trim()
  if (!trimmed || summary.prompts.length >= PROMPTS) return
  summary.prompts.push({ at, text: trimmed.slice(0, PROMPT_CHARS) })
}

function onBranch(summary: Reading, branch: string | undefined) {
  if (!branch) return
  summary.branch = branch
  if (!summary.branches.includes(branch)) summary.branches.push(branch)
}

/** One line of a Claude Code transcript */
function claudeLine(summary: Reading, line: string) {
  summary.session ??= field(line, 'sessionId')
  summary.cwd ??= field(line, 'cwd')
  summary.startedAt ??= field(line, 'timestamp')
  onBranch(summary, field(line, 'gitBranch'))
  const typed =
    line.includes('"type":"user"') &&
    !line.includes('"tool_result"') &&
    !line.includes('"isMeta":true')
  const tools = line.includes('"tool_use"') && PACENOTE_TOOL.test(line)
  if (!typed && !tools) return
  let event: {
    type?: string
    timestamp?: string
    message?: { content?: unknown }
  }
  try {
    event = JSON.parse(line) as typeof event
  } catch {
    return
  }
  if (event.type === 'user') {
    addPrompt(summary, textOf(event.message?.content), event.timestamp)
    return
  }
  const content = event.message?.content
  if (event.type !== 'assistant' || !Array.isArray(content)) return
  for (const block of content as {
    type?: string
    name?: string
    input?: { task?: unknown }
  }[])
    if (
      block.type === 'tool_use' &&
      PACENOTE_TOOL.test(String(block.name)) &&
      typeof block.input?.task === 'string'
    )
      summary.taskRefs.push(block.input.task)
}

/** One line of a Codex rollout */
function codexLine(summary: Reading, line: string) {
  const meta = line.includes('"session_meta"')
  const message =
    line.includes('"response_item"') && line.includes('"role":"user"')
  const tools = line.includes('"function_call"') && PACENOTE_TOOL.test(line)
  if (!meta && !message && !tools) {
    summary.startedAt ??= field(line, 'timestamp')
    return
  }
  let event: {
    type?: string
    timestamp?: string
    payload?: {
      type?: string
      id?: string
      cwd?: string
      timestamp?: string
      git?: { branch?: string }
      role?: string
      content?: unknown
      name?: string
      arguments?: string
    }
  }
  try {
    event = JSON.parse(line) as typeof event
  } catch {
    return
  }
  const payload = event.payload
  summary.startedAt ??= event.timestamp ?? payload?.timestamp
  if (!payload) return
  if (event.type === 'session_meta') {
    summary.session ??= payload.id
    summary.cwd ??= payload.cwd
    onBranch(summary, payload.git?.branch)
  } else if (payload.type === 'message' && payload.role === 'user') {
    const text = textOf(payload.content)
    // Codex's own context (environment, instructions) is not what you typed.
    if (!/^<(environment_context|user_instructions)>/.test(text.trim()))
      addPrompt(summary, text, event.timestamp)
  } else if (
    payload.type === 'function_call' &&
    PACENOTE_TOOL.test(String(payload.name))
  ) {
    try {
      const task = (JSON.parse(String(payload.arguments)) as { task?: unknown })
        .task
      if (typeof task === 'string') summary.taskRefs.push(task)
    } catch {
      // Arguments that are not JSON
    }
  }
}

export class SessionIndex {
  private readonly files = new Map<string, FileState>()
  /** The sessions by id, the first read of each; made again once one changes */
  private byId?: Map<string, SessionSummary>
  private refreshing?: Promise<void>

  constructor(private readonly options: { home: string; windowMs?: number }) {}

  /** Reads what the logs gained since last time; one refresh at a time */
  refresh(now = Date.now()): Promise<void> {
    this.refreshing ??= this.read(now).finally(() => {
      this.refreshing = undefined
    })
    return this.refreshing
  }

  /** The sessions read, each once it has its id and folder */
  sessions(): SessionSummary[] {
    return [...this.files.values()].flatMap(({ summary }) =>
      summary.session && summary.cwd && summary.startedAt
        ? [summary as SessionSummary]
        : []
    )
  }

  /** A session by the tool's id for it */
  session(id: string): SessionSummary | undefined {
    if (!this.byId) {
      this.byId = new Map()
      for (const summary of this.sessions())
        if (!this.byId.has(summary.session))
          this.byId.set(summary.session, summary)
    }
    return this.byId.get(id)
  }

  private async logs(since: number, now: number) {
    const found: { file: string; tool: WorkTool }[] = []
    // Claude Code: a folder per project, its sessions' logs at the top (a
    // session's subagents keep theirs in a folder of its own)
    const root = path.join(this.options.home, '.claude', 'projects')
    const projects = await readdir(root).catch(() => [])
    for (const project of projects) {
      const names = await readdir(path.join(root, project)).catch(() => [])
      for (const name of names)
        if (name.endsWith('.jsonl'))
          found.push({ file: path.join(root, project, name), tool: 'claude' })
    }
    for (const file of codexLogs(this.options.home, since, now))
      found.push({ file, tool: 'codex' })
    return found
  }

  private async read(now: number) {
    const since = now - (this.options.windowMs ?? SESSION_WINDOW_MS)
    const seen = new Set<string>()
    for (const { file, tool } of await this.logs(since, now)) {
      const info = await stat(file).catch(() => undefined)
      if (!info || info.mtimeMs < since) continue
      seen.add(file)
      let state = this.files.get(file)
      if (state && state.size === info.size && state.mtimeMs === info.mtimeMs)
        continue
      if (!state || info.size < state.offset) {
        state = {
          size: 0,
          mtimeMs: 0,
          offset: 0,
          summary: {
            tool,
            file,
            lastAt: '',
            branches: [],
            prompts: [],
            taskRefs: [],
          },
        }
        this.files.set(file, state)
        this.byId = undefined
      }
      await this.readFrom(file, state, info.size)
      state.size = info.size
      state.mtimeMs = info.mtimeMs
      state.summary.lastAt = new Date(info.mtimeMs).toISOString()
    }
    for (const file of this.files.keys())
      if (!seen.has(file)) {
        this.files.delete(file)
        this.byId = undefined
      }
  }

  /** Reads whole lines from where it was left up to size */
  private async readFrom(file: string, state: FileState, size: number) {
    const handle = await open(file, 'r').catch(() => undefined)
    if (!handle) return
    const line = state.summary.tool === 'claude' ? claudeLine : codexLine
    const buffer = Buffer.allocUnsafe(Math.min(CHUNK, size - state.offset))
    try {
      while (state.offset < size) {
        const length = Math.min(buffer.length, size - state.offset)
        const { bytesRead } = await handle.read(buffer, 0, length, state.offset)
        if (bytesRead === 0) break
        const end = buffer.lastIndexOf(10, bytesRead - 1)
        if (end < 0) {
          // A line longer than a chunk: read it whole, once it has ended
          if (bytesRead < length || state.offset + length >= size) break
          const whole = await this.wholeLine(handle, state.offset, size)
          if (!whole) break
          line(state.summary, whole.text)
          this.byId = undefined
          state.offset += whole.bytes
          continue
        }
        for (const text of buffer.subarray(0, end).toString('utf8').split('\n'))
          if (text) line(state.summary, text)
        this.byId = undefined
        state.offset += end + 1
        // Others' turn between chunks: the app stays responsive.
        await setImmediate()
      }
    } finally {
      await handle.close()
    }
  }

  private async wholeLine(
    handle: Awaited<ReturnType<typeof open>>,
    from: number,
    size: number
  ): Promise<{ text: string; bytes: number } | undefined> {
    const parts: Buffer[] = []
    let at = from
    while (at < size) {
      const length = Math.min(CHUNK, size - at)
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, at)
      if (bytesRead === 0) return undefined
      const end = buffer.subarray(0, bytesRead).indexOf(10)
      if (end >= 0) {
        parts.push(buffer.subarray(0, end))
        return {
          text: Buffer.concat(parts).toString('utf8'),
          bytes: at + end + 1 - from,
        }
      }
      parts.push(buffer.subarray(0, bytesRead))
      at += bytesRead
    }
    return undefined
  }
}
