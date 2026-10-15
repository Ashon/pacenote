import { type FSWatcher, watch } from 'node:fs'

/**
 * Pacenote's task files: tasks.json, the decisions, the work log, the
 * activity AI tools leave (tasks-activity.jsonl) and the like. Each is
 * written whole (a temporary file renamed into place) or appended to, so a
 * change shows as an event on the folder.
 */
const TASK_FILE = /^tasks[\w-]*\.jsonl?$/

/**
 * Tells the window as soon as your tasks change on disk, whoever changed
 * them: an AI tool over MCP (a process of its own), a collection, your own
 * decisions. Events close together are told once. Returns the stop.
 */
export function watchTasks(
  dataDir: string,
  changed: () => void,
  delayMs = 100
): () => void {
  let timer: NodeJS.Timeout | undefined
  let watcher: FSWatcher | undefined
  try {
    watcher = watch(dataDir, (_event, name) => {
      if (name && !TASK_FILE.test(String(name))) return
      clearTimeout(timer)
      timer = setTimeout(changed, delayMs)
    })
    watcher.on('error', () => watcher?.close())
  } catch {
    // No folder to watch: the screens still refresh every few seconds.
  }
  return () => {
    clearTimeout(timer)
    watcher?.close()
  }
}
