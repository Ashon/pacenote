// Relative imports, so the tests (and the root's typecheck) can load it
import { localized } from '../../../../src/i18n/locale.js'
import type { RecapItem, RecapView } from '../../../../src/you/types.js'
import { text } from './briefing.text.js'

/**
 * Where your work stands, in three lines at most, from today's recap (the
 * standup the Recap screen shows): what is next, what you are on, and what
 * got done today (in the morning, yesterday). Each line opens its place.
 * Nothing is written for it, so it costs nothing; with nothing to say there
 * is none.
 */

export interface BriefLine {
  label: string
  text: string
  note?: string
  /** What it opens: a task in Todo, Todo, or today's recap */
  opens: { task: string } | 'tasks' | 'recap'
}

/** The lines, from today's recap; Next and Doing only with Todo on */
export function briefLines(
  view: RecapView | null | undefined,
  /** Open tasks now (the Overview's trend); undefined with Todo off */
  open: number | undefined
): BriefLine[] {
  const t = localized(text)
  const day = view?.current ? view.day : undefined
  if (!day) return []
  const lines: BriefLine[] = []
  const next = day.next[0]
  if (open !== undefined && next)
    lines.push({
      label: t.next,
      text: next.title,
      note: [next.note, open > 1 ? t.moreOpen(open - 1) : undefined]
        .filter(Boolean)
        .join(' · '),
      opens: next.task ? { task: next.task } : 'tasks',
    })
  const doing = day.doing[0]
  if (open !== undefined && doing)
    lines.push({
      label: t.doing,
      text: doing.title,
      note: day.doing.length > 1 ? t.andMore(day.doing.length - 1) : '',
      opens: doing.task ? { task: doing.task } : 'tasks',
    })
  const today = day.done.length > 0
  const done = today ? day.done : (day.yesterday ?? [])
  if (done.length)
    lines.push({
      label: today ? t.doneToday : t.yesterday,
      text: doneWords(done),
      opens: 'recap',
    })
  return lines
}

/** "2 tasks and 3 commits in Payments": the area only when there is one */
function doneWords(items: RecapItem[]): string {
  const t = localized(text)
  const tasks = items.filter((item) => item.task).length
  const areas = new Set(items.map((item) => item.area?.name ?? ''))
  const [only] = areas
  return t.done(
    tasks,
    items.length - tasks,
    areas.size === 1 && only ? only : undefined
  )
}
