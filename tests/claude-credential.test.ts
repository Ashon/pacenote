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
  it('asks the model list, which uses no quota, with the API key', async () => {
    const fetchImpl = api(200)
    expect(
      await checkClaudeCredential(
        { apiKey: 'sk-ant-api03-accepted' },
        { fetchImpl, fresh: true }
      )
    ).toBe('accepted')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/)
    expect(init?.headers).toEqual({
      'anthropic-version': '2023-06-01',
      'x-api-key': 'sk-ant-api03-accepted',
    })
  })

  it('never calls the API with a claude.ai token, which is for Claude Code itself', async () => {
    const fetchImpl = api(200)
    expect(
      await checkClaudeCredential(
        { oauthToken: 'sk-ant-oat01-subscription' },
        { fetchImpl, fresh: true }
      )
    ).toBeUndefined()
    expect(await checkClaudeCredential({}, { fetchImpl })).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
    // With an API key beside it, the key is what is checked
    await checkClaudeCredential(
      { oauthToken: 'sk-ant-oat01-subscription', apiKey: 'sk-ant-api03-both' },
      { fetchImpl, fresh: true }
    )
    expect(JSON.stringify(fetchImpl.mock.calls[0]![1]?.headers)).not.toMatch(
      /oat01|Bearer/
    )
    expect(
      claudeCredential({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-env' })
    ).toEqual({ oauthToken: 'sk-ant-oat01-env', apiKey: undefined })
  })

  it('is rejected only on a 401, and unknown otherwise, so it never alarms by mistake', async () => {
    const check = (status: number | Error, apiKey: string) =>
      checkClaudeCredential({ apiKey }, { fetchImpl: api(status), fresh: true })
    expect(await check(401, 'sk-ant-api03-revoked')).toBe('rejected')
    expect(await check(403, 'sk-ant-api03-forbidden')).toBe('unknown')
    expect(await check(529, 'sk-ant-api03-overloaded')).toBe('unknown')
    expect(await check(new Error('offline'), 'sk-ant-api03-offline')).toBe(
      'unknown'
    )
  })

  it('reuses an answer for a while, so screens that refresh do not ask again', async () => {
    const first = api(200)
    const credential = { apiKey: 'sk-ant-api03-cached' }
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
