import type { TaskView } from './types.js'

/**
 * Where an open task stands beyond open: started (you are on it) or waiting
 * (on someone else). A stage sits on top of open: to AI tools, Pace, Recap
 * and areas the task is still open, so a collection keeps reading a waiting
 * task's thread. What you set is kept apart from tasks.json and
 * tasks-decisions.json (tasks-stages.json, src/tasks/store.ts), so an earlier
 * Pacenote, here or on another Mac, reads both as before and shows the task
 * as open. Plain data, so the screen works stages out the same way.
 */

export type Stage = 'started' | 'waiting'

/**
 * What you last set for a task, and when: a stage, or open when you took one
 * back (Not in progress, Back to open), which holds until newer evidence
 */
export interface StageRecord {
  stage: Stage | 'open'
  at: string
}

export type StageRecords = Record<string, StageRecord>

/** An open task's stage as the screen shows it */
export interface TaskStage {
  stage: Stage
  /** Since when */
  at: string
  /** you: you set it; session: a session worked on the task lately */
  by: 'you' | 'session'
}

/** A session on a task this recent puts it in progress by itself */
export const RECENT_SESSION_MS = 24 * 60 * 60_000

const STAGES: readonly StageRecord['stage'][] = ['started', 'waiting', 'open']

/** The records that make sense, from a file or another Mac */
export function cleanStages(value: unknown): StageRecords {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const records: StageRecords = {}
  for (const [id, record] of Object.entries(value as Record<string, unknown>)) {
    const { stage, at } = (record ?? {}) as Partial<StageRecord>
    if (
      STAGES.includes(stage as StageRecord['stage']) &&
      typeof at === 'string' &&
      !Number.isNaN(Date.parse(at))
    )
      records[id] = { stage: stage!, at }
  }
  return records
}

/** When the collection last changed the task: someone said something new */
const changedAt = (task: TaskView): number =>
  Math.max(0, ...(task.updates ?? []).map((update) => Date.parse(update.at)))

/**
 * An open task's stage: what you set, unless newer evidence moved it. A task
 * waits until the collection changes it after you said so (someone answered);
 * it is in progress when you said so, or when a session worked on it in the
 * last day, after you last took a stage back.
 */
export function stageOf(
  task: TaskView,
  record: StageRecord | undefined,
  signals: {
    /** When a session last worked on the task */
    sessionAt?: string
    /** An AI tool is working on it now */
    live?: boolean
  } = {},
  now = Date.now()
): TaskStage | undefined {
  if (task.status !== 'open') return undefined
  const since = record ? Date.parse(record.at) : 0
  if (record?.stage === 'waiting' && changedAt(task) <= since)
    return { stage: 'waiting', at: record.at, by: 'you' }
  if (record?.stage === 'started')
    return { stage: 'started', at: record.at, by: 'you' }
  if (signals.live)
    return {
      stage: 'started',
      at: signals.sessionAt ?? new Date(now).toISOString(),
      by: 'session',
    }
  const session = signals.sessionAt ? Date.parse(signals.sessionAt) : NaN
  if (session > since && now - session < RECENT_SESSION_MS)
    return { stage: 'started', at: signals.sessionAt!, by: 'session' }
  return undefined
}
