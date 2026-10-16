import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { sourceOf } from './sources.js'
import type {
  DismissReason,
  Task,
  TaskDecision,
  TaskDecisions,
  TasksFile,
  TaskView,
  TasksView,
} from './types.js'

/**
 * The two files behind your tasks:
 * - tasks.json: the tasks as AI tools add, change and close them through
 *   Pacenote's MCP server, with who you are in Slack; the desktop app writes
 *   it too (a task closed when it looks done, a group you say is not you),
 *   each change under its lock (withTasksLock)
 * - tasks-decisions.json: your clicks in the desktop app (done, dismissed,
 *   kept), written by it alone
 */
export const TASKS_FILE = 'tasks.json'
export const DECISIONS_FILE = 'tasks-decisions.json'

const DAY = 24 * 60 * 60_000
/** An open task this old is shown faded */
export const FADE_AFTER_MS = 7 * DAY
/** An open task this old is dropped */
export const DROP_OPEN_AFTER_MS = 14 * DAY
/** Done, dismissed and closed tasks are kept this long */
export const KEEP_SETTLED_MS = 14 * DAY
/**
 * Tasks stay in tasks.json this long after they were found, so a task's
 * detail can show the earlier ones it follows on; the list shows only the
 * last 14 days
 */
export const HISTORY_MS = 104 * DAY
/** This many "not for me" dismissals from one channel offer to leave it out */
const LEAVE_OUT_AFTER = 3

export function emptyTasks(): TasksFile {
  return { version: 1, tasks: [] }
}

export function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Writes through a temporary file, so no half-written file is left behind */
export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(tmp, file)
}

export function readTasks(dataDir: string): TasksFile {
  const file = readJson<Partial<TasksFile>>(
    path.join(dataDir, TASKS_FILE),
    emptyTasks()
  )
  return {
    version: 1,
    collectedAt: file.collectedAt,
    tasks: Array.isArray(file.tasks) ? file.tasks : [],
    ...(file.you?.id ? { you: file.you } : {}),
    ...(Array.isArray(file.notYourGroups)
      ? { notYourGroups: file.notYourGroups }
      : {}),
  }
}

/** A lock this old was left by a process that ended while holding it */
const STALE_LOCK_MS = 10_000
const pause = (ms: number) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Runs change holding tasks.json's lock. Each AI tool session runs an MCP
 * server of its own, and the desktop app closes tasks too, so whatever reads
 * tasks.json to change it does so under the lock, and two changes at once
 * never undo each other.
 */
export function withTasksLock<T>(dataDir: string, change: () => T): T {
  mkdirSync(dataDir, { recursive: true })
  const lock = path.join(dataDir, `${TASKS_FILE}.lock`)
  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'))
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const held = statSync(lock, { throwIfNoEntry: false })?.mtimeMs
      if (held !== undefined && Date.now() - held > STALE_LOCK_MS)
        rmSync(lock, { force: true })
      else pause(20)
    }
  }
  try {
    return change()
  } finally {
    rmSync(lock, { force: true })
  }
}

export function writeTasks(dataDir: string, tasks: TasksFile): void {
  writeJson(path.join(dataDir, TASKS_FILE), tasks)
}

export function readDecisions(dataDir: string): TaskDecisions {
  const value = readJson<TaskDecisions>(path.join(dataDir, DECISIONS_FILE), {})
  return value && typeof value === 'object' ? value : {}
}

/** Records a decision (or takes it back, with undefined) */
export function decide(
  dataDir: string,
  id: string,
  decision: Omit<TaskDecision, 'at'> | undefined,
  now = new Date()
): void {
  const decisions = readDecisions(dataDir)
  if (decision) decisions[id] = { ...decision, at: now.toISOString() }
  else delete decisions[id]
  writeJson(path.join(dataDir, DECISIONS_FILE), decisions)
}

/**
 * Drops what is past keeping: open tasks too old to matter, and settled ones
 * after a while. Decisions for tasks that are gone go too.
 */
export function prune(
  tasks: TasksFile,
  decisions: TaskDecisions,
  now = Date.now()
): { tasks: TasksFile; decisions: TaskDecisions } {
  const kept = tasks.tasks.filter((task) => {
    const decision = decisions[task.id]
    const settledAt =
      decision && decision.status !== 'kept'
        ? Date.parse(decision.at)
        : task.closed
          ? Date.parse(task.closed.at)
          : undefined
    if (settledAt !== undefined) return now - settledAt < KEEP_SETTLED_MS
    return now - Date.parse(task.postedAt) < DROP_OPEN_AFTER_MS
  })
  const ids = new Set(kept.map((task) => task.id))
  return {
    tasks: { ...tasks, tasks: kept },
    decisions: Object.fromEntries(
      Object.entries(decisions).filter(([id]) => ids.has(id))
    ),
  }
}

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

/** The tasks for the screen, read from the data folder */
export function tasksView(
  dataDir: string,
  excluded: readonly string[] = []
): TasksView {
  return buildView(readTasks(dataDir), readDecisions(dataDir), { excluded })
}

/**
 * Every task kept, the history included, as the screen shows them: what a
 * task's detail and its session read earlier tasks from
 */
export function allTaskViews(dataDir: string, now = Date.now()): TaskView[] {
  const decisions = readDecisions(dataDir)
  return readTasks(dataDir).tasks.map((task) => viewOf(task, decisions, now))
}
