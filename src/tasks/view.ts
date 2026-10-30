import { sourceOf } from './sources.js'
import type {
  DismissReason,
  Task,
  TaskDecisions,
  TasksFile,
  TaskView,
  TasksView,
} from './types.js'

/**
 * Your tasks as the screens show them, from tasks.json and your decisions,
 * with nothing read from disk: the desktop app's (store.ts reads the files)
 * and the phone and iPad app's, from what your Mac sends it.
 */

const DAY = 24 * 60 * 60_000
/** An open task this old is shown faded */
const FADE_AFTER_MS = 7 * DAY
/** An open task this old is dropped */
const DROP_OPEN_AFTER_MS = 14 * DAY
/** Done, dismissed and closed tasks are kept this long */
const KEEP_SETTLED_MS = 14 * DAY
/** This many "not for me" dismissals from one channel offer to leave it out */
const LEAVE_OUT_AFTER = 3

/** A task as the screen shows it: your decision over what was found */
export function viewOf(
  task: Task,
  decisions: TaskDecisions,
  now = Date.now()
): TaskView {
  const decision = decisions[task.id]
  const faded = now - Date.parse(task.postedAt) > FADE_AFTER_MS
  if (decision?.status === 'done' || decision?.status === 'dismissed')
    return {
      ...task,
      status: decision.status,
      settledAt: decision.at,
      dismissReason: decision.reason,
      faded: false,
    }
  // Kept: a Maybe moved into the list, or a closed task opened again
  if (decision?.status === 'kept') return { ...task, status: 'open', faded }
  if (task.closed)
    return {
      ...task,
      status: 'closed',
      settledAt: task.closed.at,
      faded: false,
    }
  const status = task.confidence === 'maybe' ? 'maybe' : 'open'
  return { ...task, status, faded }
}

/**
 * Whether the list still shows it: open for 14 days after it was found,
 * settled for 14 days after that
 */
const listed = (task: TaskView, now: number) =>
  task.settledAt
    ? now - Date.parse(task.settledAt) < KEEP_SETTLED_MS
    : now - Date.parse(task.foundAt) < DROP_OPEN_AFTER_MS

/**
 * The tasks as the screen shows them: your decisions over what the collection
 * found, newest first, of the last 14 days (older ones stay as the history a
 * task's detail reads). excluded: channels already left out (IDs or #names),
 * so the leave-out offer does not come back for them.
 */
export function buildView(
  file: TasksFile,
  decisions: TaskDecisions,
  options: { now?: number; excluded?: readonly string[] } = {}
): TasksView {
  const now = options.now ?? Date.now()
  const tasks: TaskView[] = file.tasks
    .map((task) => viewOf(task, decisions, now))
    .filter((task) => listed(task, now))
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))

  const settled = tasks.filter(
    (task) => task.status === 'done' || task.status === 'dismissed'
  )
  const dismissed = settled.filter((task) => task.status === 'dismissed')
  return {
    tasks,
    collectedAt: file.collectedAt,
    dismissRate: settled.length ? dismissed.length / settled.length : undefined,
    leaveOut: leaveOutOffer(dismissed, options.excluded ?? []),
  }
}

/**
 * The Slack channel with the most "not for me" dismissals, once there are
 * enough: leaving channels out is Slack's setting
 */
function leaveOutOffer(
  dismissed: TaskView[],
  excluded: readonly string[]
): TasksView['leaveOut'] {
  const counts = new Map<string, { label: string; count: number }>()
  for (const task of dismissed) {
    if (task.dismissReason !== ('not-mine' satisfies DismissReason)) continue
    if (sourceOf(task).id !== 'slack') continue
    const { conversation, label } = task.source
    if (excluded.includes(conversation) || excluded.includes(label)) continue
    const entry = counts.get(conversation) ?? { label, count: 0 }
    entry.count += 1
    counts.set(conversation, entry)
  }
  const [best] = [...counts.entries()]
    .filter(([, entry]) => entry.count >= LEAVE_OUT_AFTER)
    .sort((a, b) => b[1].count - a[1].count)
  return best ? { conversation: best[0], ...best[1] } : undefined
}
