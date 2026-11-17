import type { WorkTool } from '../tasks/types.js'
import { MINUTE } from '../time.js'
import type {
  SessionGroup,
  SessionRow,
  SessionState,
  SessionsView,
  SessionWhere,
} from './types.js'

/**
 * The Sessions screen from what the desktop app read on this Mac: the Claude
 * Code sessions Claude Code says are open, the sessions' logs, their folders'
 * repositories, your areas (You) and the tasks they are linked to. Pure, so
 * it is tested without the tools.
 */

/** A session that stopped this recently is your turn; longer ago, quiet */
export const TURN_MS = 30 * MINUTE
/** Told from its log alone: one that wrote this recently is working */
export const WORKING_MS = MINUTE
/** What you typed, at most this many on a row, newest first */
const TYPED = 3
const TYPED_CHARS = 200
const TITLE_CHARS = 80

/** A Claude Code session open now, as claude agents lists it */
export interface OpenAgent {
  session: string
  cwd: string
  /** Its name in Claude Code: yours, or one it made up */
  name?: string
  /** On a turn */
  busy: boolean
  /** When it started, for one with no log yet */
  startedAt?: string
  where: SessionWhere
  terminal?: string
}

/** A session as its log tells it (session-index.ts) */
export interface LoggedSession {
  tool: WorkTool
  session: string
  cwd: string
  startedAt: string
  lastAt: string
  branch?: string
  prompts: { at?: string; text: string }[]
  /** The title you gave it */
  title?: string
  /** The title the tool gave it */
  autoTitle?: string
  /** Claude Code: where it ran (cli, claude-desktop, sdk-cli) */
  entrypoint?: string
  /** Codex: the app that ran it (Codex Desktop) and how (cli, exec) */
  originator?: string
  source?: string
}

export interface SessionsInput {
  now: number
  /** When today began on this Mac */
  dayStart: number
  /** Claude Code's open sessions; none when it could not list them */
  agents?: OpenAgent[]
  logged: LoggedSession[]
  /** Each folder's repository, from its git folder and origin remote */
  repos: ReadonlyMap<string, { id: string; name?: string } | undefined>
  /** Your areas (You), each with its repositories (owner/name) */
  areas: { id: string; name: string; repos: string[] }[]
  /** The task each session is linked to, by the tool's session id */
  tasks: ReadonlyMap<string, { id: string; title: string }>
  /** Where a session ran while it was open, for one that ended since */
  seen?: ReadonlyMap<string, { where: SessionWhere; terminal?: string }>
}

/**
 * What you typed, as a line to show: a command as you typed it, the tool's
 * own notes and interruptions left out
 */
export function typedLine(text: string): string | undefined {
  // A note the tool added, to its end or to where the prompt was cut short
  const plain = text
    .replace(/<system-reminder>[\s\S]*?(<\/system-reminder>|$)/g, '')
    .replace(/^<artifact-content-authored-by-others\/>/, '')
    .trim()
  const command = /<command-name>([^<]*)<\/command-name>/.exec(plain)?.[1]
  if (command) {
    const args = /<command-args>([^<]*)<\/command-args>/.exec(plain)?.[1]
    return oneLine(`${command.trim()} ${args?.trim() ?? ''}`)
  }
  const bash = /^<bash-input>([\s\S]*?)<\/bash-input>/.exec(plain)?.[1]
  if (bash !== undefined) return oneLine(`!${bash}`)
  if (
    !plain ||
    /^<(local-command|bash-std|command-message|task-notification)/.test(
      plain
    ) ||
    plain.startsWith('[Request interrupted') ||
    plain.startsWith('Caveat: The messages below') ||
    // Where a session went on after its context was summed up
    plain.startsWith('This session is being continued')
  )
    return undefined
  return oneLine(plain)
}

const oneLine = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line ? line.slice(0, TYPED_CHARS) : undefined
}

const baseName = (folder: string) =>
  folder.replace(/\/+$/, '').split('/').pop() || folder

/** Codex's runs that are not yours to see: exec runs and subagents */
const codexRun = (s: LoggedSession) =>
  s.originator === 'codex_exec' ||
  s.source === 'exec' ||
  s.source === 'subagent'

/** A session's state from its log alone: how long ago it wrote */
const stateByLog = (now: number, lastAt: string): SessionState => {
  const quiet = now - Date.parse(lastAt)
  return quiet <= WORKING_MS ? 'working' : quiet <= TURN_MS ? 'turn' : 'quiet'
}

const STATE_ORDER: Record<SessionState, number> = {
  working: 0,
  turn: 1,
  quiet: 2,
  ended: 3,
}

