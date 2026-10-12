import { describe, expect, it } from 'vitest'
import {
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
    expect(
      setupProblem({
        ...TOKENS,
        MENTION_ALLOWED_USERS: '',
        MENTION_ANYONE: 'on',
      })
    ).toBeUndefined()
  })

  it('your own Slack app needs to know who may ask before it starts', () => {
    const problem = setupProblem({ ...TOKENS, MENTION_ALLOWED_USERS: '' })
    expect(problem).toMatchObject({ kind: 'config' })
    expect(problem?.message).toMatch(/^Choose who may ask Pace/)
    expect(problem?.issues.map((issue) => issue.key)).toEqual([
      'MENTION_ALLOWED_USERS',
    ])
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
})
