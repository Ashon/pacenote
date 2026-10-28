// Relative imports, so the tests (and the root's typecheck) can load it
import type { TaskStage } from '../../../../src/tasks/stage.js'
import type { TaskView, WorkTool } from '../../../../src/tasks/types.js'

/**
 * Todo's Today: what waits on you, what to pick up, what waits on someone
 * else, one task each with how many more there are. Counted from the list,
 * with no model; a line shows only when it has a task.
 */
export type TodayLine =
  | { kind: 'you'; task: TaskView; more: number }
  | {
      kind: 'pickUp'
      task: TaskView
      more: number
      /** The session it was left in, or none when you started it */
      tool?: WorkTool
      at: string
    }
  | { kind: 'others'; task: TaskView; more: number; since: string }

const time = (iso: string | undefined) => Date.parse(iso ?? '') || 0

export function todayLines(
  tasks: readonly TaskView[],
  stages: Readonly<Record<string, TaskStage>>,
  working: Readonly<Record<string, { tool: WorkTool; at: string }>> = {},
  live: Readonly<Record<string, unknown>> = {}
): TodayLine[] {
  const open = tasks.filter((task) => task.status === 'open')
  const lines: TodayLine[] = []

  // Asked of you, not started or waiting: a due one first, then the oldest
  const asked = open
    .filter(
      (task) =>
        !stages[task.id] && task.kind === 'asked' && task.source.app !== 'local'
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.due)) - Number(Boolean(a.due)) ||
        time(a.postedAt) - time(b.postedAt)
    )
  if (asked[0])
    lines.push({ kind: 'you', task: asked[0], more: asked.length - 1 })

  // In progress with no AI tool on it now: the latest first
  const started = open
    .filter((task) => stages[task.id]?.stage === 'started' && !live[task.id])
    .map((task) => {
      const session = working[task.id]
      const stage = stages[task.id]!
      return stage.by === 'session' && session
        ? { task, tool: session.tool, at: session.at }
        : { task, at: stage.at }
    })
    .sort((a, b) => time(b.at) - time(a.at))
  if (started[0])
    lines.push({ kind: 'pickUp', ...started[0], more: started.length - 1 })

  // Waiting on someone else: the longest first
  const waiting = open
    .filter((task) => stages[task.id]?.stage === 'waiting')
    .sort((a, b) => time(stages[a.id]!.at) - time(stages[b.id]!.at))
  if (waiting[0])
    lines.push({
      kind: 'others',
      task: waiting[0],
      more: waiting.length - 1,
      since: stages[waiting[0].id]!.at,
    })
  return lines
}

/** Whole days from then to now, by the calendar here: 0 today, 1 yesterday */
export function daysSince(iso: string, now = Date.now()): number {
  const day = (ms: number) => {
    const date = new Date(ms)
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  }
  return Math.max(0, Math.round((day(now) - day(Date.parse(iso))) / 86_400_000))
}
