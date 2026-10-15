import { dayDirFor } from '../history/layout.js'
import type { HandledHow, TaskTrend, TaskView, WorkEntry } from './types.js'

/**
 * What you did with your tasks over the last days, for the Overview: how many
 * you handled each day, how they ended, and how long they usually took.
 * Handled: done in the app, closed in Slack or by an AI tool, or dismissed as
 * done already. Dismissing one as not yours or not worth it is not handling it.
 */

export const TREND_DAYS = 14

/** How a task was handled; undefined when it was not */
export function handledHow(
  task: TaskView,
  work: readonly WorkEntry[]
): HandledHow | undefined {
  const handled =
    task.status === 'done' ||
    task.status === 'closed' ||
    (task.status === 'dismissed' && task.dismissReason === 'done-already')
  if (!handled) return undefined
  const session = work.some(
    (entry) => entry.kind === 'session' && entry.task === task.id
  )
  if (session || task.closed?.by) return 'tool'
  return task.status === 'closed' ? 'slack' : 'you'
}

/**
 * The trend from the tasks as Todo lists them (buildView), which keeps every
 * task settled in the last 14 days. Days are this Mac's, as in the runs chart.
 */
export function taskTrend(
  tasks: readonly TaskView[],
  work: readonly WorkEntry[],
  now = new Date()
): TaskTrend {
  const daily = new Map<string, number>()
  for (let i = TREND_DAYS - 1; i >= 0; i -= 1)
    daily.set(dayDirFor(new Date(now.getTime() - i * 86_400_000)), 0)
  const how: Record<HandledHow, number> = { tool: 0, slack: 0, you: 0 }
  const waits: number[] = []
  for (const task of tasks) {
    if (!task.settledAt) continue
    const day = dayDirFor(new Date(task.settledAt))
    const count = daily.get(day)
    if (count === undefined) continue
    const ended = handledHow(task, work)
    if (!ended) continue
    daily.set(day, count + 1)
    how[ended] += 1
    waits.push(
      Math.max(0, Date.parse(task.settledAt) - Date.parse(task.postedAt))
    )
  }
  return {
    daily: [...daily].map(([day, handled]) => ({ day, handled })),
    how,
    open: tasks.filter((task) => task.status === 'open').length,
    medianMs: median(waits),
  }
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2
}
