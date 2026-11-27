// Relative imports, so the tests (and the root's typecheck) can load it
import type {
  SessionRow,
  SessionState,
  SessionsView,
} from '../../../../src/sessions/types.js'
import type { FolderCheck, TaskView } from '../../../../src/tasks/types.js'

/**
 * The sessions on this Mac as Todo shows them (src/sessions): each open
 * task's session, and Today's line about all of them. Plain, so tests load it.
 */

/**
 * A session on another of your Macs, by its page's id here:
 * mac:<that Mac's id>/<the session's id there>
 */
export const otherId = (mac: string, id: string) => `mac:${mac}/${id}`

/** The Mac and the session there a page's id names, for one on another Mac */
export function parseOtherId(
  id: string
): { mac: string; id: string } | undefined {
  const match = /^mac:([^/]+)\/(.+)$/.exec(id)
  return match ? { mac: match[1]!, id: match[2]! } : undefined
}

/** Another Mac's sessions, each by its page's id here (otherId) */
export function otherView(mac: string, view: SessionsView): SessionsView {
  const here = (row: SessionRow) => ({ ...row, id: otherId(mac, row.id) })
  return {
    ...view,
    open: view.open.map((group) => ({
      ...group,
      sessions: group.sessions.map(here),
    })),
    ended: view.ended.map(here),
  }
}

/** Whether a session has a page in Pacenote: Claude Code's and Codex's */
export const canOpen = (s: SessionRow) => s.tool !== 'opencode'

/**
 * Whether Pacenote can take you to where a session runs: its app, claude.ai
 * or its terminal app (not one Pacenote runs itself, nor one resting that
 * runs nowhere now)
 */
export const canShow = (s: SessionRow) =>
  s.state !== 'ended' &&
  !s.resting &&
  s.where !== 'pacenote' &&
  (s.tool === 'codex'
    ? s.where === 'codex-app'
    : s.where !== 'terminal' || !!s.terminal)

const RANK: Record<SessionState, number> = {
  working: 0,
  turn: 1,
  quiet: 2,
  ended: 3,
}

/**
 * Each task's open session on this Mac: the one working, else the one
 * waiting for you, else the latest; none while Sessions is off
 */
export function sessionsByTask(
  view: SessionsView | null | undefined
): Map<string, SessionRow> {
  const byTask = new Map<string, SessionRow>()
  if (!view?.on) return byTask
  for (const s of view.open.flatMap((group) => group.sessions)) {
    if (!s.task) continue
    const was = byTask.get(s.task.id)
    if (
      !was ||
      RANK[s.state] < RANK[was.state] ||
      (RANK[s.state] === RANK[was.state] &&
        Date.parse(s.lastAt) > Date.parse(was.lastAt))
    )
      byTask.set(s.task.id, s)
  }
  return byTask
}

/** Today's Sessions line: how many wait for you, work, or are quiet, where */
export interface SessionsLine {
  turn: number
  working: number
  quiet: number
  /** The projects they are in, the latest active first, three at most */
  groups: string[]
  /** Projects past the three */
  more: number
}

const GROUPS_NAMED = 3

export function sessionsLine(
  view: SessionsView | null | undefined
): SessionsLine | undefined {
  if (!view?.on || view.counts.open === 0) return undefined
  const { open, working, turn } = view.counts
  const names = view.open.flatMap((group) => (group.name ? [group.name] : []))
  return {
    turn,
    working,
    quiet: Math.max(0, open - working - turn),
    groups: names.slice(0, GROUPS_NAMED),
    more: Math.max(0, names.length - GROUPS_NAMED),
  }
}

/** The open tasks a session can be linked to: its repository's first */
export function tasksToLink(
  tasks: readonly TaskView[],
  repo: string | undefined,
  words: string
): TaskView[] {
  const asked = words.trim().toLowerCase()
  const same = (task: TaskView) =>
    Boolean(repo && task.repo?.toLowerCase() === repo.toLowerCase())
  return tasks
    .filter((task) => task.status === 'open')
    .filter(
      (task) =>
        !asked ||
        task.title.toLowerCase().includes(asked) ||
        task.repo?.toLowerCase().includes(asked)
    )
    .toSorted(
      (a, b) =>
        Number(same(b)) - Number(same(a)) ||
        Date.parse(b.postedAt) - Date.parse(a.postedAt)
    )
}

/** How many folders of your sessions a device chooses from */
const RECENT_FOLDERS = 8

/**
 * The folders your sessions ran in, the last used first: where a device
 * starts one of no task, as it cannot browse the Mac's
 */
export function recentFolders(
  view: SessionsView | null | undefined
): FolderCheck[] {
  const rows = [
    ...(view?.open.flatMap((g) => g.sessions) ?? []),
    ...(view?.ended ?? []),
  ]
  rows.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  const folders = new Map<string, FolderCheck>()
  for (const row of rows)
    if (!folders.has(row.cwd))
      folders.set(row.cwd, {
        path: row.cwd,
        ...(row.repo && { remote: row.repo }),
        matches: false,
        usedAt: row.lastAt,
      })
  return [...folders.values()].slice(0, RECENT_FOLDERS)
}
