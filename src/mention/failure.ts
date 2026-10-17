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
  ['limit', /\b429\b|rate[ _]limit|usage limit|quota|credit balance/i],
  [
    'setup',
    /no image \S+ in |is missing \(.*\): prepare first|pacenote-vm not found|executable not found/i,
  ],
  [
    'unavailable',
    /\b(?:500|502|503|529)\b|overloaded|service unavailable|econnrefused|econnreset|enotfound|getaddrinfo|socket hang up/i,
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
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 120) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
  const minutes = Math.round(seconds / 60)
  return `${minutes} minutes`
}

export interface FailureReplyOptions {
  /**
   * The asker runs this Pace (the team hub routes each member's mentions to
   * their own Mac), so what to fix is theirs
   */
  own?: boolean
  /** How long a run may take (REASONER_TIMEOUT_SEC), said on a timeout */
  timeoutMs?: number
}

/**
 * What the asker reads, in a message for them alone: what the failure means
 * and who fixes it, never the error.
 */
export function failureReply(
  cause: FailureCause,
  backend: string,
  { own = false, timeoutMs }: FailureReplyOptions = {}
): string {
  const name = service(backend)
  switch (cause) {
    case 'auth':
      return own
        ? `I couldn't produce an answer: my sign-in to ${name} on your Mac was rejected. Sign in again; Pacenote shows how.`
        : `I couldn't produce an answer: my sign-in to ${name} was rejected. Whoever runs Pace needs to sign in again; Pacenote shows them how.`
    case 'limit':
      return `I couldn't produce an answer: I've reached my ${name} usage limit for now. Please try again later.`
    case 'unavailable':
      return `I couldn't produce an answer: ${name} is unavailable right now. Please try again in a few minutes.`
    case 'setup':
      return own
        ? "I couldn't produce an answer: something in my setup on your Mac isn't working. Pacenote shows what."
        : "I couldn't produce an answer: something in my setup isn't working. Whoever runs Pace can see what in Pacenote."
    case 'timeout':
      return `I couldn't produce an answer: the request took ${timeoutMs ? `longer than ${duration(timeoutMs)}` : 'too long'}. A narrower question may help.`
    case 'other':
      return own
        ? "I couldn't produce an answer: something went wrong on my side. Pacenote on your Mac shows what."
        : "I couldn't produce an answer: something went wrong on my side. Whoever runs Pace can see what in Pacenote."
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

export function failureAdvice(
  cause: FailureCause,
  backend: string,
  sandbox: string
): FailureAdvice | undefined {
  switch (cause) {
    case 'auth':
      if (sandbox === 'host')
        return {
          text: `${backend}'s sign-in on this Mac was rejected. Sign in again in a terminal (${backend === 'codex' ? 'codex login' : 'claude, then /login'}).`,
          lasting: true,
        }
      return backend === 'codex'
        ? {
            text: "codex's sign-in was rejected. Run codex login on this Mac; the sandbox uses that login's auth.json.",
            lasting: true,
          }
        : {
            text: "claude's sign-in in the sandbox was rejected. Get a new token in Settings > Sandbox > Reasoner login, then restart Pace.",
            route: '#/settings/sandbox',
            lasting: true,
          }
    case 'limit':
      return {
        text: `${backend} reached its usage limit. Pace answers again once the limit resets.`,
        lasting: true,
      }
    case 'unavailable':
      return {
        text: `${backend}'s service was unavailable. This usually passes in a few minutes.`,
        lasting: false,
      }
    case 'setup':
      return {
        text: 'Something Pace runs on failed: the built-in sandbox or the CLI. The Pace screen and Settings > Sandbox show what.',
        route: '#/bot',
        lasting: false,
      }
    case 'timeout':
      return {
        text: 'The run took longer than the reasoner timeout (Settings > Answers).',
        route: '#/settings/answers',
        lasting: false,
      }
    case 'other':
      return undefined
  }
}
