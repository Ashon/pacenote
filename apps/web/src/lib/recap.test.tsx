import { describe, expect, it } from 'vitest'
import type { RecapView } from '@src/you/types'
import { totalsLine } from './recap'

/** A week's recap, its current one, with a git email to count commits by */
const week = (totals: RecapView['totals']): RecapView => ({
  period: 'week',
  key: '2026-10-05',
  start: '2026-10-05T00:00:00.000Z',
  end: '2026-10-12T00:00:00.000Z',
  current: true,
  prev: '2026-09-28',
  totals,
  areas: [],
  emails: ['a@b.c'],
})

describe('totalsLine', () => {
  it('says every count the period has', () => {
    expect(
      totalsLine(
        week({ done: 3, commits: 6, days: 5, asks: 0, runs: 0, carried: 2 })
      )
    ).toBe('3 done · 6 commits · work on 5 days · 2 still open')
  })

  it('says nothing when the period has nothing', () => {
    expect(
      totalsLine(
        week({ done: 0, commits: 0, days: 0, asks: 0, runs: 0, carried: 0 })
      )
    ).toBe('')
  })

  it('leaves out the counts that are zero', () => {
    expect(
      totalsLine(
        week({ done: 0, commits: 0, days: 2, asks: 0, runs: 0, carried: 0 })
      )
    ).toBe('work on 2 days')
  })
})
