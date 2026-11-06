import { describe, expect, it } from 'vitest'
import {
  declinedFrom,
  leaveOutOffer,
  rowFacts,
  skeletonRows,
  todoList,
  type ListData,
  type TodoPlace,
} from '../apps/web/src/lib/todo-list.js'
import type { TodoListView } from '../src/desktop-bridge.js'
import type { TaskView } from '../src/tasks/types.js'

const NOW = Date.parse('2026-11-07T09:00:00Z')
const HOUR = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()

const task = (id: string, extra: Partial<TaskView> = {}): TaskView => ({
  id,
  source: { conversation: 'C1', label: '#payments', message: id },
  title: `Task ${id}`,
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by name',
  postedAt: iso(NOW - 24 * HOUR),
  foundAt: iso(NOW - 20 * HOUR),
  status: 'open',
  faded: false,
  ...extra,
})

const data = (tasks: TaskView[], extra: Partial<ListData> = {}): ListData => ({
  tasks,
  stages: {},
  working: {},
  collectedAt: iso(NOW - HOUR),
  ...extra,
})

/** The tab's list as the page shows it, at NOW */
const list = (
  listData: ListData,
  place: Partial<TodoPlace> & Pick<TodoPlace, 'tab'>
) => todoList(listData, { doneRows: 10, now: NOW, ...place })

const ids = (tasks: readonly TaskView[]) => tasks.map((each) => each.id)

describe("Todo's tabs", () => {
  const tasks = [
    task('open'),
    task('waits', { status: 'open' }),
    task('maybe', { status: 'maybe' }),
    task('done', { status: 'done', settledAt: iso(NOW - HOUR) }),
    task('dismissed', { status: 'dismissed', settledAt: iso(NOW - 2 * HOUR) }),
  ]
  const listed = data(tasks, {
    stages: { waits: { stage: 'waiting', at: iso(NOW - HOUR) } },
  })

  it('lists each task under its tab, with the counts the tabs show', () => {
    expect(ids(list(listed, { tab: 'open' }).shown)).toEqual(['open'])
    expect(ids(list(listed, { tab: 'waiting' }).shown)).toEqual(['waits'])
    expect(ids(list(listed, { tab: 'maybe' }).shown)).toEqual(['maybe'])
    expect(ids(list(listed, { tab: 'done' }).shown)).toEqual([
      'done',
      'dismissed',
    ])
    expect(list(listed, { tab: 'open' }).counts).toEqual({
      open: 1,
      waiting: 1,
      maybe: 1,
    })
  })

  it('gives the open tasks their stages, from what you set', () => {
    expect(list(listed, { tab: 'open' }).stages).toEqual({
      waits: { stage: 'waiting', at: iso(NOW - HOUR), by: 'you' },
    })
  })

  it('lists nothing under Collections, which has its own list', () => {
    const collections = list(listed, { tab: 'collections' })
    expect(collections.shown).toEqual([])
    expect(collections.rows).toBe(0)
    expect(collections.note).toBeUndefined()
    expect(collections.empty).toBeUndefined()
  })
})

describe("a tab's order", () => {
  it('puts the tasks in progress first under Open', () => {
    const listed = data([task('a'), task('b'), task('c')], {
      stages: { c: { stage: 'started', at: iso(NOW - HOUR) } },
    })
    expect(ids(list(listed, { tab: 'open' }).shown)).toEqual(['c', 'a', 'b'])
  })

  it('counts a task an AI tool works on now as in progress', () => {
    const listed = data([task('a'), task('b')])
    expect(ids(list(listed, { tab: 'open', live: { b: {} } }).shown)).toEqual([
      'b',
      'a',
    ])
  })

  it('puts the longest waiting first, and the latest settled first', () => {
    const waiting = data([task('new'), task('old')], {
      stages: {
        new: { stage: 'waiting', at: iso(NOW - HOUR) },
        old: { stage: 'waiting', at: iso(NOW - 5 * HOUR) },
      },
    })
    expect(ids(list(waiting, { tab: 'waiting' }).shown)).toEqual(['old', 'new'])
    const settled = data([
      task('earlier', { status: 'done', settledAt: iso(NOW - 3 * HOUR) }),
      task('later', { status: 'done', settledAt: iso(NOW - HOUR) }),
    ])
    expect(ids(list(settled, { tab: 'done' }).shown)).toEqual([
      'later',
      'earlier',
    ])
  })
})

