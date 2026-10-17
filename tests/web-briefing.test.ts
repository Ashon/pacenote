import { describe, expect, it } from 'vitest'
import { briefLines } from '../apps/web/src/lib/briefing.js'
import type { RecapItem, RecapView } from '../src/you/types.js'

const payments = { id: 'a1', name: 'Payments' }
const task = (title: string, note?: string): RecapItem => ({
  title,
  task: `T-${title}`,
  area: payments,
  ...(note ? { note } : {}),
})
const commit = (title: string): RecapItem => ({ title, area: payments })

/** Today's recap, as the desktop app counts it */
const today = (day: NonNullable<RecapView['day']>): RecapView => ({
  period: 'day',
  key: '2026-10-18',
  start: '2026-10-18T00:00:00.000Z',
  end: '2026-10-19T00:00:00.000Z',
  current: true,
  prev: '2026-10-17',
  totals: { done: 0, commits: 0, days: 1, asks: 0, runs: 0, carried: 0 },
  areas: [],
  day,
  emails: [],
})

describe("the Overview's briefing", () => {
  it('says what is next, what you are on and what got done, each opening its place', () => {
    const view = today({
      done: [task('Ship retry backoff'), commit('fix: keep the key')],
      doing: [task('Webhook limits'), task('Release notes')],
      next: [
        task('Review PR #482', 'mina asked you · due Thursday'),
        task('Answer hyun'),
      ],
    })
    expect(briefLines(view, 5)).toEqual([
      {
        label: 'Next',
        text: 'Review PR #482',
        note: 'mina asked you · due Thursday · 4 more open',
        opens: { task: 'T-Review PR #482' },
      },
      {
        label: 'Doing',
        text: 'Webhook limits',
        note: 'and 1 more',
        opens: { task: 'T-Webhook limits' },
      },
      {
        label: 'Done today',
        text: '1 task and 1 commit in Payments',
        opens: 'recap',
      },
    ])
  })

  it("reaches back to yesterday in the morning, and leaves Todo's lines out with Todo off", () => {
    const view = today({
      yesterday: [
        task('Ship retry backoff'),
        { title: 'docs: notes', area: { id: 'a2', name: 'Docs' } },
      ],
      done: [],
      doing: [],
      next: [task('Review PR #482')],
    })
    expect(briefLines(view, undefined)).toEqual([
      {
        label: 'Yesterday',
        text: '1 task and 1 commit',
        opens: 'recap',
      },
    ])
  })

  it('has nothing to say on a quiet day, or for a day gone by', () => {
    expect(briefLines(today({ done: [], doing: [], next: [] }), 0)).toEqual([])
    expect(
      briefLines(
        {
          ...today({ done: [task('Old')], doing: [], next: [] }),
          current: false,
        },
        0
      )
    ).toEqual([])
    expect(briefLines(null, 3)).toEqual([])
  })
})
