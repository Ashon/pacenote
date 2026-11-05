import type { Task, TaskUpdate } from './types.js'

/**
 * What your AI filled in a task you added, as the task keeps it: one update
 * when it was filled in, and one when you took that back. Plain, so the
 * screens, the stages and the MCP server read it the same way. An older
 * Pacenote shows these as it shows any update.
 */

/** The update your AI's fill is kept as */
export const FILLED_IN = 'Filled in when you added it'
/** The update Undo is kept as */
export const TOOK_BACK = 'Took back what was filled in'

/**
 * Whether an update is your AI's fill or Undo of it: not news of the task,
 * which only its thread or your words make
 */
export const isFillUpdate = (update: Pick<TaskUpdate, 'why'>): boolean =>
  update.why === FILLED_IN || update.why === TOOK_BACK

/** Whether your AI filled the task in, whatever came after */
export const wasFilled = (task: Pick<Task, 'updates'>): boolean =>
  (task.updates ?? []).some((update) => update.why === FILLED_IN)

/** The fill that stands: filled in and not taken back */
export function standingFill(
  task: Pick<Task, 'updates'>
): TaskUpdate | undefined {
  const updates = task.updates ?? []
  const fill = updates.findLast((update) => update.why === FILLED_IN)
  if (!fill || fill.changed.length === 0) return undefined
  const taken = updates.some(
    (update) =>
      update.why === TOOK_BACK && Date.parse(update.at) >= Date.parse(fill.at)
  )
  return taken ? undefined : fill
}

/** How long a task says it was just filled in */
export const FILLED_SHOWN_MS = 24 * 60 * 60_000

/**
 * What the task's own row says: the open task it looks like, while you have
 * not said they are two
 */
export const looksLikeOf = (
  task: Pick<Task, 'looksLike'>
): string | undefined =>
  task.looksLike && !task.looksLike.keptBoth ? task.looksLike.task : undefined
