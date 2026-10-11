import { createHash } from 'node:crypto'

/**
 * Whether the sandbox's claude credential (SANDBOX_CLAUDE_OAUTH_TOKEN or
 * SANDBOX_ANTHROPIC_API_KEY) still works, asked with a call that uses no quota:
 * the model list. A token cut short or revoked shows up here, before a mention
 * fails on it.
 * - accepted: the API answered 200
 * - rejected: the API answered 401
 * - unknown: anything else (no network, a proxy, another status), so a check
 *   never raises a false alarm
 */
export type CredentialState = 'accepted' | 'rejected' | 'unknown'

export interface ClaudeCredential {
  oauthToken?: string
  apiKey?: string
}

const MODELS_URL = 'https://api.anthropic.com/v1/models?limit=1'
/** How long an answer is reused, so screens that refresh do not ask again */
const CACHE_MS = 10 * 60_000
const cache = new Map<string, { state: CredentialState; at: number }>()

/** The credential from the reasoner's sandbox environment (config.ts) */
export function claudeCredential(
  env: Record<string, string | undefined>
): ClaudeCredential {
  return {
    oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN || undefined,
    apiKey: env.ANTHROPIC_API_KEY || undefined,
  }
}

/** Undefined when there is no credential to check */
export async function checkClaudeCredential(
  credential: ClaudeCredential,
  options: { fresh?: boolean; fetchImpl?: typeof fetch; now?: number } = {}
): Promise<CredentialState | undefined> {
  const { oauthToken, apiKey } = credential
  if (!oauthToken && !apiKey) return undefined
  const now = options.now ?? Date.now()
  const key = createHash('sha256')
    .update(oauthToken ?? `key:${apiKey}`)
    .digest('hex')
  const cached = cache.get(key)
  if (!options.fresh && cached && now - cached.at < CACHE_MS)
    return cached.state

  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    ...(oauthToken
      ? {
          Authorization: `Bearer ${oauthToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
        }
      : { 'x-api-key': apiKey! }),
  }
  let state: CredentialState
  try {
    const res = await (options.fetchImpl ?? fetch)(MODELS_URL, {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
    state =
      res.status === 200
        ? 'accepted'
        : res.status === 401
          ? 'rejected'
          : 'unknown'
  } catch {
    state = 'unknown'
  }
  cache.set(key, { state, at: now })
  return state
}
