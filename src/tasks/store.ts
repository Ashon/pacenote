import { closeSync, mkdirSync, openSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { readJson, writeJson } from '../json-file.js'
import { cleanStages, type StageRecord, type StageRecords } from './stage.js'
import type {
  TaskDecision,
  TaskDecisions,
  TasksFile,
  TaskView,
  TasksView,
} from './types.js'
import { buildView, viewOf } from './view.js'

/**
 * The files behind your tasks:
 * - tasks.json: the tasks as AI tools add, change and close them through
 *   Pacenote's MCP server, with who you are in Slack; the desktop app writes
 *   it too (a task closed when it looks done, a group you say is not you),
 *   each change under its lock (withTasksLock)
 * - tasks-decisions.json: your clicks in the desktop app (done, dismissed,
 *   kept), written by it alone
 * - tasks-stages.json: the stages you set for open tasks (started, waiting),
 *   written by it alone too
 */
export const TASKS_FILE = 'tasks.json'
export const DECISIONS_FILE = 'tasks-decisions.json'
/**
 * Decisions you took back, by task, with when: so your other Macs drop them
 * too rather than bring them back (src/macs/sync.ts)
 */
export const TAKEN_BACK_FILE = 'tasks-taken-back.json'
/**
 * The stages you set (started, waiting, open again), by task, written by the
 * desktop app alone (src/tasks/stage.ts)
 */
export const STAGES_FILE = 'tasks-stages.json'

const DAY = 24 * 60 * 60_000
/**
 * Tasks stay in tasks.json this long after they were found, so a task's
 * detail can show the earlier ones it follows on; the list shows only the
 * last 14 days
 */
export const HISTORY_MS = 104 * DAY

// Re-exported for the modules that import them from here
export { buildView, readJson, viewOf, writeJson }

export function readTasks(dataDir: string): TasksFile {
  const file = readJson<Partial<TasksFile>>(path.join(dataDir, TASKS_FILE), {})
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
  else if (decisions[id]) {
    delete decisions[id]
    const takenBack = readTakenBack(dataDir)
    takenBack[id] = now.toISOString()
    writeJson(path.join(dataDir, TAKEN_BACK_FILE), takenBack)
  }
  writeJson(path.join(dataDir, DECISIONS_FILE), decisions)
}

export function readTakenBack(dataDir: string): Record<string, string> {
  const value = readJson<Record<string, string>>(
    path.join(dataDir, TAKEN_BACK_FILE),
    {}
  )
  return value && typeof value === 'object' ? value : {}
}

export function readStages(dataDir: string): StageRecords {
  return cleanStages(readJson<unknown>(path.join(dataDir, STAGES_FILE), {}))
}

/**
 * Records the stage you set for a task, or open when you take one back; the
 * records stay as long as the tasks they are about
 */
export function setStage(
  dataDir: string,
  id: string,
  stage: StageRecord['stage'],
  now = new Date()
): void {
  const kept = Object.entries(readStages(dataDir)).filter(
    ([key, record]) =>
      key !== id && now.getTime() - Date.parse(record.at) < HISTORY_MS
  )
  writeJson(
    path.join(dataDir, STAGES_FILE),
    Object.fromEntries([...kept, [id, { stage, at: now.toISOString() }]])
  )
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
export function allTaskViews(
  dataDir: string,
  now = Date.now(),
  /** tasks.json, when already read */
  file?: TasksFile
): TaskView[] {
  const decisions = readDecisions(dataDir)
  return (file ?? readTasks(dataDir)).tasks.map((task) =>
    viewOf(task, decisions, now)
  )
}
