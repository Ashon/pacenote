import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ADDED_BY_YOU } from '../src/tasks/sources.js'
import {
  cleanStages,
  RECENT_SESSION_MS,
  stageOf,
  stagesOf,
  type StageRecord,
} from '../src/tasks/stage.js'
import { sortForTab, tabOf } from '../src/tasks/tabs.js'
import {
  buildView,
  decide,
  HISTORY_MS,
  readDecisions,
  readStages,
  readTasks,
  setStage,
  STAGES_FILE,
  viewOf,
  writeTasks,
} from '../src/tasks/store.js'
import type { Task, TaskView } from '../src/tasks/types.js'
import { addFollowUp } from '../src/tasks/write.js'
import { taskArea } from '../src/you/areas.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-stage-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const dir = (name: string) => path.join(root, name)

const NOW = Date.parse('2026-10-28T09:00:00Z')
const HOUR = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  source: { conversation: 'C1', label: '#payments', message: id },
  title: `Task ${id}`,
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by name',
  postedAt: iso(NOW - 24 * HOUR),
  foundAt: iso(NOW - 20 * HOUR),
  ...extra,
})
const open = (extra: Partial<Task> = {}): TaskView => ({
  ...task('t', extra),
  status: 'open',
  faded: false,
})
const record = (stage: StageRecord['stage'], ago: number): StageRecord => ({
  stage,
  at: iso(NOW - ago),
})

describe("an open task's stage", () => {
  it('waits until the collection changes the task after you said so', () => {
    const waiting = record('waiting', 3 * HOUR)
    expect(stageOf(open(), waiting, {}, NOW)).toEqual({
      stage: 'waiting',
      at: waiting.at,
      by: 'you',
    })
    // Someone answered: the thread changed the task after it
    const answered = open({
      updates: [{ at: iso(NOW - HOUR), why: 'jin answered', changed: [] }],
    })
    expect(stageOf(answered, waiting, {}, NOW)).toBeUndefined()
    // A change from before you said so does not end the wait
    const before = open({
      updates: [{ at: iso(NOW - 5 * HOUR), why: 'moved', changed: [] }],
    })
    expect(stageOf(before, waiting, {}, NOW)?.stage).toBe('waiting')
  })

  it('is in progress when you say so, or when a session worked on it lately', () => {
    expect(stageOf(open(), record('started', 2 * HOUR), {}, NOW)).toMatchObject(
      { stage: 'started', by: 'you' }
    )
    const session = iso(NOW - 10 * HOUR)
    expect(stageOf(open(), undefined, { sessionAt: session }, NOW)).toEqual({
      stage: 'started',
      at: session,
      by: 'session',
    })
    // A session over a day ago is not progress any more
    const old = iso(NOW - RECENT_SESSION_MS - HOUR)
    expect(stageOf(open(), undefined, { sessionAt: old }, NOW)).toBeUndefined()
    expect(stageOf(open(), undefined, { live: true }, NOW)?.stage).toBe(
      'started'
    )
  })

  it('keeps it open after you take the stage back, until a newer session', () => {
    const back = record('open', 2 * HOUR)
    expect(
      stageOf(open(), back, { sessionAt: iso(NOW - 3 * HOUR) }, NOW)
    ).toBeUndefined()
    expect(
      stageOf(open(), back, { sessionAt: iso(NOW - HOUR) }, NOW)?.stage
    ).toBe('started')
  })

  it('has none for a task that is not open', () => {
    for (const status of ['maybe', 'done', 'dismissed', 'closed'] as const)
      expect(
        stageOf(
          { ...open(), status },
          record('waiting', HOUR),
          { live: true },
          NOW
        )
      ).toBeUndefined()
  })

  it('keeps only records that make sense, from the file or another Mac', () => {
    expect(
      cleanStages({
        a: { stage: 'waiting', at: iso(NOW) },
        b: { stage: 'paused', at: iso(NOW) },
        c: { stage: 'started', at: 'soon' },
        d: null,
        e: 'started',
      })
    ).toEqual({ a: { stage: 'waiting', at: iso(NOW) } })
    expect(cleanStages([])).toEqual({})
    expect(cleanStages('nope')).toEqual({})
  })
})

