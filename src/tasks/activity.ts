import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { TaskActivity, TasksLive } from './types.js'

/**
 * What AI tools do with your tasks as they do it, for the desktop app to show
 * live: each call to Pacenote's task tools adds a line to
 * tasks-activity.jsonl. Every MCP server process appends (one per AI tool
 * session), so lines are only ever added, and the file is cut back to its
 * last lines once it grows. A line holds a task's id and the names of the
 * fields that changed, never what Slack said.
 */
export const ACTIVITY_FILE = 'tasks-activity.jsonl'

/** An AI tool counts as at work on a task this long after its last call */
export const LIVE_MS = 2 * 60_000
/** Lines read back: older ones say nothing about now */
const READ_MS = 15 * 60_000
/** The file is cut back to this many lines once it is past TRIM_BYTES */
const KEEP_LINES = 200
const TRIM_BYTES = 64 * 1024

/** Adds one line; a failure to write is not the tool call's failure */
export function recordActivity(dataDir: string, event: TaskActivity): void {
  const file = path.join(dataDir, ACTIVITY_FILE)
  try {
    mkdirSync(dataDir, { recursive: true })
    appendFileSync(file, `${JSON.stringify(event)}\n`)
    if (statSync(file).size > TRIM_BYTES) {
      const lines = readFileSync(file, 'utf8').trimEnd().split('\n')
      const tmp = `${file}.tmp`
      writeFileSync(tmp, `${lines.slice(-KEEP_LINES).join('\n')}\n`)
      renameSync(tmp, file)
    }
  } catch {
    // The live view misses one step; the tasks themselves are written.
  }
}

/** The last minutes' activity, oldest first */
export function readActivity(
  dataDir: string,
  now = Date.now()
): TaskActivity[] {
  const file = path.join(dataDir, ACTIVITY_FILE)
  if (!existsSync(file)) return []
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const events: TaskActivity[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as TaskActivity
      if (now - Date.parse(event.at) < READ_MS) events.push(event)
    } catch {
      // A line cut short by a crash
    }
  }
  return events
}

export function liveTasks(
  events: readonly TaskActivity[],
  now = Date.now()
): TasksLive {
  const fresh = (event: TaskActivity) => now - Date.parse(event.at) < LIVE_MS
  // Collect now shows its own progress, and its changes are its own.
  const tools = events.filter((event) => !event.app)
  const working: TasksLive['working'] = {}
  for (const event of tools)
    if (
      event.task &&
      (event.kind === 'look' || event.kind === 'update') &&
      fresh(event)
    )
      working[event.task] = { by: event.by, at: event.at }
  // Closed or wrapped up since: done working on it
  for (const event of tools)
    if (
      event.task &&
      (event.kind === 'close' || event.kind === 'wrap-up') &&
      working[event.task] &&
      Date.parse(event.at) >= Date.parse(working[event.task]!.at)
    )
      delete working[event.task]

  const start = tools.findLastIndex((event) => event.kind === 'collect')
  const since = start < 0 ? [] : tools.slice(start)
  const done = since.some(
    (event) => event.kind === 'add' && event.finished !== false
  )
  const last = tools.at(-1)
  return {
    collecting:
      start >= 0 && !done && fresh(since.at(-1)!)
        ? {
            by: tools[start]!.by,
            since: tools[start]!.at,
            added: since.reduce((sum, event) => sum + (event.added ?? 0), 0),
          }
        : undefined,
    working,
    latest: last && fresh(last) ? last : undefined,
  }
}
