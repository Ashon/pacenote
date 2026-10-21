import { localized } from '../../i18n/locale.js'
import { slackApiBase } from './api.js'
import { text } from './check.text.js'

/**
 * With OPTIONAL_BOT_SCOPES, must match oauth_config.scopes.bot in
 * slack-app-manifest.yaml. (tests/slack-check.test.ts)
 */
export const REQUIRED_BOT_SCOPES = [
  'app_mentions:read',
  'channels:history',
  'channels:read',
  'chat:write',
  'files:read',
  'files:write',
  'users:read',
] as const

/**
 * Scopes the bot works without, a little worse: without reactions:write only
 * the asker sees that it is working or failed, instead of 👀 and ⚠️ on the
 * mention
 */
export const OPTIONAL_BOT_SCOPES = ['reactions:write'] as const

export function missingScopes(
  required: readonly string[],
  granted: readonly string[]
) {
  return required.filter((scope) => !granted.includes(scope))
}

export interface SlackCheckItem {
  /** What was checked, for code to find it by; label is for people */
  id:
    | 'tokens'
    | 'botToken'
    | 'botScopes'
    | 'sameApp'
    | 'socketMode'
    // The team hub's check (src/hub/client.ts)
    | 'hub'
    | 'pairing'
    | 'bot'
  label: string
  ok: boolean
  detail?: string
  /** botToken: the workspace the bot is in */
  team?: string
  /** botScopes: the required scopes the bot lacks */
  missing?: string[]
}

interface SlackResponse {
  ok: boolean
  error?: string
  [key: string]: unknown
}

async function call(
  fetchImpl: typeof fetch,
  base: string,
  method: string,
  token: string,
  params: Record<string, string> = {}
): Promise<{ body: SlackResponse; headers: Headers }> {
  const res = await fetchImpl(`${base}${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return { body: (await res.json()) as SlackResponse, headers: res.headers }
}

/**
 * Checks with the tokens that the Slack app settings fit this bot. Sends no
 * messages.
 * - Bot token (auth.test), bot scopes, whether the app token and the bot belong
 *   to the same app (bots.info), Socket Mode (apps.connections.open)
 * apps.connections.open only obtains a connection URL and does not connect.
 * (the URL is discarded)
 */
export async function checkSlackTokens(
  tokens: { botToken?: string; appToken?: string; apiUrl?: string },
  fetchImpl: typeof fetch = fetch
): Promise<SlackCheckItem[]> {
  const t = localized(text)
  const items: SlackCheckItem[] = []
  const { botToken, appToken } = tokens
  const base = slackApiBase(tokens.apiUrl)
  if (!botToken || !appToken) {
    return [
      {
        id: 'tokens',
        label: t.tokens,
        ok: false,
        detail: t.bothTokens,
      },
    ]
  }
  const failure = (err: unknown) => (err as Error).message

  let botId: string | undefined
  try {
    const { body, headers } = await call(fetchImpl, base, 'auth.test', botToken)
    if (!body.ok) {
      items.push({
        id: 'botToken',
        label: t.botToken,
        ok: false,
        detail: body.error,
      })
    } else {
      botId = body.bot_id as string | undefined
      items.push({
        id: 'botToken',
        label: t.botToken,
        ok: true,
        detail: `${String(body.user)} (${String(body.user_id)}) @ ${String(body.team)}`,
        team: String(body.team),
      })
      const granted = (headers.get('x-oauth-scopes') ?? '')
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean)
      const missing = missingScopes(REQUIRED_BOT_SCOPES, granted)
      const optional = missingScopes(OPTIONAL_BOT_SCOPES, granted)
      items.push({
        id: 'botScopes',
        label: t.botScopes,
        ok: missing.length === 0,
        ...(missing.length ? { missing } : {}),
        detail: missing.length
          ? t.missingScopes(missing)
          : optional.length
            ? t.missingOptional(optional)
            : undefined,
      })
    }
  } catch (err) {
    items.push({
      id: 'botToken',
      label: t.botToken,
      ok: false,
      detail: failure(err),
    })
  }

  const appIdFromToken = appToken.split('-')[2]
  if (botId) {
    try {
      const { body } = await call(fetchImpl, base, 'bots.info', botToken, {
        bot: botId,
      })
      const appId = (body.bot as { app_id?: string } | undefined)?.app_id
      items.push({
        id: 'sameApp',
        label: t.sameApp,
        ok: body.ok && appId === appIdFromToken,
        detail: t.appIds(appId ?? '?', appIdFromToken ?? '?'),
      })
    } catch (err) {
      items.push({
        id: 'sameApp',
        label: t.sameApp,
        ok: false,
        detail: failure(err),
      })
    }
  }

  try {
    const { body } = await call(
      fetchImpl,
      base,
      'apps.connections.open',
      appToken
    )
    items.push({
      id: 'socketMode',
      label: t.socketMode,
      ok: body.ok,
      detail: body.ok ? t.urlIssued : body.error,
    })
  } catch (err) {
    items.push({
      id: 'socketMode',
      label: t.socketMode,
      ok: false,
      detail: failure(err),
    })
  }
  return items
}
