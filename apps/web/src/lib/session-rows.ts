// Relative imports, so the tests (and the root's typecheck) can load it
import type {
  SessionRow,
  SessionState,
  SessionsView,
} from '../../../../src/sessions/types.js'
import type { TaskView } from '../../../../src/tasks/types.js'

/**
 * The sessions on this Mac as Todo shows them (src/sessions): each open
 * task's session, and Today's line about all of them. Plain, so tests load it.
 */

/** Whether a session has a page in Pacenote: Claude Code's and Codex's */
export const canOpen = (s: SessionRow) => s.tool !== 'opencode'

/**
 * Whether Pacenote can take you to where a session runs: its app, claude.ai
 * or its terminal app (not one Pacenote runs itself)
 */
export const canShow = (s: SessionRow) =>
  s.state !== 'ended' &&
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
