import { localized, type Locale } from '../i18n/locale.js'
import { text } from './failure.text.js'

/**
 * Why a reasoner run failed, read from its error, so the asker hears what it
 * means and the operator what to fix, without the error itself (the
 * conversation may be public). Plain data, so the desktop UI uses it too.
 */
export type FailureCause =
  'auth' | 'limit' | 'unavailable' | 'setup' | 'timeout' | 'other'

/** The first matching pattern wins, so the more specific ones come first. */
const CAUSES: [FailureCause, RegExp][] = [
  ['timeout', /\btimed out\b/i],
  [
    'auth',
    /\b401\b|failed to authenticate|authentication_error|invalid (?:x-)?api[ -]key|oauth (?:access )?token (?:is invalid|has expired|has been revoked)|oauth session expired|oauth refresh token is no longer valid|not logged in|please (?:run \/login|log ?in)|run (?:\/login|claude auth login)|\bunauthorized\b|invalid_grant/i,
  ],
  // Claude Code also says "Usage limit reached", "Fable limit reached"
  // (a model's own) and "your weekly usage limit"; codex "usage_limit_reached"
  // and "credits_depleted". A context or size limit is not one.
  [
    'limit',
    /\b429\b|rate[ _]limit|usage[ _]limit|\b(?!context\b|size\b|recursion\b|stack\b|depth\b)\w+ limit reached|quota|credit balance|credits_depleted/i,
  ],
  [
    'setup',
    /no image \S+ in |is missing \(.*\): prepare first|pacenote-vm not found|executable not found/i,
  ],
  [
    'unavailable',
    /\b(?:500|502|503|529)\b|overloaded|service unavailable|econnrefused|connectionrefused|unable to connect|econnreset|enotfound|getaddrinfo|ehostunreach|no route to host|socket hang up/i,
  ],
]

export function failureCause(error: string): FailureCause {
  return CAUSES.find(([, pattern]) => pattern.test(error))?.[0] ?? 'other'
}

/** "Claude", "Codex": the reasoner as the asker knows it */
function service(backend: string): string {
  return backend.charAt(0).toUpperCase() + backend.slice(1)
}

/** "15 minutes", "90 seconds" */
function duration(ms: number, t: (typeof text)[Locale]): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 120) return t.seconds(seconds)
  return t.minutes(Math.round(seconds / 60))
}

export interface FailureReplyOptions {
  /**
   * The asker runs this Pace (the team hub routes each member's mentions to
   * their own Mac), so what to fix is theirs
   */
  own?: boolean
  /** How long a run may take (REASONER_TIMEOUT_SEC), said on a timeout */
  timeoutMs?: number
  /** The language of Pace's own notes in Slack (NOTES_LANGUAGE). English */
  locale?: Locale
}

/**
 * What the asker reads, in a message for them alone: what the failure means
 * and who fixes it, never the error.
 */
export function failureReply(
  cause: FailureCause,
  backend: string,
  { own = false, timeoutMs, locale = 'en' }: FailureReplyOptions = {}
): string {
  const t = localized(text, locale)
  const name = service(backend)
  switch (cause) {
    case 'auth':
      return own ? t.reply.authOwn(name) : t.reply.auth(name)
    case 'limit':
      return t.reply.limit(name)
    case 'unavailable':
      return t.reply.unavailable(name)
    case 'setup':
      return own ? t.reply.setupOwn : t.reply.setup
    case 'timeout':
      return t.reply.timeout(timeoutMs ? duration(timeoutMs, t) : undefined)
    case 'other':
      return own ? t.reply.otherOwn : t.reply.other
  }
}

/** What the operator reads: what happened, what to do, and where */
export interface FailureAdvice {
  text: string
  /** The screen that fixes it (#/settings/sandbox, #/bot) */
  route?: string
  /**
   * It lasts until fixed, so the status bar counts it (the others pass on
   * their own or are one run's)
   */
  lasting: boolean
}

/** In the language of the app (or of the Pace process) when it is called */
export function failureAdvice(
  cause: FailureCause,
  backend: string,
  sandbox: string
): FailureAdvice | undefined {
  const t = localized(text).advice
  switch (cause) {
    case 'auth':
      if (sandbox === 'host')
        return {
          text: t.authHost(backend, backend === 'codex'),
          lasting: true,
        }
      return {
        text: t.authSandbox(backend, backend === 'codex' ? 'Codex' : 'Claude'),
        route: '#/settings/sandbox',
        lasting: true,
      }
    case 'limit':
      return { text: t.limit(backend), lasting: true }
    case 'unavailable':
      return { text: t.unavailable(backend), lasting: false }
    case 'setup':
      return { text: t.setup, route: '#/bot', lasting: false }
    case 'timeout':
      return {
        text: t.timeout,
        route: '#/settings/answers',
        lasting: false,
      }
    case 'other':
      return undefined
  }
}
