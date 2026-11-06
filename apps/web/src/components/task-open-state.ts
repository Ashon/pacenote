import { localized } from '@src/i18n/locale'
import type {
  RelatedRun,
  RelatedTask,
  TaskDetail,
  TaskUpdate,
  TaskView,
} from '@src/tasks/types'
import { changeWords, isNews, lastChange } from './task-changes'
import type { RowWords } from './task-row-state'
import { text } from './task-row.text'
import type { Session } from './task-sessions'

/**
 * What a task's opened row shows: the thread summed up, its latest change,
 * the one earlier thing most worth knowing and the rest on request, and the
 * reply drafted for you or left by a session. TaskOpen draws it as it is.
 */

/** One earlier thing: a task or Pace's run, with where it came from */
export type Earlier = {
  key: string
  group: 'thread' | 'repo' | 'person' | 'work'
  label: string
  task?: RelatedTask
  run?: RelatedRun
  session?: Session
}

type Draft = Extract<TaskDetail['work'][number], { kind: 'draft' }>

/**
 * What came before, as lines: the one most worth knowing first (a session to
 * continue, then Pace in the thread, then the person's task), then the rest
 */
export function earlierOf(detail: TaskDetail): {
  last?: Earlier
  rest: Earlier[]
} {
  const t = localized(text)
  const { thread, repo, person } = detail.context
  const tasks = (
    group: Earlier['group'],
    label: string,
    list: RelatedTask[] = []
  ) => list.map((task): Earlier => ({ key: task.id, group, label, task }))
  const lines = [
    ...tasks('thread', t.inThread, thread.tasks),
    ...thread.runs.map((run): Earlier => ({
      key: run.id,
      group: 'thread',
      label: t.inThread,
      run,
    })),
    ...tasks('repo', t.sameRepo, repo?.tasks),
    ...(person ? tasks('person', t.fromPerson(person.name), person.tasks) : []),
  ]
  const last =
    lines.find((line) => line.task?.session?.session) ??
    lines.find((line) => line.run) ??
    lines.find((line) => line.group === 'person') ??
    lines[0]
  return { last, rest: lines.filter((line) => line !== last) }
}

export interface TaskOpenState {
  /** The thread summed up, or why it is a task */
  summary?: string
  /** Done, dismissed or closed */
  settled: boolean
  /** Its latest change as its thread went on, while it is not settled */
  change?: TaskUpdate
  /** That change, field by field, in words */
  changeWords?: string
  /** The one earlier thing most worth knowing, as Last time */
  last?: Earlier
  /** Its latest session, as Your work */
  session?: Earlier
  /** Sessions that look like its work, while it is not settled */
  suggested: NonNullable<TaskDetail['suggested']>
  /** The rest of what came before, on request */
  rest: Earlier[]
  /** Nothing earlier to show at all */
  nothingEarlier: boolean
  /** The latest reply drafted for it */
  latestDraft?: Draft
  /** The reply in the box: yours as you edit it, or the latest drafted */
  replyText: string
  /** The reply box shows: drafting, editing, or a reply was drafted */
  showReply: boolean
  /** The reply the session left, until you have copied one */
  waiting?: string
}

/**
 * What the opened row shows of a task and its detail (none until it comes),
 * with your reply as you edit it
 */
export function taskOpenState(
  task: TaskView,
  detail: TaskDetail | null | undefined,
  { reply, drafting }: { reply?: string; drafting: boolean },
  t: RowWords
): TaskOpenState {
  const summary = task.summary || task.reason
  const settled = !['open', 'maybe'].includes(task.status)
  const change = settled ? undefined : lastChange(task)
  const sessions = (detail?.work ?? []).filter(
    (entry): entry is Session => entry.kind === 'session'
  )
  const suggested = settled ? [] : (detail?.suggested ?? [])
  const latestDraft = detail?.work.find(
    (entry): entry is Draft => entry.kind === 'draft'
  )
  const earlier = detail ? earlierOf(detail) : { rest: [] }
  const work = (session: Session): Earlier => ({
    key: session.id,
    group: 'work',
    label: t.yourWork,
    session,
  })
  return {
    summary,
    settled,
    change,
    changeWords: change?.changed.filter(isNews).map(changeWords).join(' · '),
    last: earlier.last && { ...earlier.last, label: t.lastTime },
    session: sessions[0] && work(sessions[0]),
    suggested,
    rest: [...sessions.slice(1).map(work), ...earlier.rest],
    nothingEarlier: !earlier.last && !sessions[0] && !suggested.length,
    latestDraft,
    replyText: reply ?? latestDraft?.text ?? '',
    showReply: drafting || reply !== undefined || !!latestDraft,
    waiting:
      reply === undefined &&
      !detail?.work.some((entry) => entry.kind === 'draft' && entry.copiedAt)
        ? task.closed?.reply
        : undefined,
  }
}
