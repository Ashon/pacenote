import { getLocale, localized, type Locale } from '../i18n/locale.js'
import type { Outcome } from '../you/types.js'
import { text } from './context.text.js'
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
function lastSession(
  work: readonly WorkEntry[],
  task: string
): Session | undefined {
  return workFor(work, task).find(
    (entry): entry is Session => entry.kind === 'session'
  )
}

/** How a task ended (or where it stands); undefined when open */
export function outcomeFacts(
  task: TaskView,
  work: readonly WorkEntry[]
): Outcome | undefined {
  const session = lastSession(work, task.id)
  if (task.status === 'closed' && task.closed) {
    const by = toolName(task.closed.by)
    if (by)
      return {
        kind: 'done-in',
        by,
        ...(task.closed.note ? { note: task.closed.note } : {}),
      }
    if (task.closed.why === 'replied') return { kind: 'replied' }
    if (task.closed.why === 'checked') return { kind: 'checked' }
    return { kind: 'settled' }
  }
  if (task.status === 'done')
    return session ? { kind: 'done', tool: session.tool } : { kind: 'done' }
  if (task.status === 'dismissed') return { kind: 'dismissed' }
  return session ? { kind: 'worked', tool: session.tool } : undefined
}

/**
 * An outcome in words, in the app's language unless one is given (English
 * for an AI tool or a prompt)
 */
export function outcomeWords(
  outcome: Outcome | undefined,
  locale: Locale = getLocale()
): string | undefined {
  if (!outcome) return undefined
  const t = localized(text, locale)
  switch (outcome.kind) {
    case 'done-in':
      // The note is the AI tool's, as it closed the task
      return [t.doneIn(outcome.by), outcome.note].filter(Boolean).join(' · ')
    case 'done':
      return outcome.tool ? t.doneIn(TOOL_LABEL[outcome.tool]) : t.done
    case 'replied':
    case 'checked':
    case 'settled':
    case 'dismissed':
      return t[outcome.kind]
    case 'done-already':
      return t.doneAlready
    case 'worked':
      return t.workedIn(TOOL_LABEL[outcome.tool])
  }
}

/** How a task ended (or where it stands), in words; undefined when open */
export const outcomeOf = (
  task: TaskView,
  work: readonly WorkEntry[],
  locale: Locale = getLocale()
): string | undefined => outcomeWords(outcomeFacts(task, work), locale)

/** The thread a task's message is in: its own ts when it starts one */
export const threadOf = (task: Pick<TaskView, 'source'>) =>
  `${task.source.conversation}:${task.source.thread ?? task.source.message}`

function related(
  task: TaskView,
  work: WorkEntry[],
  locale: Locale
): RelatedTask {
  return {
    id: task.id,
    title: task.title,
    askedBy: task.askedBy,
    where: task.source.label,
    postedAt: task.postedAt,
    status: task.status,
    outcome: outcomeOf(task, work, locale),
    wrapUp: task.wrapUp?.text,
    session: lastSession(work, task.id),
  }
}

/**
 * What came before a task. all: every task kept (the history too), work: the
 * work log, runs: Pace's runs in the task's thread; outcomes in the app's
 * language unless one is given (English for an AI tool)
 */
export function taskContext(
  task: TaskView,
  all: TaskView[],
  work: WorkEntry[],
  runs: RelatedRun[] = [],
  locale: Locale = getLocale()
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
  const shown = (tasks: TaskView[]) =>
    tasks.slice(0, SHOWN).map((other) => related(other, work, locale))
  return {
    thread: { runs: runs.slice(0, SHOWN), tasks: shown(inThread) },
    repo:
      task.repo && inRepo.length
        ? { name: task.repo, tasks: shown(inRepo) }
        : undefined,
    person:
      task.askedBy && fromPerson.length
        ? { name: task.askedBy, tasks: shown(fromPerson) }
        : undefined,
  }
}
