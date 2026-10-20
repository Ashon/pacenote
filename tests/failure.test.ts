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
      [
        'Failed to authenticate: OAuth session expired and could not be refreshed',
        'auth',
      ],
      ['OAuth token has been revoked. Please run /login.', 'auth'],
      ['Not logged in. Run claude auth login to authenticate.', 'auth'],
      ['claude run failed: Claude AI usage limit reached|1760000000', 'limit'],
      ["codex run failed: You've hit your usage limit.", 'limit'],
      ['claude run failed: API Error: 429 rate_limit_error', 'limit'],
      ['Usage limit reached', 'limit'],
      ['Fable limit reached', 'limit'],
      ['You have reached your weekly usage limit', 'limit'],
      ['{"type":"usage_limit_reached"}', 'limit'],
      ['workspace_member_credits_depleted', 'limit'],
      ['Context limit reached', 'other'],
      // opencode, its model's server out of reach
      [
        'ConnectionRefused: Unable to connect. Is the computer able to access the url?',
        'unavailable',
      ],
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

  it('tells the conversation what it means and who fixes it, never the error', () => {
    expect(failureReply('auth', 'claude')).toBe(
      "I couldn't produce an answer: my sign-in to Claude was rejected. Whoever runs Pace needs to sign in again; Pacenote shows them how."
    )
    expect(failureReply('limit', 'codex')).toContain('Codex usage limit')
    expect(failureReply('other', 'claude')).toBe(
      "I couldn't produce an answer: something went wrong on my side. Whoever runs Pace can see what in Pacenote."
    )
    expect(failureReply('timeout', 'claude', { timeoutMs: 900_000 })).toBe(
      "I couldn't produce an answer: the request took longer than 15 minutes. A narrower question may help."
    )
    expect(failureReply('timeout', 'claude', { timeoutMs: 90_000 })).toContain(
      'longer than 90 seconds'
    )
  })

  it('tells an asker who runs Pace on their own Mac (the team hub) to fix it', () => {
    expect(failureReply('auth', 'claude', { own: true })).toBe(
      "I couldn't produce an answer: my sign-in to Claude on your Mac was rejected. Sign in again; Pacenote shows how."
    )
    expect(failureReply('setup', 'codex', { own: true })).toContain(
      'on your Mac'
    )
    expect(failureReply('other', 'codex', { own: true })).toContain(
      'Pacenote on your Mac shows what'
    )
    for (const reply of [
      failureReply('auth', 'claude', { own: true }),
      failureReply('setup', 'claude', { own: true }),
      failureReply('other', 'claude', { own: true }),
    ])
      expect(reply).not.toContain('Whoever runs Pace')
  })

  it('tells the operator what to fix, and where', () => {
    expect(failureAdvice('auth', 'claude', 'vm')).toEqual({
      text: expect.stringContaining('Sign in to Claude in Settings > Sandbox'),
      route: '#/settings/sandbox',
      lasting: true,
    })
    expect(failureAdvice('auth', 'codex', 'vm')).toMatchObject({
      text: expect.stringContaining('Sign in to Codex in Settings > Sandbox'),
      route: '#/settings/sandbox',
    })
    expect(failureAdvice('auth', 'claude', 'host')?.text).toContain('/login')
    expect(failureAdvice('limit', 'claude', 'vm')?.lasting).toBe(true)
    expect(failureAdvice('unavailable', 'claude', 'vm')?.lasting).toBe(false)
    expect(failureAdvice('other', 'claude', 'vm')).toBeUndefined()
  })
})
