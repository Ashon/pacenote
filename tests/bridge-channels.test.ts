import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEVICE_ASKS } from '../src/macs/asks.js'

/**
 * The desktop bridge's channels, as preload.ts calls and listens on them and
 * the main process (apps/desktop/src) answers and sends them: one misspelled
 * on either side is a call that never answers, which no type sees.
 */
const desktop = path.resolve('apps/desktop/src')

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return sources(file)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [file]
      : []
  })

const channels = (text: string, calls: string): Set<string> =>
  new Set(
    [
      ...text.matchAll(
        new RegExp(`(?:${calls})(?:<[^>]*>)?\\(\\s*'(pacenote:[^']+)'`, 'g')
      ),
    ].map((match) => match[1]!)
  )

const preload = readFileSync(path.join(desktop, 'preload.ts'), 'utf8')
const main = sources(desktop)
  .filter((file) => path.basename(file) !== 'preload.ts')
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

const called = channels(preload, 'invoke|sendSync')
const heard = channels(preload, 'subscribe')
const answered = channels(
  main,
  String.raw`\bhandle|handleDenying|handleOrError|windowOnly|ipcMain\.handle|ipcMain\.on`
)
const sent = channels(main, 'send')

describe('the desktop bridge channels', () => {
  it('finds them', () => {
    expect(called.size).toBeGreaterThan(100)
    expect(heard.size).toBeGreaterThan(10)
  })

  it('answers every call the screens make', () => {
    expect([...called].filter((channel) => !answered.has(channel))).toEqual([])
  })

  it('answers every ask a device may make', () => {
    expect(
      Object.values(DEVICE_ASKS).filter((channel) => !answered.has(channel))
    ).toEqual([])
  })

  it('answers nothing that nobody asks for', () => {
    const asked = new Set<string>([...called, ...Object.values(DEVICE_ASKS)])
    expect([...answered].filter((channel) => !asked.has(channel))).toEqual([])
  })

  it('sends what the screens listen for, and only that', () => {
    expect([...heard].filter((channel) => !sent.has(channel))).toEqual([])
    expect([...sent].filter((channel) => !heard.has(channel))).toEqual([])
  })
})