describe('tasks that come in while you look', () => {
  const listed = data([task('a'), task('b'), task('new')])

  it('wait behind the notice, so the rows you read stay put', () => {
    const open = list(listed, { tab: 'open', seen: new Set(['a', 'b']) })
    expect(ids(open.shown)).toEqual(['a', 'b'])
    expect(ids(open.arrived)).toEqual(['new'])
    expect(open.seenNow).toBeUndefined()
  })

  it('show at once when there is nothing listed for them to move', () => {
    const open = list(listed, { tab: 'open', seen: new Set(['other']) })
    expect(ids(open.shown)).toEqual(['a', 'b', 'new'])
    expect(open.arrived).toEqual([])
    expect([...open.seenNow!]).toEqual(['other', 'a', 'b', 'new'])
  })

  it('never hold back the task open in its row', () => {
    const open = list(listed, {
      tab: 'open',
      seen: new Set(['a', 'b']),
      openId: 'new',
    })
    expect(ids(open.shown)).toEqual(['a', 'b', 'new'])
    expect(open.arrived).toEqual([])
    expect([...open.seenNow!]).toEqual(['a', 'b', 'new'])
  })

  it('all show before the list first came, when nothing is seen yet', () => {
    const open = list(listed, { tab: 'open' })
    expect(ids(open.shown)).toEqual(['a', 'b', 'new'])
    expect(open.arrived).toEqual([])
    expect(open.seenNow).toBeUndefined()
  })
})

describe('the task open in its row', () => {
  it('stays in the tab it was opened in once settled, until it is closed', () => {
    const listed = data([
      task('a'),
      task('b', { status: 'done', settledAt: iso(NOW - HOUR) }),
    ])
    const held = { id: 'b', tab: 'open' as const }
    expect(ids(list(listed, { tab: 'open', openId: 'b', held }).shown)).toEqual(
      ['a', 'b']
    )
    // Closed, or held in another tab: it lists where it is
    expect(ids(list(listed, { tab: 'open', held }).shown)).toEqual(['a'])
    expect(
      ids(
        list(listed, {
          tab: 'open',
          openId: 'b',
          held: { id: 'b', tab: 'maybe' },
        }).shown
      )
    ).toEqual(['a'])
  })
})

describe('how many rows a tab lists', () => {
  const settled = data(
    Array.from({ length: 25 }, (_, i) =>
      task(`d${i}`, { status: 'done', settledAt: iso(NOW - i * HOUR) })
    )
  )

  it('lists every open task, and as many settled ones as you asked for', () => {
    const open = data(Array.from({ length: 12 }, (_, i) => task(`o${i}`)))
    expect(list(open, { tab: 'open', doneRows: 5 }).rows).toBe(12)
    expect(list(settled, { tab: 'done' }).rows).toBe(10)
    expect(list(settled, { tab: 'done', doneRows: 20 }).rows).toBe(20)
  })

  it('lists Done down to the task open in it', () => {
    expect(list(settled, { tab: 'done', openId: 'd17' }).rows).toBe(18)
    expect(list(settled, { tab: 'done', openId: 'd3' }).rows).toBe(10)
  })
})

describe('what a tab says', () => {
  it('says what Maybes and Waiting are, and how loosely Pace picks', () => {
    const listed = data([], { dismissRate: 0.256 })
    expect(list(listed, { tab: 'maybe' }).note).toEqual({ says: 'maybeNote' })
    expect(list(listed, { tab: 'waiting' }).note).toEqual({
      says: 'waitingNote',
    })
    expect(list(listed, { tab: 'done' }).note).toEqual({
      says: 'dismissRate',
      percent: 26,
    })
    expect(list(listed, { tab: 'open' }).note).toBeUndefined()
    expect(list(data([]), { tab: 'done' }).note).toBeUndefined()
  })

  it('says why a tab lists nothing', () => {
    const none = data([])
    expect(list(none, { tab: 'open' }).empty).toBe('nothingOpen')
    expect(list(none, { tab: 'waiting' }).empty).toBe('noWaiting')
    expect(list(none, { tab: 'maybe' }).empty).toBe('noMaybes')
    expect(list(none, { tab: 'done' }).empty).toBe('nothingSettled')
    // Never collected: what a first collection reads, or what would help
    const first = data([], { collectedAt: undefined })
    expect(list(first, { tab: 'open' }).empty).toBe('nothingYet')
    expect(list({ ...first, aiSet: false }, { tab: 'open' }).empty).toBe(
      'nothingYetNoAi'
    )
    expect(list(data([task('a')]), { tab: 'open' }).empty).toBeUndefined()
  })
})

