import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { watchTasks } from '../apps/desktop/src/tasks-watch.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-watch-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const settle = (ms: number) => new Promise((done) => setTimeout(done, ms))

describe('watching the task files', () => {
  // How many events a burst of writes becomes is the file system's to say, so
  // only whether it tells is checked.
  it('tells when a task file changes, not for other files, and not once stopped', async () => {
    let told = 0
    const stop = watchTasks(root, () => (told += 1), 50)
    await settle(100)
    writeFileSync(path.join(root, 'notes.txt'), 'not a task file')
    await settle(300)
    expect(told).toBe(0)
    writeFileSync(path.join(root, 'tasks.json'), '{}')
    writeFileSync(path.join(root, 'tasks-activity.jsonl'), '{}\n')
    await settle(400)
    expect(told).toBeGreaterThan(0)
    stop()
    const before = told
    writeFileSync(path.join(root, 'tasks.json'), '{"tasks":[]}')
    await settle(300)
    expect(told).toBe(before)
  })

  it('does nothing for a folder that is not there', () => {
    const stop = watchTasks(path.join(root, 'missing'), () => {
      throw new Error('told')
    })
    stop()
  })
})
