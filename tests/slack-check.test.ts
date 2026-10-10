import { readFileSync } from 'node:fs'
import type { WebClient } from '@slack/web-api'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../src/logger.js'
import type { Directory } from '../src/messengers/slack/directory.js'
import { SlackMessenger } from '../src/messengers/slack/messenger.js'
import type { Mention } from '../src/messengers/types.js'
import {
  missingScopes,
  OPTIONAL_BOT_SCOPES,
  REQUIRED_BOT_SCOPES,
} from '../src/tools/check-slack.js'

/** Reads the oauth_config.scopes.bot list from the manifest. */
function manifestBotScopes(): string[] {
  const lines = readFileSync(
    new URL('../slack-app-manifest.yaml', import.meta.url),
    'utf8'
  ).split('\n')
  const start = lines.findIndex((line) => line === '    bot:')
  const scopes: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\s*#/.test(line)) continue
    const match = /^ {6}- (\S+)$/.exec(line)
    if (!match) break
    scopes.push(match[1]!)
  }
  return scopes
}

describe('REQUIRED_BOT_SCOPES', () => {
  it('matches the manifest, with the optional ones', () => {
    expect([...REQUIRED_BOT_SCOPES, ...OPTIONAL_BOT_SCOPES].sort()).toEqual(
      manifestBotScopes().sort()
    )
  })

  it('finds missing scopes', () => {
    expect(missingScopes(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })
})

describe('reactions:write as a limit in the status', () => {
  const mention: Mention = {
    messenger: 'slack',
    conversation: 'C1',
    message: '1.0',
    thread: '1.0',
    inThread: false,
    userId: 'U1',
    text: '<@U0PACE> hi',
    files: [],
  }
  const messenger = (
    add: () => Promise<unknown>,
    options: { scopes?: string[]; onLimits?: () => void } = {}
  ) =>
    new SlackMessenger({
      client: { reactions: { add } } as unknown as WebClient,
      directory: {} as Directory,
      botUserId: 'U0PACE',
      files: { token: 'xoxb-1' },
      allowedUsers: [],
      log: createLogger('error'),
      ...options,
    })
  const slackError = (error: string) =>
    Object.assign(new Error(`An API error occurred: ${error}`), {
      data: { ok: false, error },
    })

  it('reports the missing scope from the scopes Slack gave at startup', () => {
    const without = messenger(async () => ({ ok: true }), {
      scopes: [...REQUIRED_BOT_SCOPES],
    })
    expect(without.limits).toEqual([
      expect.stringContaining('the app does not have reactions:write'),
    ])
    const granted = messenger(async () => ({ ok: true }), {
      scopes: [...REQUIRED_BOT_SCOPES, ...OPTIONAL_BOT_SCOPES],
    })
    expect(granted.limits).toEqual([])
    // Through the team hub, Slack's scopes do not come along.
    expect(messenger(async () => ({ ok: true })).limits).toEqual([])
  })

  it('reports it when a reaction fails, and clears it once one works', async () => {
    let scoped = false
    let changes = 0
    const slack = messenger(
      async () => {
        if (!scoped) throw slackError('missing_scope')
        return { ok: true }
      },
      { onLimits: () => (changes += 1) }
    )
    expect(await slack.mark(mention, 'working')).toBe(false)
    expect(slack.limits).toEqual([
      expect.stringContaining('Adding the scope (slack-app-manifest.yaml)'),
    ])
    expect(await slack.mark(mention, 'working')).toBe(false)
    expect(changes).toBe(1)

    // The app was reinstalled with the scope while Pace kept running.
    scoped = true
    expect(await slack.mark(mention, 'working')).toBe(true)
    expect(slack.limits).toEqual([])
    expect(changes).toBe(2)
  })

  it('says when the team hub does not relay reactions', async () => {
    const slack = messenger(async () => {
      throw slackError('method_not_allowed_by_hub')
    })
    expect(await slack.mark(mention, 'working')).toBe(false)
    expect(slack.limits).toEqual([expect.stringContaining('Updating the hub')])
  })
})