describe("a task's row", () => {
  const facts = (
    tasks: TaskView[],
    id: string,
    extra: Partial<Pick<TodoListView, 'groups' | 'filling'>> = {}
  ) =>
    rowFacts(
      {
        tasks,
        groups: { yours: ['@payments'], notYours: ['@infra'] },
        ai: { chosen: 'codex', fallback: true, state: {} },
        ...extra,
      },
      tasks.find((each) => each.id === id)!
    )

  it('names the task it carries on from', () => {
    const tasks = [task('first'), task('next', { follows: 'first' })]
    expect(facts(tasks, 'next').follows?.title).toBe('Task first')
    expect(facts(tasks, 'first').follows).toBeUndefined()
    expect(
      facts([task('next', { follows: 'gone' })], 'next').follows
    ).toBeUndefined()
  })

  it('names the open task it looks like, until you say they are two', () => {
    const like = { task: 'old', at: iso(NOW) }
    const tasks = [task('old'), task('mine', { looksLike: like })]
    expect(facts(tasks, 'mine').looksLike?.id).toBe('old')
    const kept = [
      task('old'),
      task('mine', { looksLike: { ...like, keptBoth: iso(NOW) } }),
    ]
    expect(facts(kept, 'mine').looksLike).toBeUndefined()
    const settled = [
      task('old', { status: 'done' }),
      task('mine', { looksLike: like }),
    ]
    expect(facts(settled, 'mine').looksLike).toBeUndefined()
  })

  it("asks about a Maybe's user group while you have not said", () => {
    const tasks = [
      task('ask', { status: 'maybe', group: '@design' }),
      task('yours', { status: 'maybe', group: '@payments' }),
      task('not', { status: 'maybe', group: '@infra' }),
      task('open', { group: '@design' }),
    ]
    expect(facts(tasks, 'ask').askGroup).toBe('@design')
    expect(facts(tasks, 'yours').askGroup).toBeUndefined()
    expect(facts(tasks, 'not').askGroup).toBeUndefined()
    expect(facts(tasks, 'open').askGroup).toBeUndefined()
  })

  it('names the AI filling it in now', () => {
    const tasks = [task('a'), task('b')]
    expect(facts(tasks, 'a', { filling: ['a'] }).filling).toBe('Codex')
    expect(facts(tasks, 'b', { filling: ['a'] }).filling).toBeUndefined()
    expect(facts(tasks, 'a').filling).toBeUndefined()
  })
})

describe('the leave-out offer', () => {
  const leaveOut = { conversation: 'C9', label: '#random', count: 4 }

  it('offers a channel unless you turned it down', () => {
    expect(leaveOutOffer(leaveOut, [])).toBe(leaveOut)
    expect(leaveOutOffer(leaveOut, ['C9'])).toBeUndefined()
    expect(leaveOutOffer(undefined, [])).toBeUndefined()
  })

  it('reads the offers turned down as this browser kept them', () => {
    expect(declinedFrom(null)).toEqual([])
    expect(declinedFrom('["C1","C2"]')).toEqual(['C1', 'C2'])
    expect(declinedFrom('not json')).toEqual([])
  })
})

describe("the skeleton's rows", () => {
  it('are as many as the open tasks last time, up to 8, or 3', () => {
    expect(skeletonRows(null)).toBe(3)
    expect(skeletonRows('0')).toBe(3)
    expect(skeletonRows('nope')).toBe(3)
    expect(skeletonRows('5')).toBe(5)
    expect(skeletonRows('40')).toBe(8)
  })
})
