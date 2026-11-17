import { describe, expect, it } from 'vitest'
import type { WorkEntry, WorkFile } from '../src/tasks/types.js'
import { linkSession, unlinkSession, unlinked } from '../src/tasks/work.js'

const NOW = new Date('2026-11-17T09:00:00Z')
const at = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60_000).toISOString()

const session = (
  id: string,
  task: string,
  patch: Partial<Extract<WorkEntry, { kind: 'session' }>> = {}
): WorkEntry => ({
  kind: 'session',
  id,
  task,
  tool: 'claude',
  session: 'abc',
  cwd: '/Users/me/payments',
  startedAt: at(-60),
  found: true,
  foundBy: 'tools',
  ...patch,
})

const file = (patch: Partial<WorkFile> = {}): WorkFile => ({
  version: 1,
  entries: [],
  suggested: [],
  notIt: [],
  proposals: [],
  ...patch,
})

const LINK = {
  task: 't1',
  tool: 'claude' as const,
  session: 'abc',
  cwd: '/Users/me/payments',
  startedAt: at(-60),
}

describe('linkSession: a session linked to a task yourself', () => {
  it("adds it as the task's work, said by you, no longer suggested", () => {
    const next = linkSession(
      file({
        suggested: [
          { ...LINK, id: 's1', kind: 'session', task: 't2', shares: ['#1'] },
          {
            ...LINK,
            id: 's2',
            kind: 'session',
            session: 'other',
            shares: ['retry'],
          },
        ],
      }),
      LINK,
      NOW,
      'e1'
    )
    expect(next.entries).toEqual([
      {
        kind: 'session',
        id: 'e1',
        ...LINK,
        found: true,
        foundBy: 'you',
        linkedAt: NOW.toISOString(),
      },
    ])
    expect(next.suggested?.map((s) => s.id)).toEqual(['s2'])
  })

  it('moves it off another task, which does not find it again', () => {
    const next = linkSession(
      file({
        entries: [session('old', 't0'), session('x', 't0', { session: 'zzz' })],
      }),
      LINK,
      NOW,
      'e1'
    )
    expect(next.entries.map((e) => [e.id, e.task])).toEqual([
      ['x', 't0'],
      ['e1', 't1'],
    ])
    expect(next.notIt).toEqual([
      { task: 't0', session: 'abc', at: NOW.toISOString() },
    ])
  })

  it('leaves it be when it is the task’s already, and forgets a no for it', () => {
    const was = file({
      entries: [session('e0', 't1')],
      notIt: [{ task: 't1', session: 'abc', at: at(-30) }],
    })
    const next = linkSession(was, LINK, NOW, 'e1')
    expect(next.entries.map((e) => e.id)).toEqual(['e0'])
    expect(next.notIt).toEqual([])
  })
})

describe('unlinkSession: a session taken off its task', () => {
  it('drops its links and keeps it from being found for them again', () => {
    const next = unlinkSession(
      file({
        entries: [
          session('e1', 't1'),
          session('e2', 't1', { session: 'other' }),
          { kind: 'draft', id: 'd1', task: 't1', at: at(-5), text: 'hi' },
        ],
        notIt: [{ task: 't1', session: 'abc', at: at(-90) }],
      }),
      'abc',
      NOW
    )
    expect(next.entries.map((e) => e.id)).toEqual(['e2', 'd1'])
    expect(next.notIt).toEqual([
      { task: 't1', session: 'abc', at: NOW.toISOString() },
    ])
  })

  it('changes nothing for a session on no task', () => {
    const was = file({ entries: [session('e1', 't1')] })
    expect(unlinkSession(was, 'nope', NOW)).toBe(was)
  })
})

describe('unlinked: a link taken back after it was made', () => {
  const notIt = (when: number) => new Map([['t1\nabc', { at: at(when) }]])
  it('by when you linked it, else by when it started', () => {
    expect(unlinked(session('e1', 't1'), notIt(-10))).toBe(true)
    expect(unlinked(session('e1', 't1'), notIt(-90))).toBe(false)
    expect(
      unlinked(session('e1', 't1', { linkedAt: at(-5) }), notIt(-10))
    ).toBe(false)
    expect(unlinked(session('e1', 't2'), notIt(-10))).toBe(false)
    expect(
      unlinked(
        { kind: 'draft', id: 'd', task: 't1', at: at(-1), text: '' },
        notIt(-10)
      )
    ).toBe(false)
  })
})
