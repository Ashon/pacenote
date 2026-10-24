import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { markQuit, quitWithin } from '../apps/desktop/src/quit-mark.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-quit-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('when the app last quit', () => {
  it('tells a copy opened moments after a quit from one opened later', () => {
    const file = path.join(root, 'desktop-quit.txt')
    const at = Date.parse('2026-10-24T14:33:06.556Z')
    markQuit(file, at)
    expect(quitWithin(file, 5_000, at + 400)).toBe(true)
    expect(quitWithin(file, 5_000, at + 5_000)).toBe(false)
    // A clock set back since is no recent quit.
    expect(quitWithin(file, 5_000, at - 1_000)).toBe(false)
  })

  it('counts no mark, or one it cannot read, as no recent quit', () => {
    expect(quitWithin(path.join(root, 'none.txt'), 5_000)).toBe(false)
    const file = path.join(root, 'garbled.txt')
    writeFileSync(file, 'not a time\n')
    expect(quitWithin(file, 5_000)).toBe(false)
  })

  it('lets go of a mark it cannot write', () => {
    expect(() =>
      markQuit(path.join(root, 'missing', 'desktop-quit.txt'))
    ).not.toThrow()
  })
})
