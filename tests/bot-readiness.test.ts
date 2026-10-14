import { describe, expect, it } from 'vitest'
import {
  HEALTHY_RUN_MS,
  nextRetry,
  RETRY_MAX_MS,
  setupProblem,
  startFailureProblem,
} from '../apps/desktop/src/bot-readiness.js'

const TOKENS = {
  SLACK_BOT_TOKEN: 'xoxb-1-abc',
  SLACK_APP_TOKEN: 'xapp-1-abc',
  MENTION_ALLOWED_USERS: 'U1',
}

describe('bot readiness', () => {
  it('a first run without Slack tokens needs setup, not a crash', () => {
    const problem = setupProblem({})
    expect(problem).toMatchObject({ kind: 'slack', issues: [] })
    expect(problem?.message).toMatch(/Settings/)
    // A blank value in .env counts as missing too.
    expect(
      setupProblem({ SLACK_BOT_TOKEN: ' ', SLACK_APP_TOKEN: 'xapp-1' })?.kind
    ).toBe('slack')
  })

  it('valid settings are ready to start', () => {
    expect(setupProblem(TOKENS)).toBeUndefined()
  })

  it('your own Slack app needs to know who you are before it starts', () => {
    const problem = setupProblem({ ...TOKENS, MENTION_ALLOWED_USERS: '' })
    expect(problem).toMatchObject({ kind: 'config' })
    expect(problem?.message).toMatch(/^Say who you are/)
    expect(problem?.issues.map((issue) => issue.key)).toEqual([
      'MENTION_ALLOWED_USERS',
    ])
  })

  it('does not start to answer more than you', () => {
    for (const env of [
      { ...TOKENS, MENTION_ALLOWED_USERS: 'U1,U2' },
      { ...TOKENS, MENTION_ANYONE: 'on' },
      { ...TOKENS, MENTION_ALLOWED_USERS: '', MENTION_ANYONE: 'on' },
    ]) {
      const problem = setupProblem(env)
      expect(problem?.kind).toBe('config')
      expect(problem?.issues.map((issue) => issue.key)).toEqual([
        'MENTION_ALLOWED_USERS',
      ])
    }
  })

  it("other invalid values list the bot's own validation issues", () => {
    const problem = setupProblem({ ...TOKENS, OPS_TOOLS: 'on' })
    expect(problem?.kind).toBe('config')
    expect(problem?.issues.map((issue) => issue.key)).toContain('OPS_TOOLS')
  })

  it('tokens Slack rejects need setup; other start failures do not', () => {
    const rejected = startFailureProblem([
      'INFO  [pacenote] Starting (pid 1, desktop)',
      'ERROR [pacenote] Startup failed: An API error occurred: invalid_auth',
    ])
    expect(rejected).toMatchObject({ kind: 'slack' })
    expect(rejected?.message).toMatch(/invalid_auth/)
    expect(
      startFailureProblem(["Error: Cannot find module 'x'"])
    ).toBeUndefined()
    expect(startFailureProblem([])).toBeUndefined()
  })

  it('waits longer with each exit in a row, and starts over after a good run', () => {
    let failures = 0
    const waits: number[] = []
    for (let i = 0; i < 9; i++) {
      const retry = nextRetry(failures, 1_000)
      failures = retry.failures
      waits.push(retry.delayMs / 1_000)
    }
    expect(waits).toEqual([3, 6, 12, 24, 48, 96, 192, 300, 300])
    expect(nextRetry(failures, 60_000).delayMs).toBe(RETRY_MAX_MS)
    expect(nextRetry(failures, HEALTHY_RUN_MS)).toEqual({
      failures: 1,
      delayMs: 3_000,
    })
  })
})
