import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { diagnosticsText, tailFile } from '../apps/desktop/src/diagnostics.js'

const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-diagnostics-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('diagnostics', () => {
  it('says secret settings are set, and takes secret values out everywhere', () => {
    const hub = 'a1b2c3d4e5f6a7b8c9d0'
    const text = diagnosticsText(
      {
        app: {
          version: '0.4.6',
          packaged: true,
          electron: '39.8.10',
          node: '22.22.1',
          os: 'macOS 15.1.0',
          arch: 'arm64',
        },
        supervisor: {
          phase: 'crashed',
          message: 'Pace exited (code 1).',
          output: [`connecting with ${hub}`],
          autoStart: true,
          restarts: 1,
          canBuild: false,
        },
        bot: { alive: false },
        settings: {
          SLACK_BOT_TOKEN: 'xoxb-12345678901-abcdef',
          HUB_TOKEN: hub,
          TASKS: 'on',
        },
        secrets: [hub],
        logs: [
          {
            name: "Pace's log",
            lines: [
              `ERROR [hub] rejected ${hub}`,
              'leaked xoxb-12345678901-zz',
            ],
          },
        ],
      },
      new Date('2026-10-12T12:00:00Z')
    )
    expect(text).toContain('Pacenote 0.4.6')
    expect(text).toContain('SLACK_BOT_TOKEN=(set)')
    expect(text).toContain('HUB_TOKEN=(set)')
    expect(text).toContain('TASKS=on')
    expect(text).toContain('"phase": "crashed"')
    expect(text).not.toContain(hub)
    expect(text).not.toContain('xoxb-')
  })

  it('reads the last lines of a log, also past what it reads of a big one', () => {
    const file = path.join(dir, 'bot.log')
    writeFileSync(
      file,
      Array.from({ length: 5_000 }, (_, i) => `line ${i}`).join('\n') + '\n'
    )
    expect(tailFile(file, 3)).toEqual(['line 4997', 'line 4998', 'line 4999'])
    expect(tailFile(file, 10_000, 100).length).toBeLessThan(20)
    expect(tailFile(path.join(dir, 'missing.log'), 3)).toEqual([])
  })
})
