import { z } from 'zod'
import { LOCALES, type Locale } from '../i18n/locale.js'
import { isSecureOrLocalUrl, slackApiBase } from '../messengers/slack/api.js'
import type { LogLevel } from '../logger.js'

const userIds = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((id) => id.trim().toUpperCase())
      .filter(Boolean)
  )
  .pipe(
    z.array(
      z
        .string()
        .regex(/^[UW][A-Z0-9]+$/, 'Must be Slack user IDs (U... or W...)')
    )
  )

/**
 * The hub's environment. The Slack tokens live only here, on the hub's server.
 */
const HubEnvSchema = z.object({
  SLACK_BOT_TOKEN: z
    .string()
    .startsWith('xoxb-', 'Must be a bot token starting with xoxb-'),
  SLACK_APP_TOKEN: z
    .string()
    .startsWith('xapp-', 'Must be an app token starting with xapp-'),
  /**
   * Slack's Web API base. Defaults to slack.com; GovSlack, or a local stand-in
   * for tests
   */
  SLACK_API_URL: z
    .string()
    .url()
    .refine(
      isSecureOrLocalUrl,
      'Must be an https URL (http only for localhost)'
    )
    .optional(),
  /** 0 picks a free port (the log says which) */
  HUB_PORT: z.coerce.number().int().min(0).max(65_535).default(8790),
  HUB_HOST: z.string().default('0.0.0.0'),
  /** Paired desktops (desktops.json). A volume in the container */
  HUB_DATA_DIR: z.string().default('/data'),
  /**
   * The URL desktops use for the hub (https://...). Else upload URLs are built
   * from the request's X-Forwarded-* headers.
   */
  HUB_PUBLIC_URL: z.string().url().optional(),
  /** Members who may pair and use the hub. Empty: everyone in the workspace */
  HUB_ALLOWED_USERS: userIds,
  /** The language of the notes the hub posts in Slack: en, ko */
  HUB_NOTES_LANGUAGE: z.enum(LOCALES).default('en'),
  /**
   * The desktop of whoever ran the installer (deploy/hub/install.sh): their
   * Slack member ID and the SHA-256 of the token their Pacenote made,
   * "U123:<hex>". Paired once, when the hub first starts with it.
   */
  HUB_PAIR: z
    .string()
    .regex(
      /^[UW][A-Z0-9]+:[0-9a-f]{64}$/,
      'Must be a Slack user ID and a token hash, U...:<64 hex>'
    )
    .optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

interface HubConfig {
  botToken: string
  appToken: string
  /** Web API base, with a trailing slash */
  apiUrl: string
  port: number
  host: string
  dataDir: string
  publicUrl?: string
  allowedUsers: string[]
  /** The language of the notes the hub posts in Slack */
  notesLocale: Locale
  /** The installer's desktop, to pair once (HUB_PAIR) */
  pair?: { user: string; tokenHash: string }
  logLevel: LogLevel
}

export function loadHubConfig(env: NodeJS.ProcessEnv): HubConfig {
  const provided = Object.fromEntries(
    Object.entries(env).filter(
      ([, value]) => value !== undefined && value.trim() !== ''
    )
  )
  const parsed = HubEnvSchema.safeParse(provided)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Some environment variables are invalid.\n${issues}`)
  }
  const e = parsed.data
  return {
    botToken: e.SLACK_BOT_TOKEN,
    apiUrl: slackApiBase(e.SLACK_API_URL),
    appToken: e.SLACK_APP_TOKEN,
    port: e.HUB_PORT,
    host: e.HUB_HOST,
    dataDir: e.HUB_DATA_DIR,
    publicUrl: e.HUB_PUBLIC_URL,
    allowedUsers: e.HUB_ALLOWED_USERS,
    notesLocale: e.HUB_NOTES_LANGUAGE,
    pair: e.HUB_PAIR
      ? {
          user: e.HUB_PAIR.split(':')[0]!,
          tokenHash: e.HUB_PAIR.split(':')[1]!,
        }
      : undefined,
    logLevel: e.LOG_LEVEL,
  }
}
