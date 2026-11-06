import type {
  RelatedTask,
  TaskDetail,
  TaskUpdate,
  TaskView,
} from '@src/tasks/types'
import { describe, expect, it } from 'vitest'
import { earlierOf, taskOpenState } from './task-open-state'
import { text } from './task-row.text'
import type { Session } from './task-sessions'

const task = (extra: Partial<TaskView> = {}): TaskView => ({
  id: 't1',
  source: { conversation: 'C1', label: '#payments', message: '1' },
  title: 'Review the retry PR',
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by name',
  postedAt: '2026-11-01T09:00:00Z',
  foundAt: '2026-11-01T09:05:00Z',
  status: 'open',
  faded: false,
  ...extra,
})

const session = (id: string, extra: Partial<Session> = {}): Session => ({
  kind: 'session',
  id,
  task: 't1',
  tool: 'claude',
  session: `${id}-tool-id`,
  cwd: '/Users/me/code/pay',
  startedAt: '2026-11-01T09:00:00Z',
  ...extra,
})

const earlier = (id: string, extra: Partial<RelatedTask> = {}) => ({
  id,
  title: `Earlier ${id}`,
  where: '#payments',
  postedAt: '2026-10-20T09:00:00Z',
  status: 'done' as const,
  ...extra,
})

const run = { id: 'r1', request: 'why 502?', at: '2026-10-30T09:00:00Z' }

const detail = (extra: Partial<TaskDetail> = {}): TaskDetail => ({
  task: task(),
  cli: 'claude',
  work: [],
  context: { thread: { runs: [], tasks: [] } },
  ...extra,
})

const keys = (lines: { key: string }[]) => lines.map((line) => line.key)

describe('what came before a task', () => {
  it('puts an earlier session to continue first, then the rest', () => {
    const { last, rest } = earlierOf(
      detail({
        context: {
          thread: {
            runs: [{ ...run, status: 'succeeded' }],
            tasks: [earlier('e1')],
          },
          repo: {
            name: 'acme/pay',
            tasks: [earlier('e2', { session: session('s2') })],
          },
          person: { name: 'mina', tasks: [earlier('e3')] },
        },
      })
    )
    expect(last).toMatchObject({ key: 'e2', group: 'repo', label: 'Same repo' })
    expect(keys(rest)).toEqual(['e1', 'r1', 'e3'])
    expect(rest.map((line) => line.label)).toEqual([
      'In this thread',
      'In this thread',
      'From mina',
    ])
  })

  it("with no session, Pace's run in the thread, then the person's task", () => {
    const thread = {
      runs: [{ ...run, status: 'succeeded' as const }],
      tasks: [earlier('e1')],
    }
    const person = { name: 'mina', tasks: [earlier('e3')] }
    expect(earlierOf(detail({ context: { thread, person } })).last?.key).toBe(
      'r1'
    )
    expect(
      earlierOf(
        detail({ context: { thread: { ...thread, runs: [] }, person } })
      ).last?.key
    ).toBe('e3')
    expect(
      earlierOf(detail({ context: { thread: { ...thread, runs: [] } } })).last
        ?.key
    ).toBe('e1')
    expect(earlierOf(detail())).toEqual({ last: undefined, rest: [] })
  })
})

describe("an opened task's panel", () => {
  const open = (
    view: TaskView,
    found: TaskDetail | undefined,
    reply?: string,
    drafting = false
  ) => taskOpenState(view, found, { reply, drafting }, text.en)

  it('reminds you of the thread and its latest change', () => {
    const update: TaskUpdate = {
      at: '2026-11-02T09:00:00Z',
      why: 'mina moved it',
      changed: [
        { field: 'due', from: 'Thursday', to: 'Wednesday' },
        { field: 'repo', to: 'acme/pay' },
      ],
    }
    const state = open(
      task({ summary: 'Mina wants the retry PR reviewed.', updates: [update] }),
      undefined
    )
    expect(state.summary).toBe('Mina wants the retry PR reviewed.')
    expect(state.change).toBe(update)
    // Only the news: filling in the repository is not
    expect(state.changeWords).toBe('Due Thursday → Wednesday')
    expect(open(task(), undefined).summary).toBe('asked by name')
    expect(
      open(task({ status: 'done', updates: [update] }), undefined).change
    ).toBeUndefined()
  })

  it('shows Last time, your latest session, and the rest on request', () => {
    const state = open(
      task(),
      detail({
        work: [session('s1'), session('s0')],
        context: {
          thread: { runs: [], tasks: [earlier('e1'), earlier('e2')] },
        },
      })
    )
    expect(state.last).toMatchObject({ key: 'e1', label: 'Last time' })
    expect(state.session).toMatchObject({ key: 's1', label: 'Your work' })
    expect(keys(state.rest)).toEqual(['s0', 'e2'])
    expect(state.nothingEarlier).toBe(false)
  })

  it('says there is nothing earlier, unless a session looks related', () => {
    expect(open(task(), detail()).nothingEarlier).toBe(true)
    const suggested = [{ ...session('maybe'), shares: ['#482'] }]
    const state = open(task(), detail({ suggested }))
    expect(state.suggested).toEqual(suggested)
    expect(state.nothingEarlier).toBe(false)
    // Settled, it asks about sessions no more
    expect(
      open(task({ status: 'done' }), detail({ suggested })).suggested
    ).toEqual([])
  })

  it('holds the reply drafted, or yours as you edit it', () => {
    const drafted = {
      kind: 'draft' as const,
      id: 'd1',
      task: 't1',
      at: '2026-11-02T09:00:00Z',
      text: 'Looking at it today.',
    }
    expect(open(task(), detail())).toMatchObject({
      showReply: false,
      replyText: '',
    })
    expect(open(task(), detail(), undefined, true).showReply).toBe(true)
    const found = detail({ work: [drafted] })
    expect(open(task(), found)).toMatchObject({
      showReply: true,
      replyText: 'Looking at it today.',
      latestDraft: drafted,
    })
    expect(open(task(), found, 'On it.').replyText).toBe('On it.')
  })

  it('offers the reply a session left until you copy one', () => {
    const closed = task({
      status: 'closed',
      closed: { at: '2026-11-02T09:00:00Z', why: 'resolved', reply: 'Done!' },
    })
    expect(open(closed, detail()).waiting).toBe('Done!')
    expect(open(closed, undefined).waiting).toBe('Done!')
    // Once you edit it, it is in the reply box instead
    expect(open(closed, detail(), 'Done!').waiting).toBeUndefined()
    const copied = detail({
      work: [
        {
          kind: 'draft',
          id: 'd1',
          task: 't1',
          at: '2026-11-02T09:00:00Z',
          text: 'Done!',
          copiedAt: '2026-11-02T10:00:00Z',
        },
      ],
    })
    expect(open(closed, copied).waiting).toBeUndefined()
  })
})
