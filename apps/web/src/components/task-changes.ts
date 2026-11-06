import { localized } from '@src/i18n/locale'
import { isFillUpdate } from '@src/tasks/filled'
import type { TaskUpdate, TaskView } from '@src/tasks/types'
import { text } from './task-row.text'

/**
 * What changed in a task as its thread went on, as its row says it: the
 * latest change, and each change in words
 */

/** One field an update changed, from what to what */
export type Change = TaskUpdate['changed'][number]

/**
 * News in an update: a field it had that changed, or a due date, title or
 * certainty; filling in what an older task lacked is not
 */
export const isNews = (change: Change) =>
  change.from !== undefined ||
  ['due', 'title', 'confidence'].includes(change.field)

/**
 * The latest update that changed the task as its thread went on: not your
 * AI filling in a task you added, nor Undo of it
 */
export function lastChange(task: TaskView): TaskUpdate | undefined {
  return (task.updates ?? [])
    .filter((u) => !isFillUpdate(u) && u.changed.some(isNews))
    .slice(-1)[0]
}

/**
 * A change in words: "Due Thursday → Wednesday" (the due dates are the AI's
 * words, as the thread had them)
 */
export function changeWords(change: Change): string {
  const t = localized(text)
  const { from, to } = change
  switch (change.field) {
    case 'due':
      return from && to
        ? t.dueMoved(from, to)
        : to
          ? t.due(to)
          : t.noLongerDue(from)
    case 'title':
      return t.wasTitle(from)
    case 'confidence':
      return to === 'sure' ? t.nowSure : t.nowMaybe
    case 'repo':
      return to ? t.repo(to) : t.noRepo
    case 'action':
      return t.nowAction(t.actionWord[to ?? ''] ?? to)
    case 'summary':
      return t.summaryUpdated
    case 'follows':
      return t.nowFollows
    case 'askedBy':
      return t.askedNow(to)
    case 'kind':
      return t.nowKind
  }
}
