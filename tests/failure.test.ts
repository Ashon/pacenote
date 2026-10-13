import { describe, expect, it } from 'vitest'
import {
  failureAdvice,
  failureCause,
  failureReply,
} from '../src/mention/failure.js'

describe('why a reasoner run failed', () => {
  it('reads the cause from the errors the CLIs give', () => {
    const cases: [string, string][] = [
      [
        'claude run failed: Failed to authenticate. API Error: 401 OAuth access token is invalid.',
        'auth',
      ],
      ['codex run failed: unexpected status 401 Unauthorized', 'auth'],
      ['claude run failed: Invalid API key · Please run /login', 'auth'],
      ['claude run failed: Claude AI usage limit reached|1760000000', 'limit'],
      ["codex run failed: You've hit your usage limit.", 'limit'],
      ['claude run failed: API Error: 429 rate_limit_error', 'limit'],
      [
        'claude run failed: API Error: 529 {"type":"error","error":{"type":"overloaded_error"}}',
        'unavailable',
      ],
      [
        'Error: No image reasoner in /Users/me/.pacenote/vm/images: build it first.',
        'setup',
      ],
      [
        'Error: The Linux kernel is missing (/Users/me/.pacenote/vm/kernel/vmlinux): prepare first.',
        'setup',
      ],
      [
        'claude executable not found. Check PATH or the *_BIN setting.',
        'setup',
      ],
      ['claude timed out (600s)', 'timeout'],
      ['codex returned an empty response.', 'other'],
    ]
    for (const [error, cause] of cases)
      expect([error, failureCause(error)]).toEqual([error, cause])
  })

  it('tells the asker what it means, never the error', () => {
    expect(failureReply('auth', 'claude')).toBe(
      "I couldn't produce an answer: my sign-in to Claude was rejected. Whoever runs Pace needs to sign in again in Pacenote."
    )
    expect(failureReply('limit', 'codex')).toContain('Codex usage limit')
    expect(failureReply('other', 'claude')).toBe(
      "I couldn't produce an answer. An error occurred while processing the request."
    )
  })

  it('tells the operator what to fix, and where', () => {
    expect(failureAdvice('auth', 'claude', 'vm')).toEqual({
      text: expect.stringContaining('Get a new token in Settings > Sandbox'),
      route: '#/settings/sandbox',
      lasting: true,
    })
    expect(failureAdvice('auth', 'codex', 'vm')?.text).toContain('codex login')
    expect(failureAdvice('auth', 'claude', 'host')?.text).toContain('/login')
    expect(failureAdvice('limit', 'claude', 'vm')?.lasting).toBe(true)
    expect(failureAdvice('unavailable', 'claude', 'vm')?.lasting).toBe(false)
    expect(failureAdvice('other', 'claude', 'vm')).toBeUndefined()
  })
})
