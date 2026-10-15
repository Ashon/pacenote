import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  ACTIVITY_FILE,
  liveTasks,
  LIVE_MS,
  readActivity,
  recordActivity,
} from '../src/tasks/activity.js'
import type { TaskActivity } from '../src/tasks/types.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-activity-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const NOW = Date.parse('2026-10-15T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const event = (
  ms: number,
  kind: TaskActivity['kind'],
  more: Partial<TaskActivity> = {}
): TaskActivity => ({ at: ago(ms), kind, by: 'claude-code', ...more })

describe('the activity AI tools leave', () => {
  it('adds a line a call, reads back the last minutes, and skips a broken line', () => {
    const data = path.join(root, 'read')
    recordActivity(data, event(20 * 60_000, 'collect'))
    recordActivity(data, event(60_000, 'look', { task: 'C1:1.0' }))
    writeFileSync(
      path.join(data, ACTIVITY_FILE),
      `${readFileSync(path.join(data, ACTIVITY_FILE), 'utf8')}{"at":`
    )
    expect(readActivity(data, NOW)).toEqual([
      event(60_000, 'look', { task: 'C1:1.0' }),
    ])
    expect(readActivity(path.join(root, 'none'), NOW)).toEqual([])
  })

  it('cuts the file back to its last lines once it grows', () => {
    const data = path.join(root, 'trim')
    for (let i = 0; i < 1000; i += 1)
      recordActivity(data, event(1_000, 'look', { task: `C1:${i}.0` }))
    const lines = readFileSync(path.join(data, ACTIVITY_FILE), 'utf8')
      .trimEnd()
      .split('\n')
    expect(lines.length).toBeLessThan(1000)
    expect(JSON.parse(lines.at(-1)!).task).toBe('C1:999.0')
  })
})

describe('what AI tools are doing now', () => {
  it('follows a collection from its start until it adds its tasks', () => {
    const started = [
      event(50_000, 'collect'),
      event(40_000, 'add', { added: 2, finished: false }),
      event(30_000, 'close', { task: 'C1:1.0' }),
    ]
    expect(liveTasks(started, NOW).collecting).toEqual({
      by: 'claude-code',
      since: ago(50_000),
      added: 2,
    })
    const done = [...started, event(20_000, 'add', { added: 1 })]
    expect(liveTasks(done, NOW).collecting).toBeUndefined()
    expect(liveTasks(done, NOW).latest).toEqual(
      event(20_000, 'add', { added: 1 })
    )
    // One that stopped answering is not still going.
    expect(
      liveTasks([event(LIVE_MS + 1_000, 'collect')], NOW).collecting
    ).toBeUndefined()
  })

  it('marks the tasks a tool looks at or changes, until it closes them or goes quiet', () => {
    const live = liveTasks(
      [
        event(LIVE_MS + 5_000, 'look', { task: 'old' }),
        event(90_000, 'look', { task: 'a' }),
        event(60_000, 'update', { task: 'b', fields: ['due'] }),
        event(50_000, 'look', { task: 'c' }),
        event(10_000, 'close', { task: 'c' }),
      ],
      NOW
    )
    expect(live.working).toEqual({
      a: { by: 'claude-code', at: ago(90_000) },
      b: { by: 'claude-code', at: ago(60_000) },
    })
    expect(live.latest?.kind).toBe('close')
  })

  it("leaves out the app's own collections and drafts, which show their own progress", () => {
    const live = liveTasks(
      [
        event(30_000, 'collect', { app: true }),
        event(20_000, 'update', { task: 'a', app: true }),
      ],
      NOW
    )
    expect(live).toEqual({
      collecting: undefined,
      working: {},
      latest: undefined,
    })
  })
})
