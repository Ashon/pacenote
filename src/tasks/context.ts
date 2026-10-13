import type {
  RelatedRun,
  RelatedTask,
  TaskContext,
  TaskView,
  WorkEntry,
  WorkTool,
} from './types.js'
import { workFor } from './work.js'

/**
 * What came before a task, for its detail and for the session it is continued
 * in: earlier tasks in its thread, in its repository and from the person who
 * asked, each with how it ended, and Pace's runs in the thread. A few of each,
 * newest first.
 */

const SHOWN = 3

export const TOOL_LABEL: Record<WorkTool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

/** The AI tool that closed a task, by its MCP client name ("claude-code") */
function toolName(client: string | undefined): string | undefined {
  if (!client) return undefined
  if (/claude/i.test(client)) return TOOL_LABEL.claude
  if (/codex/i.test(client)) return TOOL_LABEL.codex
  return client
}

type Session = Extract<WorkEntry, { kind: 'session' }>

/** A task's latest session, the one to continue */
export function lastSession(
  work: WorkEntry[],
  task: string
): Session | undefined {
  return workFor(work, task).find(
    (entry): entry is Session => entry.kind === 'session'
  )
}

/** How a task ended (or where it stands), in words; undefined when open */
export function outcomeOf(
  task: TaskView,
  work: WorkEntry[]
): string | undefined {
  const session = lastSession(work, task.id)
  const where = session ? ` in ${TOOL_LABEL[session.tool]}` : ''
  if (task.status === 'closed' && task.closed) {
    const by = toolName(task.closed.by)
    if (by)
      return [`Done in ${by}`, task.closed.note].filter(Boolean).join(' · ')
    if (task.closed.why === 'replied') return 'You replied in the thread'
    if (task.closed.why === 'checked') return 'Marked with a check'
    return 'Settled in Slack'
  }
  if (task.status === 'done') return `Done${where}`
  if (task.status === 'dismissed') return 'Dismissed'
  return session ? `Worked on${where}` : undefined
}

/** The thread a task's message is in: its own ts when it starts one */
export const threadOf = (task: Pick<TaskView, 'source'>) =>
  `${task.source.conversation}:${task.source.thread ?? task.source.message}`

function related(task: TaskView, work: WorkEntry[]): RelatedTask {
  return {
    id: task.id,
    title: task.title,
    askedBy: task.askedBy,
    where: task.source.label,
    postedAt: task.postedAt,
    status: task.status,
    outcome: outcomeOf(task, work),
    session: lastSession(work, task.id),
  }
}

/**
 * What came before a task. all: every task kept (the history too), work: the
 * work log, runs: Pace's runs in the task's thread
 */
export function taskContext(
  task: TaskView,
  all: TaskView[],
  work: WorkEntry[],
  runs: RelatedRun[] = []
): TaskContext {
  const others = all
    .filter((other) => other.id !== task.id)
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
  const thread = threadOf(task)
  const inThread = others.filter((other) => threadOf(other) === thread)
  const seen = new Set(inThread.map((other) => other.id))
  const repo = task.repo?.toLowerCase()
  const inRepo = repo
    ? others.filter(
        (other) => !seen.has(other.id) && other.repo?.toLowerCase() === repo
      )
    : []
  for (const other of inRepo.slice(0, SHOWN)) seen.add(other.id)
  const person =
    task.kind === 'asked' && task.askedBy ? task.askedBy.toLowerCase() : ''
  const fromPerson = person
    ? others.filter(
        (other) =>
          !seen.has(other.id) &&
          other.kind === 'asked' &&
          other.askedBy?.toLowerCase() === person
      )
    : []
  return {
    thread: {
      runs: runs.slice(0, SHOWN),
      tasks: inThread.slice(0, SHOWN).map((other) => related(other, work)),
    },
    repo:
      task.repo && inRepo.length
        ? {
            name: task.repo,
            tasks: inRepo.slice(0, SHOWN).map((other) => related(other, work)),
          }
        : undefined,
    person:
      task.askedBy && fromPerson.length
        ? {
            name: task.askedBy,
            tasks: fromPerson
              .slice(0, SHOWN)
              .map((other) => related(other, work)),
          }
        : undefined,
  }
}
