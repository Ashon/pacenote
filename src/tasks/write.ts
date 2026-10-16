import { createHash, randomBytes } from 'node:crypto'
import type { TasksSettings } from './settings.js'
import {
  findMessage,
  LOCAL,
  SOURCES,
  sourceNames,
  type SourceId,
} from './sources.js'
import {
  HISTORY_MS,
  readDecisions,
  readTasks,
  viewOf,
  withTasksLock,
  writeTasks,
} from './store.js'
import type {
  Task,
  TaskAction,
  TaskConfidence,
  TaskField,
  TaskKind,
  TaskUpdate,
} from './types.js'
import {
  groupHandle,
  notYourGroups,
  youFrom,
  yourGroups,
  type NewYou,
} from './you.js'

/**
 * Adding, updating and closing tasks, as the MCP server does for an AI tool.
 * A task is
 * keyed by its message, read from its link by its source (sources.ts), so the
 * same message is never added twice, and the settings (DMs, channels left out)
 * hold whatever the tool sends.
 */

/** A task as an AI tool sends it */
export interface NewTask {
  title: string
  kind?: TaskKind
  asked_by?: string
  /** "#payments", "DM with mina" */
  where: string
  /** The link of the message the task comes from: a Slack permalink */
  link: string
  /** The source the message is in; by default, whichever reads its link */
  source?: SourceId
  /** When the message was posted (ISO); taken from the link when absent */
  posted_at?: string
  due?: string
  confidence?: TaskConfidence
  reason?: string
  /** What doing it takes */
  action?: TaskAction
  /** The repository it is about: owner/name */
  repo?: string
  /** The thread in two or three sentences */
  summary?: string
  /**
   * The user group it was asked of (@handle), when that group is all that
   * makes it maybe the user's
   */
  group?: string
}

/** owner/name, as GitHub names a repository */
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/

export interface Skipped {
  link: string
  why: string
}

const isDm = (conversation: string, where: string) =>
  conversation.startsWith('D') || /^(dm|group dm)\b/i.test(where.trim())

