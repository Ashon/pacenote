import { execFile } from 'node:child_process'
import { redactSecrets } from '../../../src/broker/redact.js'
import type { SessionItem } from '../../../src/tasks/types.js'
import { stepLine, type Session } from './handoff.js'

/**
 * opencode's sessions, for the tasks continued in it: opencode keeps them in
 * its own service rather than in files, so Pacenote asks its CLI (opencode
 * session list, session export). A session Pacenote opened is found by the
 * marker in its first message, as Codex's are; when each last wrote is kept
 * here for the screen, which cannot wait on the CLI.
 */

export type RunCli = (
  args: string[],
  cwd: string
) => Promise<{ code: number; stdout: string }>

interface ListedSession {
  id: string
  created: number
  updated: number
  directory?: string
}

/** What `opencode session export` gives, as far as Pacenote reads it */
interface Exported {
  messages?: {
    type?: string
    text?: string
    time?: { created?: number }
    content?: {
      type?: string
      text?: string
      name?: string
      state?: { input?: unknown }
    }[]
  }[]
}

const ITEM_CHARS = 2000
/** How often the sessions are looked through, at most */
const REFRESH_MS = 10_000
/** How long a session Pacenote opened is looked for */
const LOOK_MS = 24 * 60 * 60_000

export class OpencodeSessions {
  /** When each session last wrote, as opencode said last */
  private readonly active = new Map<string, string>()
  private refreshing?: Promise<void>
  private refreshedAt = 0

  constructor(
    private readonly options: {
      /** opencode's command (OPENCODE_BIN), and the PATH it runs with */
      bin: () => string
      env: () => NodeJS.ProcessEnv
      /** For tests */
      run?: RunCli
      now?: () => number
    }
  ) {}

  /** When a session last wrote, once it has been looked at */
  activeAt(session: string): string | undefined {
    return this.active.get(session)
  }

  /**
   * In the background, at most every 10 seconds: finds the sessions not found
   * yet among the entries (found is told each), and when each found one last
   * wrote
   */
  refreshSoon(
    entries: readonly Session[],
    found: (entry: Session, session: string) => void
  ): Promise<void> {
    const now = this.now()
    if (this.refreshing || now - this.refreshedAt < REFRESH_MS)
      return this.refreshing ?? Promise.resolve()
    this.refreshedAt = now
    this.refreshing = this.refresh(entries, found).finally(() => {
      this.refreshing = undefined
    })
    return this.refreshing
  }

  private async refresh(
    entries: readonly Session[],
    found: (entry: Session, session: string) => void
  ): Promise<void> {
    const ours = entries.filter((entry) => entry.tool === 'opencode')
    const folders = [...new Set(ours.map((entry) => entry.cwd))]
    const listed = new Map(
      await Promise.all(
        folders.map(async (cwd) => [cwd, await this.list(cwd)] as const)
      )
    )
    for (const entry of ours) {
      const sessions = listed.get(entry.cwd) ?? []
      let session = entry.session
      if (!session && this.now() - Date.parse(entry.startedAt) <= LOOK_MS) {
        session = await this.find(entry, sessions)
        if (session) found(entry, session)
      }
      const listedOne = sessions.find((each) => each.id === session)
      if (session && listedOne)
        this.active.set(session, new Date(listedOne.updated).toISOString())
    }
  }

  /**
   * The session Pacenote opened for an entry: one in its folder started since,
   * whose first message has the entry's marker
   */
  private async find(
    entry: Session,
    sessions: readonly ListedSession[]
  ): Promise<string | undefined> {
    const marker = `[pacenote-task:${entry.id}]`
    const since = Date.parse(entry.startedAt) - 60_000
    const candidates = sessions
      .filter((each) => each.created >= since)
      .slice(0, 5)
    for (const candidate of candidates) {
      const first = (
        await this.export(candidate.id, entry.cwd)
      )?.messages?.find((message) => message.type === 'user')
      if (first?.text?.includes(marker)) return candidate.id
    }
    return undefined
  }

  /** A session as turns and steps, the newest 300, secrets redacted */
  async log(entry: Session): Promise<SessionItem[] | undefined> {
    if (!entry.session) return undefined
    const exported = await this.export(entry.session, entry.cwd)
    if (!exported) return undefined
    const items: SessionItem[] = []
    const push = (item: SessionItem) => {
      const text = redactSecrets(item.text.trim()).slice(0, ITEM_CHARS)
      if (text) items.push({ ...item, text })
    }
    for (const message of exported.messages ?? []) {
      const at = message.time?.created
        ? new Date(message.time.created).toISOString()
        : undefined
      if (message.type === 'user') {
        push({ role: 'user', text: message.text ?? '', at })
        continue
      }
      if (message.type !== 'assistant') continue
      const said: string[] = []
      for (const part of message.content ?? []) {
        if (part.type === 'text' && part.text) said.push(part.text)
        if (part.type === 'tool')
          push({
            role: 'tool',
            name: String(part.name ?? ''),
            text: stepLine(part.state?.input) || String(part.name ?? ''),
            at,
          })
      }
      if (said.length > 0)
        push({ role: 'assistant', text: said.join('\n'), at })
    }
    return items.slice(-300)
  }

  private async list(cwd: string): Promise<ListedSession[]> {
    const result = await this.run(
      ['session', 'list', '--format', 'json', '-n', '20'],
      cwd
    ).catch(() => undefined)
    if (!result || result.code !== 0) return []
    try {
      const sessions = JSON.parse(result.stdout) as ListedSession[]
      return Array.isArray(sessions)
        ? sessions.toSorted((a, b) => b.created - a.created)
        : []
    } catch {
      return []
    }
  }

  private async export(id: string, cwd: string): Promise<Exported | undefined> {
    if (!/^[\w-]+$/.test(id)) return undefined
    const result = await this.run(['session', 'export', id], cwd).catch(
      () => undefined
    )
    if (!result || result.code !== 0) return undefined
    try {
      return JSON.parse(result.stdout) as Exported
    } catch {
      return undefined
    }
  }

  private run(args: string[], cwd: string) {
    if (this.options.run) return this.options.run(args, cwd)
    return new Promise<{ code: number; stdout: string }>((resolve) => {
      execFile(
        this.options.bin(),
        args,
        {
          cwd,
          env: this.options.env(),
          timeout: 20_000,
          maxBuffer: 32 << 20,
        },
        (error, stdout) =>
          resolve({ code: error ? 1 : 0, stdout: String(stdout) })
      )
    })
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }
}
