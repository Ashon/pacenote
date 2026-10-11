import type { TasksSettings } from './settings.js'
import { readTasks, writeTasks } from './store.js'
import type { Task, TaskConfidence, TaskKind } from './types.js'

/**
 * Adding and closing tasks, as the MCP server does for an AI tool. A task is
 * keyed by its Slack message, taken from the permalink, so the same message is
 * never added twice, and the settings (DMs, channels left out) hold whatever
 * the tool sends.
 */

/** A task as an AI tool sends it */
export interface NewTask {
  title: string
  kind?: TaskKind
  asked_by?: string
  /** "#payments", "DM with mina" */
  where: string
  /** The Slack permalink of the message the task comes from */
  link: string
  /** When the message was posted (ISO); taken from the link when absent */
  posted_at?: string
  due?: string
  confidence?: TaskConfidence
  reason?: string
}

export interface Skipped {
  link: string
  why: string
}

/**
 * The conversation and message in a Slack permalink:
 * https://acme.slack.com/archives/C123/p1700000000123456?thread_ts=1699.000100
 */
export function parsePermalink(
  link: string
): { conversation: string; message: string; thread?: string } | undefined {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return undefined
  }
  if (!/(^|\.)slack\.com$/.test(url.hostname)) return undefined
  const match = /^\/archives\/([A-Z0-9]+)\/p(\d{7,})$/.exec(url.pathname)
  if (!match) return undefined
  const digits = match[2]!
  const message = `${digits.slice(0, -6)}.${digits.slice(-6)}`
  const thread = url.searchParams.get('thread_ts') ?? undefined
  return { conversation: match[1]!, message, thread }
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
    const source = parsePermalink(item.link)
    if (!source) {
      skipped.push({ link: item.link, why: 'not a Slack message link' })
      continue
    }
    const id = `${source.conversation}:${source.message}`
    const title = item.title.trim()
    const excluded = leftOut(
      source.conversation,
      item.where,
      options.settings.exclude
    )
    const why = !title
      ? 'no title'
      : known.has(id)
        ? 'already a task'
        : excluded
          ? `${excluded} is left out`
          : !options.settings.dms && isDm(source.conversation, item.where)
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
      postedAt: new Date(
        Number.isNaN(posted) ? Number(source.message) * 1000 : posted
      ).toISOString(),
      foundAt: now.toISOString(),
      addedBy: options.addedBy,
    })
  }
  if (added.length > 0 || options.finished)
    writeTasks(dataDir, {
      version: 1,
      collectedAt: options.finished ? now.toISOString() : file.collectedAt,
      tasks: [...file.tasks, ...added],
    })
  return { added, skipped }
}

/** Closes an open task by its id or Slack link; undefined when there is none */
export function closeTask(
  dataDir: string,
  ref: string,
  why: NonNullable<Task['closed']>['why'],
  now = new Date()
): Task | undefined {
  const source = parsePermalink(ref)
  const id = source ? `${source.conversation}:${source.message}` : ref
  const file = readTasks(dataDir)
  const task = file.tasks.find((t) => t.id === id)
  if (!task) return undefined
  if (task.closed) return task
  const closed = { ...task, closed: { at: now.toISOString(), why } }
  writeTasks(dataDir, {
    ...file,
    tasks: file.tasks.map((t) => (t.id === id ? closed : t)),
  })
  return closed
}
