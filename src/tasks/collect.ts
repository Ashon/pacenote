import type { Logger } from '../logger.js'
import type { Reasoner } from '../reasoners/types.js'
import { MAX_UNITS, parseTasks, taskPrompt } from './extract.js'
import {
  checked,
  gather,
  readThread,
  type Gathered,
  type SlackMessage,
  type SlackUserClient,
} from './slack.js'
import { prune, readDecisions, readTasks, writeTasks } from './store.js'
import type { Task, TaskDecisions } from './types.js'

export interface CollectOptions {
  client: SlackUserClient
  dataDir: string
  /** A reasoner with no tools: it only reads the kept messages */
  reasoner: Pick<Reasoner, 'complete'>
  timezone: string
  dms: boolean
  exclude: readonly string[]
  now?: Date
  onStep?: (step: 'reading' | 'picking') => void
  log?: Logger
}

export interface CollectResult {
  /** New tasks and Maybes */
  found: number
  /** Open tasks that closed by themselves */
  closed: number
  /** Places the reasoner looked at */
  looked: number
}

/** Threads read again to see whether an open task was answered */
const MAX_RECHECKS = 40

/**
 * One collection: read what is new in Slack, close the tasks you answered,
 * ask the reasoner about the rest, and write tasks.json. When anything fails,
 * nothing is written, so the next collection reads the same messages again.
 */
export async function collectTasks(
  options: CollectOptions
): Promise<CollectResult> {
  const now = options.now ?? new Date()
  const file = readTasks(options.dataDir)
  const decisions = readDecisions(options.dataDir)

  options.onStep?.('reading')
  const gathered = await gather(options.client, {
    readUpTo: file.readUpTo,
    dms: options.dms,
    exclude: options.exclude,
    now: now.getTime(),
  })
  const tasks = await closeAnswered(
    options.client,
    file.tasks,
    decisions,
    gathered,
    now,
    options.log
  )
  const closed = tasks.filter(
    (task, i) => task.closed && !file.tasks[i]!.closed
  ).length

  const known = new Set(file.tasks.map((task) => task.id))
  const fresh = gathered.units
    .filter((unit) => !known.has(unit.id))
    .slice(0, MAX_UNITS)
  let found: Task[] = []
  if (fresh.length > 0) {
    options.onStep?.('picking')
    const { system, prompt } = taskPrompt({
      me: gathered.me,
      units: fresh,
      timezone: options.timezone,
      now,
    })
    found = parseTasks(
      await options.reasoner.complete({ system, prompt }),
      fresh,
      now
    )
  }

  const next = prune(
    {
      version: 1,
      collectedAt: now.toISOString(),
      readUpTo: gathered.readUpTo,
      tasks: [...tasks, ...found],
    },
    decisions,
    now.getTime()
  ).tasks
  writeTasks(options.dataDir, next)
  return { found: found.length, closed, looked: fresh.length }
}

/**
 * Open tasks you have answered since: a reply of yours in the thread after
 * the request (or after it in a DM), or a check mark on its message. Tasks you
 * decided on yourself are left as they are.
 */
async function closeAnswered(
  client: SlackUserClient,
  tasks: Task[],
  decisions: TaskDecisions,
  gathered: Gathered,
  now: Date,
  log?: Logger
): Promise<Task[]> {
  const me = gathered.me.id
  let rechecks = 0
  const out: Task[] = []
  for (const task of tasks) {
    if (task.closed || decisions[task.id]) {
      out.push(task)
      continue
    }
    const { conversation, message, thread } = task.source
    const key = `${conversation}:${thread ?? message}`
    let messages: SlackMessage[] | undefined = gathered.threads.get(key)
    if (!messages && rechecks < MAX_RECHECKS) {
      rechecks += 1
      try {
        messages = conversation.startsWith('D')
          ? await readDm(client, conversation, message)
          : await readThread(client, conversation, thread ?? message)
      } catch (err) {
        log?.warn(`Could not check task ${task.id}: ${(err as Error).message}`)
      }
    }
    const replied =
      task.kind === 'asked' &&
      messages?.some((m) => m.user === me && Number(m.ts) > Number(message))
    const isChecked = checked(messages?.find((m) => m.ts === message))
    out.push(
      replied || isChecked
        ? {
            ...task,
            closed: {
              at: now.toISOString(),
              why: replied ? 'replied' : 'checked',
            },
          }
        : task
    )
  }
  return out
}

/** A DM from the message on, to see whether you answered */
async function readDm(
  client: SlackUserClient,
  channel: string,
  ts: string
): Promise<SlackMessage[]> {
  const res = await client.conversations.history({
    channel,
    oldest: ts,
    inclusive: true,
    limit: 100,
  })
  return (res.messages ?? []) as SlackMessage[]
}
