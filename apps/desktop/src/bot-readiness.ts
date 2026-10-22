import { checkConfig, type ConfigIssue } from '../../../src/config.js'
import { localized } from '../../../src/i18n/locale.js'
import { text } from './bot-readiness.text.js'

/**
 * Why the bot cannot run yet. The supervisor shows it as "Setup needed" and
 * does not launch the bot, instead of letting it exit on a config error and
 * calling that a crash.
 * - slack: the Slack tokens are missing (a first run) or Slack rejected them
 * - config: other values fail the bot's own validation
 */
export interface SetupProblem {
  kind: 'slack' | 'config'
  message: string
  /** Validation issues to list, for kind "config" */
  issues: ConfigIssue[]
}

/**
 * What each Slack connection needs before the bot can start (src/config.ts
 * SLACK_CONNECTION), and what it says without it
 */
const SLACK_NEEDS = {
  app: {
    keys: ['SLACK_APP_TOKEN', 'SLACK_BOT_TOKEN'],
    says: 'slackNotConnected',
  },
  hub: { keys: ['HUB_URL', 'HUB_TOKEN'], says: 'hubNotPaired' },
} as const

/**
 * Checks the environment the bot would get with the bot's own rules
 * (checkConfig), before launching it.
 */
export function setupProblem(
  env: NodeJS.ProcessEnv,
  check: (env: NodeJS.ProcessEnv) => ConfigIssue[] = checkConfig
): SetupProblem | undefined {
  const issues = check(env)
  if (issues.length === 0) return undefined
  const t = localized(text)
  const needs =
    SLACK_NEEDS[env.SLACK_CONNECTION?.trim() === 'hub' ? 'hub' : 'app']
  if (needs.keys.some((key) => !env[key]?.trim()))
    return { kind: 'slack', message: t[needs.says], issues: [] }
  // Your own Slack app answers no one until you say who (src/config.ts).
  if (
    issues.every(
      (issue) => issue.key === 'MENTION_ALLOWED_USERS' && issue.missing
    )
  )
    return { kind: 'config', message: t.sayWhoYouAre, issues }
  return { kind: 'config', message: t.settingsToFix, issues }
}

/**
 * Slack API errors that mean the token itself is wrong, revoked, or belongs to
 * a disabled account
 */
const SLACK_AUTH_ERROR =
  /\b(invalid_auth|not_authed|account_inactive|token_revoked|token_expired|invalid_token)\b/
/**
 * The team hub no longer accepts this desktop
 * (src/messengers/slack/hub-receiver.ts, src/hub/server.ts)
 */
const HUB_AUTH_ERROR = /\b(hub_unauthorized|hub_revoked)\b/

/**
 * A bot that exits right after starting because Slack rejected its tokens also
 * needs setup, not a restart. Reads the bot's last output for the Slack error
 * code.
 */
export function startFailureProblem(
  output: readonly string[]
): SetupProblem | undefined {
  const t = localized(text)
  for (const line of [...output].reverse()) {
    const hub = HUB_AUTH_ERROR.exec(line)?.[1]
    if (hub) return { kind: 'slack', message: t.hubRejected(hub), issues: [] }
    const code = SLACK_AUTH_ERROR.exec(line)?.[1]
    if (code)
      return { kind: 'slack', message: t.slackRejected(code), issues: [] }
  }
  return undefined
}

/** The first wait before Pace starts again after an exit no one asked for */
const RETRY_FIRST_MS = 3_000
/** The longest wait between tries */
export const RETRY_MAX_MS = 5 * 60_000
/** A run this long went well: the waits start over after it */
export const HEALTHY_RUN_MS = 10 * 60_000

/**
 * When to start Pace again after it exited on its own: the wait doubles with
 * each exit in a row, up to RETRY_MAX_MS, and starts over after a run that
 * went well. failures is the count of exits in a row so far.
 */
export function nextRetry(
  failures: number,
  uptimeMs: number
): { failures: number; delayMs: number } {
  const before = uptimeMs >= HEALTHY_RUN_MS ? 0 : failures
  return {
    failures: before + 1,
    delayMs: Math.min(RETRY_FIRST_MS * 2 ** before, RETRY_MAX_MS),
  }
}
