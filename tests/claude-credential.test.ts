import { describe, expect, it, vi } from 'vitest'
import {
  checkClaudeCredential,
  claudeCredential,
} from '../src/sandbox/claude-credential.js'

/** A fetch that answers with this status and records what it was asked */
function api(status: number | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (status instanceof Error) throw status
    return new Response('{}', { status })
  })
}

describe("the sandbox's claude credential", () => {
  it('asks the model list, which uses no quota, with the token as a bearer', async () => {
    const fetchImpl = api(200)
    expect(
      await checkClaudeCredential(
        { oauthToken: 'sk-ant-oat01-accepted' },
        { fetchImpl, fresh: true }
      )
    ).toBe('accepted')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/)
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-ant-oat01-accepted',
      'anthropic-beta': 'oauth-2025-04-20',
    })
  })

  it('is rejected only on a 401, and unknown otherwise, so it never alarms by mistake', async () => {
    const check = (status: number | Error, oauthToken: string) =>
      checkClaudeCredential(
        { oauthToken },
        { fetchImpl: api(status), fresh: true }
      )
    expect(await check(401, 'sk-ant-oat01-cut-short')).toBe('rejected')
    expect(await check(403, 'sk-ant-oat01-forbidden')).toBe('unknown')
    expect(await check(529, 'sk-ant-oat01-overloaded')).toBe('unknown')
    expect(await check(new Error('offline'), 'sk-ant-oat01-offline')).toBe(
      'unknown'
    )
  })

  it('checks an API key with x-api-key, and nothing without a credential', async () => {
    const fetchImpl = api(401)
    expect(
      await checkClaudeCredential(
        { apiKey: 'sk-ant-api03-revoked' },
        { fetchImpl, fresh: true }
      )
    ).toBe('rejected')
    expect(fetchImpl.mock.calls[0]![1]?.headers).toMatchObject({
      'x-api-key': 'sk-ant-api03-revoked',
    })
    expect(await checkClaudeCredential({}, { fetchImpl })).toBeUndefined()
    expect(
      claudeCredential({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-env' })
    ).toEqual({ oauthToken: 'sk-ant-oat01-env', apiKey: undefined })
  })

  it('reuses an answer for a while, so screens that refresh do not ask again', async () => {
    const first = api(200)
    const credential = { oauthToken: 'sk-ant-oat01-cached' }
    await checkClaudeCredential(credential, { fetchImpl: first, now: 0 })
    const again = api(401)
    expect(
      await checkClaudeCredential(credential, { fetchImpl: again, now: 60_000 })
    ).toBe('accepted')
    expect(again).not.toHaveBeenCalled()
    expect(
      await checkClaudeCredential(credential, {
        fetchImpl: again,
        now: 11 * 60_000,
      })
    ).toBe('rejected')
  })
})
