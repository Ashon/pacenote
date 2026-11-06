import { describe, expect, it } from 'vitest'
import { dayDirFor } from '../src/history/layout.js'
import { buildView, decide, readDecisions } from '../src/tasks/store.js'
import { taskTrend } from '../src/tasks/trend.js'
import type { Task, TasksFile, WorkEntry } from '../src/tasks/types.js'
import { dataDirs, DAY, NOW, task } from './helpers/tasks.js'

/** Reading your tasks: the list as the app shows it, and how it trends */

const dir = dataDirs()

describe('the tasks view', () => {
  const file = (tasks: Task[]): TasksFile => ({ version: 1, tasks })

  it('shows your decisions over what was found, newest first', () => {
    const view = buildView(
      file([
        task('a', { postedAt: new Date(NOW - 3 * DAY).toISOString() }),
        task('b', { confidence: 'maybe' }),
        task('c', {
          closed: { at: new Date(NOW).toISOString(), why: 'replied' },
        }),
        task('d', { confidence: 'maybe' }),
        task('e', {
          closed: { at: new Date(NOW).toISOString(), why: 'checked' },
        }),
        task('f', { postedAt: new Date(NOW - 8 * DAY).toISOString() }),
        task('g'),
      ]),
      {
        d: { status: 'kept', at: new Date(NOW).toISOString() },
        e: { status: 'kept', at: new Date(NOW).toISOString() },
        g: {
          status: 'dismissed',
          reason: 'not-mine',
          at: new Date(NOW).toISOString(),
        },
      },
      { now: NOW }
    )
    const byId = Object.fromEntries(view.tasks.map((t) => [t.id, t]))
    expect(byId.a!.status).toBe('open')
    expect(byId.b!.status).toBe('maybe')
    expect(byId.c!.status).toBe('closed')
    // Kept: a Maybe moved into the list, and a closed task opened again
    expect(byId.d!.status).toBe('open')
    expect(byId.e!.status).toBe('open')
    // Open for over a week: faded
    expect(byId.f!.faded).toBe(true)
    expect(byId.a!.faded).toBe(false)
    expect(byId.g).toMatchObject({
      status: 'dismissed',
      dismissReason: 'not-mine',
    })
    expect(view.tasks.at(-1)!.id).toBe('f')
  })

  it('measures the dismiss rate and offers to leave out a channel you keep dismissing', () => {
    const decided = (status: 'done' | 'dismissed', reason?: 'not-mine') => ({
      status,
      reason,
      at: new Date(NOW).toISOString(),
    })
    const random = { conversation: 'C9', label: '#random', message: 'x' }
    const tasks = [
      task('r1', { source: { ...random, message: 'r1' } }),
      task('r2', { source: { ...random, message: 'r2' } }),
      task('r3', { source: { ...random, message: 'r3' } }),
      task('p1'),
    ]
    const decisions = {
      r1: decided('dismissed', 'not-mine'),
      r2: decided('dismissed', 'not-mine'),
      r3: decided('dismissed', 'not-mine'),
      p1: decided('done'),
    }
    const view = buildView(file(tasks), decisions, { now: NOW })
    expect(view.dismissRate).toBe(0.75)
    expect(view.leaveOut).toEqual({
      conversation: 'C9',
      label: '#random',
      count: 3,
    })
    // Left out already: no offer
    expect(
      buildView(file(tasks), decisions, { now: NOW, excluded: ['#random'] })
        .leaveOut
    ).toBeUndefined()
    expect(
      buildView(file([task('z')]), {}, { now: NOW }).dismissRate
    ).toBeUndefined()
  })

  it('keeps decisions in their own file, which a collection never writes', () => {
    const data = dir('decisions')
    decide(
      data,
      'a',
      { status: 'dismissed', reason: 'not-mine' },
      new Date(NOW)
    )
    decide(data, 'b', { status: 'done' })
    decide(data, 'b', undefined)
    expect(readDecisions(data)).toEqual({
      a: {
        status: 'dismissed',
        reason: 'not-mine',
        at: new Date(NOW).toISOString(),
      },
    })
  })
})

describe('the task trend', () => {
  const HOUR = 60 * 60_000
  const at = (ms: number) => new Date(ms).toISOString()
  const session = (task: string): WorkEntry => ({
    kind: 'session',
    id: `work-${task}`,
    task,
    tool: 'claude',
    cwd: '/tmp',
    startedAt: at(NOW - 2 * HOUR),
  })

  it('counts what you handled each day, by how it ended', () => {
    const tasks = buildView(
      {
        version: 1,
        tasks: [
          // Closed in Slack: a reply, two hours after its message
          task('replied', {
            postedAt: at(NOW - 3 * HOUR),
            closed: { at: at(NOW - HOUR), why: 'replied' },
          }),
          // Closed by an AI tool
          task('by-tool', {
            postedAt: at(NOW - 2 * DAY),
            closed: {
              at: at(NOW - 2 * DAY + 4 * HOUR),
              why: 'resolved',
              by: 'claude-code',
            },
          }),
          // Marked done a day after its message, after a session for it
          task('worked', { postedAt: at(NOW - 4 * DAY) }),
          // Marked done; dismissed as done already
          task('done', { postedAt: at(NOW - 4 * DAY) }),
          task('done-already', { postedAt: at(NOW - 4 * DAY) }),
          // Not handled: dismissed as not yours, open, a maybe
          task('not-mine'),
          task('open'),
          task('maybe', { confidence: 'maybe' }),
        ],
      },
      {
        worked: { status: 'done', at: at(NOW - 3 * DAY) },
        done: { status: 'done', at: at(NOW - 3 * DAY) },
        'done-already': {
          status: 'dismissed',
          reason: 'done-already',
          at: at(NOW - 3 * DAY),
        },
        'not-mine': {
          status: 'dismissed',
          reason: 'not-mine',
          at: at(NOW - HOUR),
        },
      },
      { now: NOW }
    ).tasks
    const trend = taskTrend(tasks, [session('worked')], new Date(NOW))

    expect(trend.daily).toHaveLength(14)
    expect(trend.daily.at(-1)?.day).toBe(dayDirFor(new Date(NOW)))
    const day = (ms: number) =>
      trend.daily.find((entry) => entry.day === dayDirFor(new Date(ms)))
        ?.handled
    expect(trend.daily.reduce((sum, entry) => sum + entry.handled, 0)).toBe(5)
    expect(day(NOW - 3 * DAY)).toBe(3)
    expect(trend.how).toEqual({ tool: 2, slack: 1, you: 2 })
    expect(trend.open).toBe(1)
    // 2 hours, 4 hours, and a day three times
    expect(trend.medianMs).toBe(DAY)
  })

  it('leaves out what was handled before the 14 days', () => {
    const old = {
      ...buildView({ version: 1, tasks: [task('old')] }, {}, { now: NOW })
        .tasks[0]!,
      status: 'done' as const,
      settledAt: at(NOW - 15 * DAY),
    }
    const trend = taskTrend([old], [], new Date(NOW))
    expect(trend.how).toEqual({ tool: 0, slack: 0, you: 0 })
    expect(trend.medianMs).toBeUndefined()
  })
})