export function sessionsView(
  input: SessionsInput
): Omit<SessionsView, 'on' | 'found'> {
  const { now, dayStart, agents, repos, tasks } = input
  const today = (s: LoggedSession) => Date.parse(s.lastAt) >= dayStart
  const byId = new Map(
    input.logged.map((s) => [`${s.tool}:${s.session}`, s] as const)
  )
  const row = (
    tool: WorkTool,
    session: string,
    rest: Pick<SessionRow, 'where' | 'terminal' | 'state'> & {
      cwd: string
      name?: string
      startedAt?: string
    }
  ): SessionRow => {
    const logged = byId.get(`${tool}:${session}`)
    const typed = (logged?.prompts ?? []).flatMap((p) => {
      const text = typedLine(p.text)
      return text ? [{ at: p.at, text }] : []
    })
    const since = rest.startedAt ?? new Date(now).toISOString()
    const cwd = logged?.cwd ?? rest.cwd
    return {
      id: `${tool}:${session}`,
      tool,
      session,
      title: (
        logged?.title ||
        logged?.autoTitle ||
        rest.name ||
        typed[0]?.text ||
        baseName(cwd)
      ).slice(0, TITLE_CHARS),
      where: rest.where,
      ...(rest.terminal ? { terminal: rest.terminal } : {}),
      state: rest.state,
      lastAt: logged?.lastAt ?? since,
      startedAt: logged?.startedAt ?? since,
      cwd,
      ...(logged?.branch ? { branch: logged.branch } : {}),
      ...(repos.get(cwd)?.name ? { repo: repos.get(cwd)!.name } : {}),
      typed: typed.slice(-TYPED).reverse(),
      ...(tasks.get(session) ? { task: tasks.get(session) } : {}),
    }
  }

  const open: SessionRow[] = []
  const ended: SessionRow[] = []
  /** The sessions on a row already: a session's log may be in two files */
  const openIds = new Set<string>()
  if (agents)
    for (const agent of agents) {
      if (openIds.has(`claude:${agent.session}`)) continue
      openIds.add(`claude:${agent.session}`)
      const logged = byId.get(`claude:${agent.session}`)
      const last = logged?.lastAt ?? agent.startedAt
      const quiet = last ? now - Date.parse(last) : 0
      open.push(
        row('claude', agent.session, {
          cwd: agent.cwd,
          name: agent.name,
          startedAt: agent.startedAt,
          where: agent.where,
          terminal: agent.terminal,
          state: agent.busy ? 'working' : quiet <= TURN_MS ? 'turn' : 'quiet',
        })
      )
    }
  for (const s of input.logged) {
    const id = `${s.tool}:${s.session}`
    if (openIds.has(id) || !today(s) || s.tool === 'opencode') continue
    if (s.tool === 'codex') {
      if (codexRun(s)) continue
      openIds.add(id)
      open.push(
        row('codex', s.session, {
          cwd: s.cwd,
          where: s.originator === 'Codex Desktop' ? 'codex-app' : 'terminal',
          state: stateByLog(now, s.lastAt),
        })
      )
      continue
    }
    // Claude Code could not say which are open: those that wrote today
    if (!agents) {
      openIds.add(id)
      open.push(
        row('claude', s.session, {
          cwd: s.cwd,
          where: s.entrypoint === 'claude-desktop' ? 'claude-app' : 'terminal',
          state: stateByLog(now, s.lastAt),
        })
      )
      continue
    }
    if (!s.prompts.length) continue
    openIds.add(id)
    const seen = input.seen?.get(s.session)
    ended.push(
      row('claude', s.session, {
        cwd: s.cwd,
        where:
          seen?.where ??
          (s.entrypoint === 'claude-desktop' ? 'claude-app' : 'terminal'),
        terminal: seen?.terminal,
        state: 'ended',
      })
    )
  }

  const newest = (a: SessionRow, b: SessionRow) =>
    Date.parse(b.lastAt) - Date.parse(a.lastAt)
  return {
    open: groupRows(open, input),
    ended: ended.sort(newest),
    counts: {
      open: open.length,
      working: open.filter((s) => s.state === 'working').length,
      turn: open.filter((s) => s.state === 'turn').length,
      ended: ended.length,
    },
    listed: !!agents,
  }
}

/**
 * The rows by your area, else by repository, else not in a project (last);
 * the groups by their latest activity, each working first, then your turn
 */
function groupRows(rows: SessionRow[], input: SessionsInput): SessionGroup[] {
  const groups = new Map<string, SessionGroup>()
  for (const row of rows) {
    const repo = input.repos.get(row.cwd)
    const name = repo?.name?.toLowerCase()
    const area = name
      ? input.areas.find((a) => a.repos.some((r) => r.toLowerCase() === name))
      : undefined
    const group: Omit<SessionGroup, 'sessions'> = area
      ? {
          key: `area:${area.id}`,
          name: area.name,
          ...(area.repos.length === 1 ? { repo: area.repos[0] } : {}),
        }
      : repo
        ? {
            key: `repo:${repo.id}`,
            name: repo.name
              ? baseName(repo.name)
              : baseName(repo.id.replace(/\/\.git\/?$/, '')),
            ...(repo.name ? { repo: repo.name } : {}),
          }
        : { key: 'none' }
    const kept = groups.get(group.key)
    if (kept) kept.sessions.push(row)
    else groups.set(group.key, { ...group, sessions: [row] })
  }
  const latest = (g: SessionGroup) =>
    Math.max(...g.sessions.map((s) => Date.parse(s.lastAt)))
  for (const group of groups.values())
    group.sessions.sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        Date.parse(b.lastAt) - Date.parse(a.lastAt)
    )
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.key === 'none') - Number(b.key === 'none') ||
      latest(b) - latest(a)
  )
}