describe("Todo's tabs, the same on the Mac and on a device", () => {
  const view = (id: string, extra: Partial<TaskView> = {}): TaskView => ({
    ...open(),
    id,
    ...extra,
  })

  it('lists an open task waiting on someone under Waiting', () => {
    const stages = stagesOf(
      {
        tasks: [view('a'), view('b'), view('c', { status: 'maybe' })],
        stages: { a: record('waiting', HOUR), b: record('started', HOUR) },
      },
      undefined,
      NOW
    )
    expect(tabOf(view('a'), stages.a)).toBe('waiting')
    expect(tabOf(view('b'), stages.b)).toBe('open')
    expect(tabOf(view('c', { status: 'maybe' }))).toBe('maybe')
    expect(tabOf(view('d', { status: 'dismissed' }))).toBe('done')
    expect(stages.c).toBeUndefined()
  })

  it('takes a stage from a session or from an AI tool at work now', () => {
    const tasks = [view('a'), view('b')]
    const stages = stagesOf(
      { tasks, working: { a: { at: iso(NOW - HOUR) } } },
      { b: { by: 'claude' } },
      NOW
    )
    expect(stages.a).toMatchObject({ stage: 'started', by: 'session' })
    expect(stages.b).toMatchObject({ stage: 'started', by: 'session' })
  })

  it('orders each tab: in progress, longest waiting, latest settled', () => {
    const stages = {
      b: { stage: 'started' as const, at: iso(NOW), by: 'you' as const },
    }
    expect(
      sortForTab([view('a'), view('b')], 'open', stages).map((t) => t.id)
    ).toEqual(['b', 'a'])
    const waiting = {
      a: { stage: 'waiting' as const, at: iso(NOW - HOUR), by: 'you' as const },
      b: {
        stage: 'waiting' as const,
        at: iso(NOW - 5 * HOUR),
        by: 'you' as const,
      },
    }
    expect(
      sortForTab([view('a'), view('b')], 'waiting', waiting).map((t) => t.id)
    ).toEqual(['b', 'a'])
    const settled = [
      view('a', { status: 'dismissed', settledAt: iso(NOW - 5 * HOUR) }),
      view('b', { status: 'closed', settledAt: iso(NOW - HOUR) }),
    ]
    expect(sortForTab(settled, 'done', {}).map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('the stages file, beside the tasks an earlier Pacenote reads', () => {
  it('leaves tasks.json and your decisions as they are', () => {
    const data = dir('apart')
    writeTasks(data, { version: 1, tasks: [task('1'), task('2')] })
    decide(data, '1', { status: 'kept' })
    const tasksBefore = readFileSync(path.join(data, 'tasks.json'), 'utf8')
    const decisionsBefore = readDecisions(data)

    setStage(data, '1', 'waiting', new Date(NOW))
    setStage(data, '2', 'started', new Date(NOW))

    expect(readFileSync(path.join(data, 'tasks.json'), 'utf8')).toBe(
      tasksBefore
    )
    expect(readDecisions(data)).toEqual(decisionsBefore)
    expect(readStages(data)).toEqual({
      '1': { stage: 'waiting', at: iso(NOW) },
      '2': { stage: 'started', at: iso(NOW) },
    })
    // As an earlier Pacenote reads them: open, and still kept
    const views = buildView(readTasks(data), readDecisions(data), { now: NOW })
    expect(views.tasks.map((view) => view.status)).toEqual(['open', 'open'])
    expect(readDecisions(data)['1']?.status).toBe('kept')
  })

  it('keeps the latest stage per task, as long as tasks are kept', () => {
    const data = dir('latest')
    setStage(data, 'old', 'waiting', new Date(NOW - HISTORY_MS - HOUR))
    setStage(data, 'x', 'waiting', new Date(NOW - HOUR))
    setStage(data, 'x', 'open', new Date(NOW))
    expect(readStages(data)).toEqual({ x: { stage: 'open', at: iso(NOW) } })
  })

  it('reads a missing or broken file as no stages', () => {
    expect(readStages(dir('none'))).toEqual({})
    expect(STAGES_FILE).toBe('tasks-stages.json')
  })
})

describe('a task you add yourself', () => {
  it('is a task of This Mac, in a project by its repository', () => {
    const data = dir('added')
    const result = addFollowUp(
      data,
      {
        title: 'Write the rollout note',
        why: 'Added by you',
        repo: 'Ashon/payments',
      },
      { addedBy: ADDED_BY_YOU, now: new Date(NOW) }
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.task).toMatchObject({
      id: expect.stringMatching(/^local:/),
      source: { app: 'local', label: 'Ashon/payments' },
      addedBy: 'you',
      kind: 'promised',
      confidence: 'sure',
      repo: 'Ashon/payments',
    })
    const view = viewOf(result.task, {}, NOW)
    expect(view.status).toBe('open')
    expect(
      taskArea(
        [
          {
            id: 'payments',
            name: 'Payments',
            parts: [
              { kind: 'repo', id: 'Ashon/payments', label: 'Ashon/payments' },
            ],
            createdAt: iso(NOW),
          },
        ],
        view
      )?.name
    ).toBe('Payments')
  })
})
