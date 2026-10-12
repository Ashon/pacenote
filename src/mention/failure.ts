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
    /\b401\b|failed to authenticate|authentication_error|invalid (?:x-)?api[ -]key|oauth (?:access )?token (?:is invalid|has expired)|not logged in|please (?:run \/login|log ?in)|\bunauthorized\b|invalid_grant/i,
  ],
  ['limit', /\b429\b|rate[ _]limit|usage limit|quota|credit balance/i],
  [
    'setup',
    /docker daemon|no such image|unable to find image|network \S+ not found|executable not found/i,
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

/** What the asker reads in the conversation */
export function failureReply(cause: FailureCause, backend: string): string {
  const name = service(backend)
  switch (cause) {
    case 'auth':
      return `I couldn't produce an answer: my sign-in to ${name} was rejected. Whoever runs Pace needs to sign in again in Pacenote.`
    case 'limit':
      return `I couldn't produce an answer: I've reached my ${name} usage limit for now. Please try again later.`
    case 'unavailable':
      return `I couldn't produce an answer: ${name} is unavailable right now. Please try again in a few minutes.`
    case 'setup':
      return "I couldn't produce an answer: something in my setup isn't working. Whoever runs Pace can see what in Pacenote."
    case 'timeout':
      return "I couldn't produce an answer: the request took too long. A narrower question may help."
    case 'other':
      return "I couldn't produce an answer. An error occurred while processing the request."
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
        text: 'Something Pace runs on failed: Docker, the sandbox images or the CLI. The Pace screen and Settings > Sandbox show what.',
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
