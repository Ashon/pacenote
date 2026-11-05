import path from 'node:path'
import { guessArea } from '../you/guess.js'
import type { AreaView } from '../you/types.js'
import { ADDED_BY_YOU } from './sources.js'
import { cleanStages, type StageRecords } from './stage.js'
import {
  DECISIONS_FILE,
  readDecisions,
  readStages,
  readTasks,
  STAGES_FILE,
  withTasksLock,
  writeJson,
  writeTasks,
} from './store.js'
import type {
  DismissReason,
  Task,
  TaskDecision,
  TaskDecisions,
} from './types.js'

/**
 * The tasks a device of yours (the iPhone, iPad and Android app) wrote before
 * it paired, handed to the Mac it paired with (H6 on the task-first canvas's
 * page "Mac 없이"). Each becomes one of your own tasks here, as Todo's New
 * task adds them, with how you left it there (done, dismissed, in progress,
 * waiting), and goes to your other Macs as your tasks do. A device adds only
 * tasks new to this Mac: it never changes one here, not even one it handed
 * over before, so handing over again adds nothing twice. Its project is
 * guessed from its words, as New task guesses it. A device you removed is let
 * in by none of your Macs (macs.ts), so it hands over nothing.
 */

/** A task as a device hands it over: anything, until read here */
export interface HandedTask {
  /** local: and 12 hex digits, made on the device */
  id: string
  title: string
  /** When it is due, in your words */
  due?: string
  /** When it was written there (ISO) */
  addedAt?: string
  /** Done or dismissed there (and why) */
  decision?: {
    status: 'done' | 'dismissed'
    reason?: DismissReason
    at: string
  }
  /** In progress or waiting on someone else there */
  stage?: { stage: 'started' | 'waiting'; at: string }
}

export interface HandedOver {
  /** New here */
  added: number
  /** Here already: handed over before */
  already: number
  /** Not a task: no title, or an id a device does not make */
  skipped: number
  /**
   * The ones new here that are still open, for your AI to fill in (the Mac's
   * own: a device reads only the counts)
   */
  open?: string[]
}

/** The most one handover takes */
export const HAND_OVER_MAX = 500

/** A local task's id as Pacenote makes one, here or on a device */
const LOCAL_ID = /^local:[0-9a-f]{12}$/
const REASONS: readonly DismissReason[] = [
  'not-mine',
  'done-already',
  'not-worth-it',
]

/** A time that makes sense: not after now; now otherwise */
const timeOf = (value: unknown, now: Date): string => {
  const at = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isNaN(at) || at > now.getTime()
    ? now.toISOString()
    : new Date(at).toISOString()
}

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : undefined

/**
 * Takes the tasks a device handed over: device is the one that asked, as
 * Your devices has it (DeviceAnswers), never what it says of itself. areas:
 * your areas now, to guess each task's project from.
 */
export function handOverTasks(
  dataDir: string,
  items: unknown,
  device: { id: string; name: string },
  options: { areas?: readonly AreaView[]; now?: Date } = {}
): HandedOver {
  const now = options.now ?? new Date()
  const list = Array.isArray(items) ? items.slice(0, HAND_OVER_MAX) : []
  return withTasksLock(dataDir, () => {
    const file = readTasks(dataDir)
    const known = new Set(file.tasks.map((task) => task.id))
    const decisions: TaskDecisions = {}
    const stages: StageRecords = {}
    const added: Task[] = []
    let already = 0
    let skipped = 0
    for (const item of list) {
      const { id, title, due, addedAt, decision, stage } = (item ??
        {}) as Partial<Record<keyof HandedTask, unknown>>
      const name = text(title, 120)
      if (typeof id !== 'string' || !LOCAL_ID.test(id) || !name) {
        skipped++
        continue
      }
      if (known.has(id)) {
        already++
        continue
      }
      known.add(id)
      const at = timeOf(addedAt, now)
      const repo = options.areas
        ? guessArea(name, options.areas)?.repo
        : undefined
      added.push({
        id,
        source: {
          app: 'local',
          conversation: repo ?? 'local',
          label: repo ?? device.name,
          message: id.slice('local:'.length),
        },
        title: name,
        askedBy: 'you',
        kind: 'promised',
        due: text(due, 60),
        confidence: 'sure',
        reason: `Added on ${device.name}`,
        postedAt: at,
        foundAt: now.toISOString(),
        addedBy: ADDED_BY_YOU,
        action: repo ? 'code' : 'other',
        repo,
        device: { ...device, handedOver: now.toISOString() },
      })
      const done = decisionOf(decision, now)
      if (done) decisions[id] = done
      const staged = cleanStages({ [id]: stage })[id]
      if (!done && staged && staged.stage !== 'open') stages[id] = staged
    }
    if (added.length) {
      writeTasks(dataDir, { ...file, tasks: [...file.tasks, ...added] })
      if (Object.keys(decisions).length)
        writeJson(path.join(dataDir, DECISIONS_FILE), {
          ...readDecisions(dataDir),
          ...decisions,
        })
      if (Object.keys(stages).length)
        writeJson(path.join(dataDir, STAGES_FILE), {
          ...readStages(dataDir),
          ...stages,
        })
    }
    const open = added
      .filter((task) => !decisions[task.id])
      .map((task) => task.id)
    return {
      added: added.length,
      already,
      skipped,
      ...(open.length && { open }),
    }
  })
}

/** Done or dismissed (and why), as a device says: nothing else */
function decisionOf(value: unknown, now: Date): TaskDecision | undefined {
  const { status, reason, at } = (value ?? {}) as Partial<
    Record<keyof TaskDecision, unknown>
  >
  if (status !== 'done' && status !== 'dismissed') return undefined
  return {
    status,
    ...(status === 'dismissed' &&
      REASONS.includes(reason as DismissReason) && {
        reason: reason as DismissReason,
      }),
    at: timeOf(at, now),
  }
}
