import { execFile } from 'node:child_process'
import { open, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { OpenAgent } from '../../../src/sessions/view.js'
import type { SessionWhere } from '../../../src/sessions/types.js'
import { SingleFlight } from '../../../src/single-flight.js'

/**
 * The Claude Code sessions open on this Mac, from Claude Code itself (claude
 * agents --json), and where each runs, from the process it runs under: the
 * Claude app, claude.ai (claude remote-control), or a terminal app. Codex
 * keeps no such list; its titles are in its session index.
 */

const run = promisify(execFile)

/** How long a listing is kept: the screen asks every few seconds */
const KEEP_MS = 5_000
const AGENTS_TIMEOUT_MS = 10_000
/** How far up a session's parents are looked through */
const PARENTS = 30

/** A session claude agents --json lists */
export interface AgentEntry {
  pid: number
  cwd: string
  sessionId: string
  name?: string
  /** busy: on a turn; idle: waiting */
  status?: string
  /** When it started, in milliseconds */
  startedAt?: number
  kind?: string
}

/** The sessions in claude agents --json; none from anything else */
export function parseAgents(out: string): AgentEntry[] {
  let list: unknown
  try {
    list = JSON.parse(out)
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  return list.flatMap((item: Partial<AgentEntry>) =>
    item &&
    typeof item.sessionId === 'string' &&
    typeof item.cwd === 'string' &&
    typeof item.pid === 'number'
      ? [
          {
            pid: item.pid,
            cwd: item.cwd,
            sessionId: item.sessionId,
            ...(typeof item.name === 'string' ? { name: item.name } : {}),
            ...(typeof item.status === 'string' ? { status: item.status } : {}),
            ...(typeof item.kind === 'string' ? { kind: item.kind } : {}),
            ...(typeof item.startedAt === 'number'
              ? { startedAt: item.startedAt }
              : {}),
          },
        ]
      : []
  )
}

export type Processes = Map<number, { ppid: number; command: string }>

/** ps -axo pid=,ppid=,command=, by pid */
export function parseProcesses(out: string): Processes {
  const procs: Processes = new Map()
  for (const line of out.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (match)
      procs.set(Number(match[1]), {
        ppid: Number(match[2]),
        command: match[3] ?? '',
      })
  }
  return procs
}

/** Where a session runs, and the app it runs in */
export interface RunsIn {
  where: SessionWhere
  /** A terminal app's name, as its bundle is named: "iTerm", "Ghostty" */
  terminal?: string
  /** That app's bundle, to bring it to the front */
  app?: string
}

/**
 * Where the process runs, from the first of its parents that tells: claude
 * remote-control (claude.ai), the Claude app, or an app (a terminal, an
 * editor's terminal). One under none of them (tmux, ssh) runs in a terminal.
 */
export function runsIn(pid: number, procs: Processes): RunsIn {
  let at = procs.get(pid)?.ppid
  for (let step = 0; at && at > 1 && step < PARENTS; step++) {
    const proc = procs.get(at)
    if (!proc) break
    const { command } = proc
    if (/\bclaude\b.*\bremote-control\b/.test(command)) return { where: 'web' }
    if (command.includes('/Claude.app/')) return { where: 'claude-app' }
    const bundle = /^(.*?\/([^/]+)\.app)\/Contents\//.exec(command)
    if (bundle)
      return { where: 'terminal', terminal: bundle[2], app: bundle[1] }
    at = proc.ppid
  }
  return { where: 'terminal' }
}

export type OpenClaude = OpenAgent & { app?: string }

export class OpenSessions {
  private kept?: { at: number; list: OpenClaude[] | undefined }
  private readonly listing = new SingleFlight<OpenClaude[] | undefined>()
  private warned = false

  constructor(
    private readonly options: {
      /** Claude Code's command (CLAUDE_BIN) */
      bin: () => string
      /** What it runs with: your environment, with the tools' PATH */
      env: () => NodeJS.ProcessEnv
      home: string
      warn: (message: string) => void
      /** Tests put a stand-in for running a command */
      exec?: (file: string, args: string[]) => Promise<string>
    }
  ) {}

  private exec(file: string, args: string[]): Promise<string> {
    if (this.options.exec) return this.options.exec(file, args)
    return run(file, args, {
      cwd: this.options.home,
      env: this.options.env(),
      timeout: AGENTS_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    }).then(({ stdout }) => stdout)
  }

  /**
   * The open sessions, at most a few seconds old; none when Claude Code
   * cannot list them (not on this Mac, or a version without claude agents)
   */
  list(now = Date.now()): Promise<OpenClaude[] | undefined> {
    if (this.kept && now - this.kept.at < KEEP_MS)
      return Promise.resolve(this.kept.list)
    return this.listing.run(async () => {
      const list = await this.read()
      this.kept = { at: Date.now(), list }
      return list
    })
  }

  private async read(): Promise<OpenClaude[] | undefined> {
    let agents: AgentEntry[]
    try {
      const out = await this.exec(this.options.bin(), ['agents', '--json'])
      if (!out.trim().startsWith('[')) throw new Error('no list')
      agents = parseAgents(out)
    } catch (error) {
      if (!this.warned)
        this.options.warn(
          `Claude Code could not list its open sessions (claude agents --json): ${(error as Error).message.split('\n')[0]}`
        )
      this.warned = true
      return undefined
    }
    this.warned = false
    const procs = parseProcesses(
      await this.exec('/bin/ps', ['-axo', 'pid=,ppid=,command=']).catch(
        () => ''
      )
    )
    return agents
      .filter((agent) => !agent.kind || agent.kind === 'interactive')
      .map((agent) => {
        const at = runsIn(agent.pid, procs)
        return {
          session: agent.sessionId,
          cwd: agent.cwd,
          ...(agent.name ? { name: agent.name } : {}),
          busy: agent.status === 'busy',
          ...(agent.startedAt
            ? { startedAt: new Date(agent.startedAt).toISOString() }
            : {}),
          where: at.where,
          ...(at.terminal ? { terminal: at.terminal } : {}),
          ...(at.app ? { app: at.app } : {}),
        }
      })
  }
}

/** Codex's session titles (session_index.jsonl), the latest for each */
export class CodexTitles {
  private kept?: { size: number; mtimeMs: number; titles: Map<string, string> }

  constructor(private readonly codexHome: string) {}

  async get(): Promise<Map<string, string>> {
    const file = path.join(this.codexHome, 'session_index.jsonl')
    const info = await stat(file).catch(() => undefined)
    if (!info) return new Map()
    if (this.kept?.size === info.size && this.kept.mtimeMs === info.mtimeMs)
      return this.kept.titles
    const titles = new Map<string, string>()
    const handle = await open(file, 'r').catch(() => undefined)
    if (handle)
      try {
        for (const line of (await handle.readFile('utf8')).split('\n')) {
          try {
            const entry = JSON.parse(line) as {
              id?: unknown
              thread_name?: unknown
            }
            if (
              typeof entry.id === 'string' &&
              typeof entry.thread_name === 'string' &&
              entry.thread_name.trim()
            )
              titles.set(entry.id, entry.thread_name.trim())
          } catch {
            // A line cut short
          }
        }
      } finally {
        await handle.close()
      }
    this.kept = { size: info.size, mtimeMs: info.mtimeMs, titles }
    return titles
  }
}

/**
 * Codex's sessions that wrote today, yours only (not exec runs, Pacenote's
 * among them): counted from the start of each log, for the card before
 * Sessions is on
 */
export async function codexToday(files: string[]): Promise<number> {
  let count = 0
  for (const file of files) {
    const handle = await open(file, 'r').catch(() => undefined)
    if (!handle) continue
    try {
      const buffer = Buffer.alloc(64 * 1024)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const head = buffer.subarray(0, bytesRead).toString('utf8')
      if (
        head.includes('"session_meta"') &&
        !/"originator"\s*:\s*"codex_exec"/.test(head) &&
        !/"source"\s*:\s*("exec"|\{)/.test(head)
      )
        count++
    } finally {
      await handle.close()
    }
  }
  return count
}
