/**
 * Redacts common secret formats mixed into tool output. Answers go to public
 * channels, so this is the last line of defense. Access restrictions (file deny
 * rules, RBAC) are the primary defense; this reduces what slips past them.
 */
const PATTERNS: [RegExp, string][] = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    '[REDACTED PRIVATE KEY]',
  ],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '[REDACTED SLACK TOKEN]'],
  [/\bxapp-\d-[A-Za-z0-9-]{10,}/g, '[REDACTED SLACK APP TOKEN]'],
  [/\bsk-ant-[A-Za-z0-9_-]{10,}/g, '[REDACTED ANTHROPIC KEY]'],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, '[REDACTED API KEY]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED GITHUB TOKEN]'],
  // fine-grained PAT (github_pat_<22 chars>_<59 chars>)
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED GITHUB TOKEN]'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, '[REDACTED GITLAB TOKEN]'],
  [/\bATATT[A-Za-z0-9_=-]{20,}/g, '[REDACTED ATLASSIAN TOKEN]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED AWS KEY]'],
  [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    '[REDACTED JWT]',
  ],
]

/**
 * A value after a secret-sounding key (token: ..., password=...). Right for
 * tool output and logs, but in an answer it would also hit ordinary code
 * (password: process.env.DB_PASSWORD), so answers leave it out.
 */
const KEYED: [RegExp, string] = [
  /((?:client-key-data|client-certificate-data|token|password|passwd|secret)\s*[:=]\s*)["']?[^\s"']{8,}["']?/gi,
  '$1[REDACTED]',
]

export function redactSecrets(text: string): string {
  return [...PATTERNS, KEYED].reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text
  )
}

/** Every string in a value, however deep, with secrets redacted */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactSecrets(value) as T
  if (Array.isArray(value)) return value.map(redactDeep) as T
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactDeep(item)])
    ) as T
  return value
}

/** Values shorter than this are not redacted by value: they match too much. */
const MIN_KNOWN_LENGTH = 12

/**
 * Redacts an answer before it is posted: the secrets this Pacenote holds (its
 * Slack tokens, the sandbox's login, the hub token), by value, and the secret
 * formats. Answers go to public channels; what the model can read is limited
 * first (src/reasoners), and this catches what slips past. count: how many were
 * redacted.
 */
export function redactAnswer(
  text: string,
  known: readonly string[] = []
): { text: string; count: number } {
  let count = 0
  const values = [...new Set(known.map((value) => value.trim()))]
    .filter((value) => value.length >= MIN_KNOWN_LENGTH)
    // Longer first, so a value holding another is redacted whole.
    .sort((a, b) => b.length - a.length)
  let out = text
  for (const value of values) {
    const parts = out.split(value)
    count += parts.length - 1
    out = parts.join('[REDACTED SECRET]')
  }
  for (const [pattern, replacement] of PATTERNS)
    out = out.replace(pattern, () => {
      count += 1
      return replacement
    })
  return { text: out, count }
}
