import { describe, expect, it } from 'vitest'
import { daysSince, todayLines } from '../apps/web/src/lib/today.js'
import type { TaskStage } from '../src/tasks/stage.js'
import type { TaskView } from '../src/tasks/types.js'

const NOW = Date.parse('2026-10-28T09:00:00Z')
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

describe("Todo's Today", () => {
  it('names what waits on you, what to pick up and what waits on others', () => {
    const tasks = [
      task('old', { postedAt: iso(NOW - 48 * HOUR) }),
      task('due', { due: 'Friday' }),
      task('mine', {
        source: {
          app: 'local',
          conversation: 'local',
          label: 'This Mac',
          message: 'm',
        },
        kind: 'promised',
      }),
      task('sdk'),
      task('psp'),
      task('backup'),
      task('done', { status: 'done' }),
    ]
    const stages: Record<string, TaskStage> = {
      sdk: { stage: 'started', at: iso(NOW - 14 * HOUR), by: 'session' },
      psp: { stage: 'waiting', at: iso(NOW - 72 * HOUR), by: 'you' },
      backup: { stage: 'waiting', at: iso(NOW - 20 * HOUR), by: 'you' },
    }
    const working = {
      sdk: { tool: 'claude' as const, at: iso(NOW - 14 * HOUR) },
    }
    expect(todayLines(tasks, stages, working)).toEqual([
      // A due one before an older one; your own tasks are not asks
      { kind: 'you', task: tasks[1], more: 1 },
      {
        kind: 'pickUp',
        task: tasks[3],
        more: 0,
        tool: 'claude',
        at: working.sdk.at,
      },
      // The longest wait first
      { kind: 'others', task: tasks[4], more: 1, since: stages.psp!.at },
    ])
  })

  it('leaves out work an AI tool is at now, and lines with nothing', () => {
    const tasks = [task('sdk', { kind: 'promised' })]
    const stages: Record<string, TaskStage> = {
      sdk: { stage: 'started', at: iso(NOW - HOUR), by: 'you' },
    }
    expect(todayLines(tasks, stages, {}, { sdk: { at: iso(NOW) } })).toEqual([])
    expect(todayLines(tasks, stages)).toEqual([
      { kind: 'pickUp', task: tasks[0], more: 0, at: stages.sdk!.at },
    ])
    expect(todayLines([], {})).toEqual([])
  })

  it('counts waiting by calendar days here', () => {
    const at = new Date(2026, 9, 28, 9, 0).getTime()
    expect(daysSince(new Date(2026, 9, 28, 0, 5).toISOString(), at)).toBe(0)
    expect(daysSince(new Date(2026, 9, 27, 23, 55).toISOString(), at)).toBe(1)
    expect(daysSince(new Date(2026, 9, 25, 12, 0).toISOString(), at)).toBe(3)
  })
})
