import { describe, expect, it } from 'vitest'
import { setLocale } from '../src/i18n/locale.js'
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

  it("tells the asker in Pace's notes language", () => {
    expect(failureReply('limit', 'codex', { locale: 'ko' })).toBe(
      '답변을 만들지 못했어요. 지금은 Codex 사용 한도에 도달했어요. 나중에 다시 시도해 주세요.'
    )
    expect(failureReply('unavailable', 'claude', { locale: 'ko' })).toContain(
      '지금은 Claude를 쓸 수 없어요.'
    )
    expect(
      failureReply('timeout', 'claude', { timeoutMs: 900_000, locale: 'ko' })
    ).toContain('요청이 15분 넘게 걸렸어요.')
    expect(
      failureReply('timeout', 'claude', { timeoutMs: 90_000, locale: 'ko' })
    ).toContain('요청이 90초 넘게 걸렸어요.')
    expect(failureReply('auth', 'claude', { own: true, locale: 'ko' })).toBe(
      '답변을 만들지 못했어요. 사용하시는 Mac에서 제 Claude 로그인이 거부됐어요. 다시 로그인해 주세요. 방법은 Pacenote에 나와 있어요.'
    )
  })

  it("tells the operator in the app's language at the time", () => {
    setLocale('ko')
    try {
      expect(failureAdvice('auth', 'codex', 'vm')?.text).toContain(
        '설정 > 샌드박스 > 답변 CLI 로그인에서 Codex에 로그인한 다음'
      )
      expect(failureAdvice('timeout', 'claude', 'vm')).toMatchObject({
        text: expect.stringContaining('설정 > 답변'),
        route: '#/settings/answers',
      })
    } finally {
      setLocale('en')
    }
    expect(failureAdvice('auth', 'codex', 'vm')?.text).toContain(
      'Sign in to Codex in Settings > Sandbox'
    )
  })
})