const leftOut = (conversation: string, where: string, exclude: string[]) =>
  exclude.find((entry) => {
    const name = entry.replace(/^#/, '').toLowerCase()
    return (
      entry === conversation ||
      name === where.trim().replace(/^#/, '').toLowerCase()
    )
  })

export function addTasks(
  dataDir: string,
  items: readonly NewTask[],
  options: {
    settings: TasksSettings
    addedBy?: string
    /** Marks the collection finished (collectedAt) */
    finished?: boolean
    /** Your own Slack profile, as the collection looked it up */
    you?: NewYou
    now?: Date
  }
): { added: Task[]; skipped: Skipped[] } {
  return withTasksLock(dataDir, () => {
    const now = options.now ?? new Date()
    const file = readTasks(dataDir)
    const known = new Set(file.tasks.map((task) => task.id))
    // A group that means you makes its ask yours; one you said does not, not.
    const groups = yourGroups(options.settings)
    const notGroups = notYourGroups(file, groups)
    const added: Task[] = []
    const skipped: Skipped[] = []
    for (const item of items) {
      const source = findMessage(item.link, item.source)
      if (!source) {
        skipped.push({
          link: item.link,
          why: `not a ${sourceNames(item.source ? [item.source] : undefined)} message link`,
        })
        continue
      }
      const id = SOURCES[source.app].taskId(source)
      const title = item.title.trim()
      const group = item.group ? groupHandle(item.group) : undefined
      // Channels left out and DMs are Slack's settings.
      const slack = source.app === 'slack'
      const excluded = slack
        ? leftOut(source.conversation, item.where, options.settings.exclude)
        : undefined
      const why = !title
        ? 'no title'
        : known.has(id)
          ? 'already a task'
          : excluded
            ? `${excluded} is left out`
            : slack &&
                !options.settings.dms &&
                isDm(source.conversation, item.where)
              ? 'DMs are off'
              : group && notGroups.includes(group)
                ? `${group} does not mean the user`
                : undefined
      if (why) {
        skipped.push({ link: item.link, why })
        continue
      }
      known.add(id)
      const posted = item.posted_at ? Date.parse(item.posted_at) : NaN
      const kind = item.kind ?? 'asked'
      added.push({
        id,
        source: {
          app: source.app,
          conversation: source.conversation,
          label: item.where.trim(),
          message: source.message,
          thread: source.thread,
          permalink: item.link,
        },
        title: title.slice(0, 120),
        askedBy:
          kind === 'promised' ? 'you' : item.asked_by?.trim() || undefined,
        kind,
        due: item.due?.trim() || undefined,
        confidence:
          group && groups.includes(group)
            ? 'sure'
            : (item.confidence ?? 'maybe'),
        reason: (item.reason ?? '').trim().slice(0, 300),
        action: item.action,
        repo:
          item.repo && REPO.test(item.repo.trim())
            ? item.repo.trim()
            : undefined,
        summary: item.summary?.trim().slice(0, 600) || undefined,
        postedAt: new Date(
          Number.isNaN(posted)
            ? (SOURCES[source.app].postedAt?.(source) ?? now.getTime())
            : posted
        ).toISOString(),
        foundAt: now.toISOString(),
        addedBy: options.addedBy,
        ...(group && !groups.includes(group) ? { group } : {}),
      })
    }
    const you = options.you && youFrom(options.you, now)
    if (added.length > 0 || options.finished || you)
      writeTasks(dataDir, {
        ...file,
        ...(you ? { you } : {}),
        collectedAt: options.finished ? now.toISOString() : file.collectedAt,
        // Kept as the history earlier tasks are read from, then dropped
        tasks: [...file.tasks, ...added].filter(
          (task) => now.getTime() - Date.parse(task.foundAt) < HISTORY_MS
        ),
      })
    return { added, skipped }
  })
}

/** A task Pace keeps for you from a thread it answered in */
export interface ThreadTask {
  title: string
  why?: string
  /** Someone in the thread asked it of you; otherwise it is yours to do */
  asked_by?: string
  due?: string
  action?: TaskAction
  repo?: string
  summary?: string
}

/**
 * Adds tasks you asked Pace for in a Slack thread, as many as you asked for:
 * each comes from your request there (its link opens it), so it is keyed by
 * that message and its title rather than by the message alone. The same title
 * still open in the thread is not added again. You asked for them, so they
 * are sure, and the settings that leave channels out do not apply.
 */
export function addThreadTasks(
  dataDir: string,
  items: readonly ThreadTask[],
  at: {
    conversation: string
    label: string
    /** Your request (a Slack ts) and its link */
    message: string
    thread: string
    permalink?: string
  },
  options: { addedBy?: string; now?: Date } = {}
): { added: Task[]; alreadyThere: Task[]; skipped: string[] } {
  return withTasksLock(dataDir, () => {
    const now = options.now ?? new Date()
    const file = readTasks(dataDir)
    const added: Task[] = []
    const alreadyThere: Task[] = []
    const skipped: string[] = []
    for (const item of items) {
      const title = item.title.trim().slice(0, 120)
      if (!title) {
        skipped.push('no title')
        continue
      }
      const key = createHash('sha256')
        .update(title.toLowerCase())
        .digest('hex')
        .slice(0, 10)
      const id = `${at.conversation}:${at.message}#${key}`
      const same = [...file.tasks, ...added].find(
        (t) =>
          t.id === id ||
          (!t.closed &&
            t.source.conversation === at.conversation &&
            (t.source.thread ?? t.source.message) === at.thread &&
            t.title.toLowerCase() === title.toLowerCase())
      )
      if (same) {
        alreadyThere.push(same)
        continue
      }
      const askedBy = item.asked_by?.trim()
      const repo = item.repo?.trim()
      added.push({
        id,
        source: {
          app: 'slack',
          conversation: at.conversation,
          label: at.label,
          message: at.message,
          thread: at.thread,
          permalink: at.permalink,
        },
        title,
        askedBy: askedBy || 'you',
        kind: askedBy ? 'asked' : 'promised',
        due: item.due?.trim() || undefined,
        confidence: 'sure',
        reason: item.why?.trim().slice(0, 300) || 'You asked Pace to keep it',
        action: item.action,
        repo: repo && REPO.test(repo) ? repo : undefined,
        summary: item.summary?.trim().slice(0, 600) || undefined,
        postedAt: new Date(
          SOURCES.slack.postedAt?.({
            conversation: at.conversation,
            message: at.message,
          }) ?? now.getTime()
        ).toISOString(),
        foundAt: now.toISOString(),
        addedBy: options.addedBy,
      })
    }
    if (added.length > 0)
      writeTasks(dataDir, { ...file, tasks: [...file.tasks, ...added] })
    return { added, alreadyThere, skipped }
  })
}

/** Closes an open task by its id or its message's link; undefined when none */
export function closeTask(
  dataDir: string,
  ref: string,
  why: NonNullable<Task['closed']>['why'],
  now = new Date(),
  /** Who closed it, what was done, a reply to send, and how it ended */
  more: { by?: string; note?: string; reply?: string; wrapUp?: string } = {}
): Task | undefined {
  return withTasksLock(dataDir, () => {
    const source = findMessage(ref)
    const id = source ? SOURCES[source.app].taskId(source) : ref
    const file = readTasks(dataDir)
    const task = file.tasks.find((t) => t.id === id)
    if (!task) return undefined
    if (task.closed) return task
    const closed: Task = {
      ...task,
      closed: {
        at: now.toISOString(),
        why,
        by: more.by,
        note: more.note?.trim().slice(0, 300) || undefined,
        reply: more.reply?.trim().slice(0, 4000) || undefined,
      },
      wrapUp: wrapUpOf(more.wrapUp, now, more.by) ?? task.wrapUp,
    }
    writeTasks(dataDir, {
      ...file,
      tasks: file.tasks.map((t) => (t.id === id ? closed : t)),
    })
    return closed
  })
}

const wrapUpOf = (text: string | undefined, now: Date, by?: string) =>
  text?.trim()
    ? { at: now.toISOString(), text: text.trim().slice(0, 600), by }
    : undefined

/**
 * Writes how a task ended, from its thread, once you did it or it closed. An
 * open task, a Maybe or one you dismissed is left as it is. undefined when
 * there is no such task.
 */
export function wrapUpTask(
  dataDir: string,
  ref: string,
  text: string,
  now = new Date(),
  by?: string
): { task: Task } | { task: Task; refused: string } | undefined {
  return withTasksLock(dataDir, () => {
    const source = findMessage(ref)
    const id = source ? SOURCES[source.app].taskId(source) : ref
    const file = readTasks(dataDir)
    const task = file.tasks.find((t) => t.id === id)
    if (!task) return undefined
    const status = viewOf(task, readDecisions(dataDir)).status
    if (status !== 'done' && status !== 'closed')
      return { task, refused: `it is ${status}` }
    const wrapUp = wrapUpOf(text, now, by)
    if (!wrapUp) return { task, refused: 'the wrap-up is empty' }
    const wrapped: Task = { ...task, wrapUp }
    writeTasks(dataDir, {
      ...file,
      tasks: file.tasks.map((t) => (t.id === id ? wrapped : t)),
    })
    return { task: wrapped }
  })
}

/** What update_task can change; null clears a due date or a repository */
export interface TaskChanges {
  title?: string
  due?: string | null
  summary?: string
  action?: TaskAction
  repo?: string | null
  confidence?: TaskConfidence
}

/** The updates a task keeps, newest last */
const UPDATES_KEPT = 10

/**
 * Updates an open task or Maybe as its thread changed it, or fills in what an
 * older task lacks, keeping what changed and why. A task you settled (done,
 * dismissed) or that closed is left as it is, and a Maybe you kept stays a
 * task. undefined when there is no such task.
 */
export function updateTask(
  dataDir: string,
  ref: string,
  changes: TaskChanges,
  why: string,
  now = new Date(),
  by?: string
):
  | { task: Task; changed: TaskUpdate['changed'] }
  | { task: Task; refused: string }
  | undefined {
  return withTasksLock(dataDir, () => {
    const source = findMessage(ref)
    const id = source ? SOURCES[source.app].taskId(source) : ref
    const file = readTasks(dataDir)
    const task = file.tasks.find((t) => t.id === id)
    if (!task) return undefined
    const decisions = readDecisions(dataDir)
    const decision = decisions[id]
    const status = viewOf(task, decisions).status
    if (status !== 'open' && status !== 'maybe')
      return { task, refused: `it is ${status}` }

    const next: Partial<Record<TaskField, string | undefined>> = {}
    if (changes.title !== undefined && changes.title.trim())
      next.title = changes.title.trim().slice(0, 120)
    if (changes.due !== undefined) next.due = changes.due?.trim() || undefined
    if (changes.summary !== undefined && changes.summary.trim())
      next.summary = changes.summary.trim().slice(0, 600)
    if (changes.action) next.action = changes.action
    if (changes.repo === null) next.repo = undefined
    else if (changes.repo !== undefined && REPO.test(changes.repo.trim()))
      next.repo = changes.repo.trim()
    // A Maybe you kept is yours: a collection does not make it a Maybe again.
    if (changes.confidence && decision?.status !== 'kept')
      next.confidence = changes.confidence

    const changed: TaskUpdate['changed'] = []
    for (const [field, to] of Object.entries(next) as [
      TaskField,
      string | undefined,
    ][]) {
      const from = task[field] as string | undefined
      if (from !== to) changed.push({ field, from, to })
    }
    if (!changed.length) return { task, changed }
    const update: TaskUpdate = {
      at: now.toISOString(),
      why: why.trim().slice(0, 300),
      by,
      changed,
    }
    const updated: Task = {
      ...task,
      ...Object.fromEntries(changed.map(({ field, to }) => [field, to])),
      updates: [...(task.updates ?? []), update].slice(-UPDATES_KEPT),
    }
    writeTasks(dataDir, {
      ...file,
      tasks: file.tasks.map((t) => (t.id === id ? updated : t)),
    })
    return { task: updated, changed }
  })
}

/** A task an AI tool keeps from a session on this Mac */
export interface NewFollowUp {
  title: string
  /** Why it is a task, in a line */
  why: string
  /** The task it carries on from: its id or its message's link */
  after?: string
  due?: string
  summary?: string
  action?: TaskAction
  repo?: string
}

/** The task a reference names: its id, or its message's link */
const idOf = (ref: string) => {
  const source = findMessage(ref)
  return source ? SOURCES[source.app].taskId(source) : ref
}

/**
 * Adds a task of your own from a session on this Mac (its source is local):
 * work left after a task, which it then follows, or something you asked your
 * AI tool to keep for later. Its repository is the one named, the one of the
 * task it follows, or the session's. The same title left after the same task,
 * still open, is not added again.
 */
export function addFollowUp(
  dataDir: string,
  item: NewFollowUp,
  options: { addedBy?: string; repo?: string; now?: Date } = {}
): { task: Task; added: boolean } | { error: string } {
  return withTasksLock(dataDir, () => {
    const now = options.now ?? new Date()
    const title = item.title.trim().slice(0, 120)
    if (!title) return { error: 'A task needs a title.' }
    const file = readTasks(dataDir)
    const after = item.after
      ? file.tasks.find((t) => t.id === idOf(item.after!))
      : undefined
    if (item.after && !after) return { error: `No task ${item.after}` }
    const named = item.repo?.trim()
    const repo =
      named && REPO.test(named) ? named : (after?.repo ?? options.repo)
    const same = file.tasks.find(
      (t) =>
        t.source.app === 'local' &&
        t.follows === after?.id &&
        !t.closed &&
        t.title.toLowerCase() === title.toLowerCase()
    )
    if (same) return { task: same, added: false }
    const key = randomBytes(6).toString('hex')
    const task: Task = {
      id: `local:${key}`,
      source: {
        app: 'local',
        conversation: repo ?? 'local',
        label: repo ?? LOCAL.label,
        message: key,
      },
      title,
      askedBy: 'you',
      kind: 'promised',
      due: item.due?.trim() || undefined,
      confidence: 'sure',
      reason: item.why.trim().slice(0, 300) || 'Kept from a session',
      postedAt: now.toISOString(),
      foundAt: now.toISOString(),
      addedBy: options.addedBy,
      action: item.action ?? (repo ? 'code' : 'other'),
      repo,
      follows: after?.id,
      summary: item.summary?.trim().slice(0, 600) || undefined,
    }
    writeTasks(dataDir, { ...file, tasks: [...file.tasks, task] })
    return { task, added: true }
  })
}
