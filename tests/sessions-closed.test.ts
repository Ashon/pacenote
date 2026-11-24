import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  CLOSED_FILE,
  closedStill,
  closeSession,
  readClosed,
} from '../src/sessions/closed.js'

const dataDir = mkdtempSync(path.join(tmpdir(), 'pacenote-closed-'))
afterAll(() => rmSync(dataDir, { recursive: true, force: true }))

describe('the sessions you closed', () => {
  it('keeps each by its id, the ones closed days ago let go', () => {
    expect(readClosed(dataDir).size).toBe(0)
    closeSession(dataDir, 'codex:old', new Date('2026-11-20T09:00:00Z'))
    closeSession(dataDir, 'claude:s1', new Date('2026-11-24T08:00:00Z'))
    closeSession(dataDir, 'codex:t1', new Date('2026-11-24T09:00:00Z'))
    expect([...readClosed(dataDir)]).toEqual([
      ['claude:s1', '2026-11-24T08:00:00.000Z'],
      ['codex:t1', '2026-11-24T09:00:00.000Z'],
    ])
    // Closed again: when, the last time
    closeSession(dataDir, 'claude:s1', new Date('2026-11-24T10:00:00Z'))
    expect(readClosed(dataDir).get('claude:s1')).toBe(
      '2026-11-24T10:00:00.000Z'
    )
  })

  it('reads a file another hand broke as none', () => {
    writeFileSync(
      path.join(dataDir, CLOSED_FILE),
      JSON.stringify({ closed: { 'codex:t2': 'soon', 'codex:t3': 42 } })
    )
    expect(readClosed(dataDir).size).toBe(0)
  })

  it('is closed still until its log is written after it closed', () => {
    const at = '2026-11-24T09:00:00.000Z'
    expect(closedStill(undefined, at)).toBe(false)
    expect(closedStill(at, '2026-11-24T08:59:00.000Z')).toBe(true)
    // Its last lines, written as its run quit
    expect(closedStill(at, '2026-11-24T09:00:10.000Z')).toBe(true)
    expect(closedStill(at, '2026-11-24T09:01:00.000Z')).toBe(false)
  })
})
