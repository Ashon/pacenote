import type { TaskStage } from './stage.js'
import type { TaskView } from './types.js'

/**
 * The tabs Todo lists tasks under, and each tab's order: the same on the Mac
 * (apps/web's tasks-page.tsx) and on a phone or an iPad, which work them out
 * from the tasks the Mac sends. Plain data, as the stages they follow.
 */

/** Open, waiting on someone else, a Maybe, or settled */
export type TodoTab = 'open' | 'waiting' | 'maybe' | 'done'

/** The tab a task is listed under: an open one waiting on someone, Waiting */
export function tabOf(
  task: Pick<TaskView, 'status'>,
  stage?: TaskStage
): TodoTab {
  if (task.status === 'open')
    return stage?.stage === 'waiting' ? 'waiting' : 'open'
  return task.status === 'maybe' ? 'maybe' : 'done'
}

const at = (iso?: string) => Date.parse(iso ?? '') || 0

/**
 * A tab's tasks in its order, sorted in place: in progress first, the longest
 * waiting first, the latest settled first, and Maybes as they come
 */
export function sortForTab(
  tasks: TaskView[],
  tab: TodoTab,
  stages: Readonly<Record<string, TaskStage>>
): TaskView[] {
  if (tab === 'open')
    tasks.sort(
      (a, b) =>
        Number(stages[b.id]?.stage === 'started') -
        Number(stages[a.id]?.stage === 'started')
    )
  if (tab === 'waiting')
    tasks.sort((a, b) => at(stages[a.id]?.at) - at(stages[b.id]?.at))
  if (tab === 'done') tasks.sort((a, b) => at(b.settledAt) - at(a.settledAt))
  return tasks
}
