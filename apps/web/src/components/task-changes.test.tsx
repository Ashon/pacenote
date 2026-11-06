import { FILLED_IN, TOOK_BACK } from '@src/tasks/filled'
import type { TaskUpdate, TaskView } from '@src/tasks/types'
import { describe, expect, it } from 'vitest'
import { changeWords, isNews, lastChange } from './task-changes'

const task = (updates: TaskUpdate[]): TaskView => ({
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
  updates,
})

const update = (
  at: string,
  why: string,
  changed: TaskUpdate['changed']
): TaskUpdate => ({ at, why, changed })

describe('what changed in a task', () => {
  it('counts a field it had that changed, or a due date, title or certainty', () => {
    expect(isNews({ field: 'repo', from: 'a/b', to: 'a/c' })).toBe(true)
    expect(isNews({ field: 'due', to: 'Friday' })).toBe(true)
    expect(isNews({ field: 'title', to: 'New' })).toBe(true)
    expect(isNews({ field: 'confidence', to: 'sure' })).toBe(true)
    // Filling in what an older task lacked is not news
    expect(isNews({ field: 'repo', to: 'a/b' })).toBe(false)
    expect(isNews({ field: 'summary', to: 'Now with a summary' })).toBe(false)
  })

  it('finds the latest change its thread made, not your AI filling it in', () => {
    const moved = update('2026-11-02T09:00:00Z', 'mina moved it', [
      { field: 'due', from: 'Thursday', to: 'Wednesday' },
    ])
    const filled = update('2026-11-03T09:00:00Z', FILLED_IN, [
      { field: 'due', to: 'Friday' },
    ])
    const undone = update('2026-11-03T10:00:00Z', TOOK_BACK, [
      { field: 'due', from: 'Friday' },
    ])
    const quiet = update('2026-11-04T09:00:00Z', 'a summary came', [
      { field: 'summary', to: 'Sums it up' },
    ])
    expect(lastChange(task([moved, filled, undone, quiet]))).toBe(moved)
    expect(lastChange(task([quiet]))).toBeUndefined()
    expect(lastChange({ ...task([]), updates: undefined })).toBeUndefined()
  })

  it('says each change in words', () => {
    expect(
      changeWords({ field: 'due', from: 'Thursday', to: 'Wednesday' })
    ).toBe('Due Thursday → Wednesday')
    expect(changeWords({ field: 'due', to: 'Friday' })).toBe('Due Friday')
    expect(changeWords({ field: 'due', from: 'Friday' })).toBe(
      'No longer due Friday'
    )
    expect(changeWords({ field: 'title', from: 'Old', to: 'New' })).toBe(
      'Was “Old”'
    )
    expect(changeWords({ field: 'confidence', to: 'sure' })).toBe(
      'Now a task, no longer a Maybe'
    )
    expect(changeWords({ field: 'confidence', to: 'maybe' })).toBe(
      'Now a Maybe'
    )
    expect(changeWords({ field: 'repo', to: 'acme/pay' })).toBe(
      'Repository acme/pay'
    )
    expect(changeWords({ field: 'repo', from: 'acme/pay' })).toBe(
      'No repository'
    )
    expect(changeWords({ field: 'action', to: 'code' })).toBe('Now a code task')
    expect(changeWords({ field: 'action', to: 'dance' })).toBe('Now dance')
    expect(changeWords({ field: 'summary', to: 'x' })).toBe('Summary updated')
    expect(changeWords({ field: 'follows', to: 't0' })).toBe(
      'Carries on another task'
    )
    expect(changeWords({ field: 'askedBy', to: 'mina' })).toBe('Asked by mina')
    expect(changeWords({ field: 'kind', to: 'asked' })).toBe('Now asked of you')
  })
})
