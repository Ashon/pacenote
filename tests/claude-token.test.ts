import { describe, expect, it, vi } from 'vitest'
import {
  ClaudeTokenSetup,
  findClaudeToken,
  plainText,
} from '../apps/desktop/src/claude-token.js'

// Longer than the 120 columns setup-token wraps it at, as real tokens are
const TOKEN = `sk-ant-oat01-${'Ab3_-'.repeat(24)}AA`
/** How setup-token prints the token: wrapped at 120, then how to use it */
const printed = (token: string) =>
  `Your OAuth token (valid for 1 year):\r\n\r\n` +
  `\x1b[33m${token.slice(0, 120)}\r\n${token.slice(120)}\x1b[39m\r\n\r\n` +
  "Store this token securely. You won't be able to see it again.\r\n"

describe('claude setup-token for the sandbox', () => {
  it('finds the token in terminal output with escape codes and spinner frames', () => {
    // The start of a real run under script(1), then the token as a terminal
    // would draw it
    const output =
      '\x1b[?25l\x1b[>4;2mWelcome to Claude Code v2.1.295\r\n' +
      '\x1b]0;claude\x07· Opening browser to sign in…\r\x1b[2K✢\r\n' +
      printed(TOKEN)
    expect(plainText(output)).toContain('Welcome to Claude Code')
    expect(findClaudeToken(output)).toBe(TOKEN)
    expect(findClaudeToken('Opening browser to sign in…')).toBeUndefined()
  })

  it('joins a token wrapped over lines, and waits until all of it is there', () => {
    const output = printed(TOKEN)
    // Only the first wrapped line so far: not the token yet
    const firstLine = output.slice(0, output.indexOf(TOKEN.slice(120)))
    expect(findClaudeToken(firstLine)).toBeUndefined()
    expect(findClaudeToken(output)).toBe(TOKEN)
    // At the end of the output, the rest is the token.
    expect(findClaudeToken(`token:\n${TOKEN}`, true)).toBe(TOKEN)
  })

  it('saves the token it reads and reports success without handing the token back', async () => {
    const save = vi.fn(() => [])
    const setup = new ClaudeTokenSetup({
      toolPath: () => process.env.PATH ?? '',
      save,
      platform: 'darwin',
      // The token arrives in two pieces, the way a wrapped line can.
      command: [
        '/bin/sh',
        [
          '-c',
          `printf 'Your OAuth token:\\n\\n${TOKEN.slice(0, 120)}\\n'; sleep 0.3; ` +
            `printf '${TOKEN.slice(120)}\\n\\nStore this token securely.\\n'; exec sleep 30`,
        ],
      ],
    })
    expect(await setup.run()).toEqual({ ok: true })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(TOKEN)
    expect(setup.running).toBe(false)
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
