import type { TasksSettings } from './settings.js'
import { findMessage, SOURCES, sourceNames, type SourceId } from './sources.js'
import { HISTORY_MS, readTasks, writeTasks } from './store.js'
import type { Task, TaskAction, TaskConfidence, TaskKind } from './types.js'

/**
 * Adding and closing tasks, as the MCP server does for an AI tool. A task is
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
    now?: Date
  }
): { added: Task[]; skipped: Skipped[] } {
  const now = options.now ?? new Date()
  const file = readTasks(dataDir)
  const known = new Set(file.tasks.map((task) => task.id))
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
      askedBy: kind === 'promised' ? 'you' : item.asked_by?.trim() || undefined,
      kind,
      due: item.due?.trim() || undefined,
      confidence: item.confidence ?? 'maybe',
      reason: (item.reason ?? '').trim().slice(0, 300),
      action: item.action,
      repo:
        item.repo && REPO.test(item.repo.trim()) ? item.repo.trim() : undefined,
      summary: item.summary?.trim().slice(0, 600) || undefined,
      postedAt: new Date(
        Number.isNaN(posted)
          ? (SOURCES[source.app].postedAt?.(source) ?? now.getTime())
          : posted
      ).toISOString(),
      foundAt: now.toISOString(),
      addedBy: options.addedBy,
    })
  }
  if (added.length > 0 || options.finished)
    writeTasks(dataDir, {
      version: 1,
      collectedAt: options.finished ? now.toISOString() : file.collectedAt,
      // Kept as the history earlier tasks are read from, then dropped
      tasks: [...file.tasks, ...added].filter(
        (task) => now.getTime() - Date.parse(task.foundAt) < HISTORY_MS
      ),
    })
  return { added, skipped }
}

/** Closes an open task by its id or its message's link; undefined when none */
export function closeTask(
  dataDir: string,
  ref: string,
  why: NonNullable<Task['closed']>['why'],
  now = new Date(),
  /** Who closed it, what was done, and a reply to send */
  more: { by?: string; note?: string; reply?: string } = {}
): Task | undefined {
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
  }
  writeTasks(dataDir, {
    ...file,
    tasks: file.tasks.map((t) => (t.id === id ? closed : t)),
  })
  return closed
}
