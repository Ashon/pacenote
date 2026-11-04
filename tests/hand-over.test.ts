import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HAND_OVER_MAX, handOverTasks } from '../src/tasks/hand-over.js'
import {
  buildView,
  readDecisions,
  readStages,
  readTasks,
} from '../src/tasks/store.js'
import type { AreaView } from '../src/you/types.js'

const iphone = { id: 'iphone-1', name: 'iPhone' }
const now = new Date('2026-11-04T12:00:00.000Z')

const payments: AreaView = {
  id: 'payments',
  name: 'Payments',
  parts: [{ kind: 'repo', id: 'ashon/payments', label: 'Ashon/payments' }],
  state: 'active',
  roles: [],
  now: [{ id: '1', title: 'Review the payment retry PR' }],
  lately: [],
  latelyMore: 0,
  people: [],
  weeks: [],
}

describe('tasks a device wrote before it paired', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true })
  })
  const dataDir = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-hand-over-'))
    dirs.push(dir)
    return dir
  }

  it('become your own tasks here, as you left them there', () => {
    const dir = dataDir()
    expect(
      handOverTasks(
        dir,
        [
          {
            id: 'local:aaaaaaaaaaaa',
            title: '  Fix the payment retry backoff  ',
            due: 'Friday',
            addedAt: '2026-11-03T09:00:00.000Z',
          },
          {
            id: 'local:bbbbbbbbbbbb',
            title: 'Ask jin about swapping on-call',
            addedAt: '2026-11-04T07:00:00.000Z',
            stage: { stage: 'waiting', at: '2026-11-04T08:00:00.000Z' },
          },
          {
            id: 'local:cccccccccccc',
            title: 'Book a dentist',
            // A clock ahead on the device: written now, as far as here knows
            addedAt: '2026-11-05T09:00:00.000Z',
            decision: {
              status: 'dismissed',
              reason: 'not-worth-it',
              at: '2026-11-04T11:00:00.000Z',
            },
          },
          {
            id: 'local:dddddddddddd',
            title: 'Renew the passport',
            decision: { status: 'done', reason: 'not-mine', at: 'later' },
            stage: { stage: 'started', at: '2026-11-04T10:00:00.000Z' },
          },
        ],
        iphone,
        { areas: [payments], now }
      )
    ).toEqual({ added: 4, already: 0, skipped: 0 })

    const tasks = readTasks(dir).tasks
    // Its words point to a project: in that project's repository
    expect(tasks[0]).toEqual({
      id: 'local:aaaaaaaaaaaa',
      source: {
        app: 'local',
        conversation: 'Ashon/payments',
        label: 'Ashon/payments',
        message: 'aaaaaaaaaaaa',
      },
      title: 'Fix the payment retry backoff',
      askedBy: 'you',
      kind: 'promised',
      due: 'Friday',
      confidence: 'sure',
      reason: 'Added on iPhone',
      postedAt: '2026-11-03T09:00:00.000Z',
      foundAt: now.toISOString(),
      addedBy: 'you',
      action: 'code',
      repo: 'Ashon/payments',
      device: { ...iphone, handedOver: now.toISOString() },
    })
    // None: where it was written
    expect(tasks[1]).toMatchObject({
      source: { label: 'iPhone', conversation: 'local' },
      action: 'other',
    })
    expect(tasks[1]!.repo).toBeUndefined()
    expect(tasks[2]!.postedAt).toBe(now.toISOString())

    // Dismissed (and why) and done as there; a done one is not also started
    expect(readDecisions(dir)).toEqual({
      'local:cccccccccccc': {
        status: 'dismissed',
        reason: 'not-worth-it',
        at: '2026-11-04T11:00:00.000Z',
      },
      'local:dddddddddddd': { status: 'done', at: now.toISOString() },
    })
    expect(readStages(dir)).toEqual({
      'local:bbbbbbbbbbbb': {
        stage: 'waiting',
        at: '2026-11-04T08:00:00.000Z',
      },
    })
    const view = buildView(readTasks(dir), readDecisions(dir), {
      now: now.getTime(),
    })
    const status = Object.fromEntries(
      view.tasks.map((task) => [task.id, task.status])
    )
    expect(status).toMatchObject({
      'local:aaaaaaaaaaaa': 'open',
      'local:bbbbbbbbbbbb': 'open',
      'local:cccccccccccc': 'dismissed',
      'local:dddddddddddd': 'done',
    })
  })

  it('never changes a task here, and adds nothing twice', () => {
    const dir = dataDir()
    const first = [{ id: 'local:aaaaaaaaaaaa', title: 'Book the offsite' }]
    handOverTasks(dir, first, iphone, { now })
    const before = readTasks(dir)
    expect(
      handOverTasks(
        dir,
        [
          {
            id: 'local:aaaaaaaaaaaa',
            title: 'Renamed',
            decision: { status: 'done', at: now.toISOString() },
          },
          { id: 'local:eeeeeeeeeeee', title: 'Once' },
          { id: 'local:eeeeeeeeeeee', title: 'Twice' },
        ],
        { id: 'ipad-1', name: 'iPad' },
        { now }
      )
    ).toEqual({ added: 1, already: 2, skipped: 0 })
    const after = readTasks(dir).tasks
    expect(after[0]).toEqual(before.tasks[0])
    expect(after.map((task) => task.title)).toEqual([
      'Book the offsite',
      'Once',
    ])
    expect(readDecisions(dir)).toEqual({})
  })

  it('takes only tasks a device makes', () => {
    const dir = dataDir()
    expect(
      handOverTasks(
        dir,
        [
          { id: 'C1:1730000000.000100', title: 'A Slack task' },
          { id: 'local:AAAAAAAAAAAA', title: 'Not as Pacenote writes one' },
          { id: 'local:aaaaaaaaaaaa', title: '   ' },
          { id: 'local:bbbbbbbbbbbb' },
          'local:cccccccccccc',
          null,
        ],
        iphone,
        { now }
      )
    ).toEqual({ added: 0, already: 0, skipped: 6 })
    expect(handOverTasks(dir, 'not a list', iphone, { now })).toEqual({
      added: 0,
      already: 0,
      skipped: 0,
    })
    expect(readTasks(dir).tasks).toEqual([])

    const many = Array.from({ length: HAND_OVER_MAX + 20 }, (_, i) => ({
      id: `local:${i.toString(16).padStart(12, '0')}`,
      title: `Task ${i}`,
    }))
    expect(handOverTasks(dir, many, iphone, { now }).added).toBe(HAND_OVER_MAX)
  })
})
