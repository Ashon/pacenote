import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  ClaudeTokenSetup,
  findClaudeToken,
  screenLines,
} from '../apps/desktop/src/claude-token.js'

/**
 * What claude setup-token (Claude Code 2.1.296) printed under script(1) for a
 * real approval, with a stand-in token: its renderer moves the cursor and
 * rewrites only what changed from the previous frame.
 */
const RECORDED = readFileSync(
  new URL('fixtures/claude-setup-token-2.1.296.txt', import.meta.url),
  'utf8'
)
const RECORDED_TOKEN = `sk-ant-oat01-${'Fake-Token_0123456789'.repeat(5).slice(0, 95)}`
const TOKEN = `sk-ant-oat01-${'Ab3_-'.repeat(19)}AA`

describe('claude setup-token for the sandbox', () => {
  it('reads the token from the screen as drawn, not the stream', () => {
    const lines = screenLines(RECORDED)
    expect(lines).toContain(` ${RECORDED_TOKEN}`)
    // Rewritten over "Paste code here if prompted >" with only the changes
    expect(lines).toContain(
      " Store this token securely. You won't be able to see it again."
    )
    expect(findClaudeToken(RECORDED)).toBe(RECORDED_TOKEN)
  })

  it('waits until the lines under the token are drawn, unless the output ended', () => {
    const cut = RECORDED.slice(0, RECORDED.indexOf(RECORDED_TOKEN) + 60)
    expect(findClaudeToken(cut)).toBeUndefined()
    const token = RECORDED.slice(0, RECORDED.indexOf('Stor'))
    expect(findClaudeToken(token)).toBeUndefined()
    expect(findClaudeToken(token, true)).toBe(RECORDED_TOKEN)
    expect(findClaudeToken('Opening browser to sign in…', true)).toBeUndefined()
  })

  it('saves the token it reads and reports success without handing the token back', async () => {
    const save = vi.fn(() => [])
    const setup = new ClaudeTokenSetup({
      toolPath: () => process.env.PATH ?? '',
      save,
      platform: 'darwin',
      // The token arrives in two pieces, the way the output can be read.
      command: [
        '/bin/sh',
        [
          '-c',
          `printf 'Your OAuth token:\\n\\n${TOKEN.slice(0, 50)}'; sleep 0.3; ` +
            `printf '${TOKEN.slice(50)}\\n\\nStore this token securely.\\n'; exec sleep 30`,
        ],
      ],
    })
    expect(await setup.run()).toEqual({ ok: true })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(TOKEN)
    expect(setup.running).toBe(false)
  })

  it('saves the token from the recorded run, the way the app reads it', async () => {
    const save = vi.fn(() => [])
    const setup = new ClaudeTokenSetup({
      toolPath: () => process.env.PATH ?? '',
      save,
      platform: 'darwin',
      command: [
        '/bin/cat',
        [
          new URL('fixtures/claude-setup-token-2.1.296.txt', import.meta.url)
            .pathname,
        ],
      ],
    })
    expect(await setup.run()).toEqual({ ok: true })
    expect(save).toHaveBeenCalledWith(RECORDED_TOKEN)
  })

  it('reports why it ended without a token, and stops when cancelled', async () => {
    const save = vi.fn(() => [])
    const ended = new ClaudeTokenSetup({
      toolPath: () => process.env.PATH ?? '',
      save,
      platform: 'darwin',
      command: [
        '/bin/sh',
        ['-c', "printf 'Claude subscription required.\\n'; exit 1"],
      ],
    })
    expect(await ended.run()).toEqual({
      ok: false,
      error:
        'claude setup-token ended without a token: Claude subscription required.',
    })

    const waiting = new ClaudeTokenSetup({
      toolPath: () => process.env.PATH ?? '',
      save,
      platform: 'darwin',
      command: [
        '/bin/sh',
        ['-c', "printf 'Opening browser to sign in\\n'; exec sleep 30"],
      ],
    })
    const run = waiting.run()
    await vi.waitFor(() => expect(waiting.running).toBe(true))
    waiting.cancel()
    expect(await run).toEqual({ ok: false, error: 'Cancelled.' })
    expect(save).not.toHaveBeenCalled()

    const linux = new ClaudeTokenSetup({
      toolPath: () => '',
      save,
      platform: 'linux',
    })
    expect(await linux.run()).toMatchObject({
      ok: false,
      error: expect.stringContaining('terminal'),
    })
  })
})
