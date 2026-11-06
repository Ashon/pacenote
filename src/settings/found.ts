import { splitList } from './list.js'
/**
 * Names Settings > Tools offers to pick instead of typing them: what the
 * desktop app finds on this Mac for each connection (apps/desktop/src/found.ts
 * looks them up). Only names and paths, never a key, a token or a kubeconfig's
 * credentials.
 */

/** The settings this Mac finds names for */
export const FOUND_KEYS = [
  'OPS_FS_ROOT',
  'OPS_GIT_ALLOWED_OWNERS',
  'OPS_K8S_CONTEXTS',
  'OPS_SSH_USER',
  'OPS_SSH_KEY',
  'OPS_SSH_ALLOWED_CIDR',
] as const

export type FoundKey = (typeof FOUND_KEYS)[number]

/** Where a name was found, for its title */
export type FoundFrom =
  'home' | 'gh' | 'repositories' | 'kubeconfig' | 'sshConfig' | 'sshFolder'

export interface FoundName {
  value: string
  from: FoundFrom
  /**
   * What stands behind it: the repositories in a folder, the hosts in a range
   * or using a key
   */
  count?: number
  /** The hosts in a range, by their names in the SSH config */
  hosts?: string[]
}

/** What could not be looked at, and why */
export type FoundGap = 'noGh' | 'ghSignedOut' | 'noKubectl'

export interface FoundOnMac {
  names: Partial<Record<FoundKey, FoundName[]>>
  gaps: FoundGap[]
}

/** Settings that hold a list (comma-separated); the rest hold one value */
const LISTS: ReadonlySet<FoundKey> = new Set([
  'OPS_GIT_ALLOWED_OWNERS',
  'OPS_K8S_CONTEXTS',
])

/** GitHub owners are the same in any case (src/broker/github.ts) */
const CASELESS: ReadonlySet<FoundKey> = new Set(['OPS_GIT_ALLOWED_OWNERS'])

export const isFoundKey = (key: string): key is FoundKey =>
  (FOUND_KEYS as readonly string[]).includes(key)

const same = (key: FoundKey, a: string, b: string) =>
  CASELESS.has(key) ? a.toLowerCase() === b.toLowerCase() : a === b

/** Whether a setting's value already has a name */
export function hasName(key: FoundKey, value: string, name: string): boolean {
  return LISTS.has(key)
    ? splitList(value).some((item) => same(key, item, name))
    : same(key, value.trim(), name)
}

/**
 * A setting's value with a name picked or taken out again: a list gains or
 * loses it, keeping the rest in their order; a single value becomes it, or
 * empty when it was it
 */
export function pickName(key: FoundKey, value: string, name: string): string {
  if (!LISTS.has(key)) return hasName(key, value, name) ? '' : name
  const items = splitList(value)
  return hasName(key, value, name)
    ? items.filter((item) => !same(key, item, name)).join(', ')
    : [...items, name].join(', ')
}

/** One Host (or Match) block of an SSH config, as the parts we read */
export interface SshHost {
  /** The Host line's patterns; none for a Match block */
  patterns: string[]
  hostName?: string
  user?: string
  identityFiles: string[]
}

/** A config line's words, with quotes taken off ("a b" stays one word) */
function words(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? ''
  )
}

/**
 * An SSH config's Host blocks, with Include lines read through include():
 * the paths it names, each as the file's text or undefined when unreadable.
 * Settings before the first Host belong to every host, as a block with no
 * patterns.
 */
export function parseSshConfig(
  text: string,
  include: (path: string) => string[],
  depth = 0
): SshHost[] {
  const hosts: SshHost[] = []
  let current: SshHost = { patterns: [], identityFiles: [] }
  hosts.push(current)
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(\S+?)(?:\s*=\s*|\s+)(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]!.toLowerCase()
    const args = words(match[2]!)
    if (key === 'host' || key === 'match') {
      current = {
        patterns: key === 'host' ? args : [],
        identityFiles: [],
      }
      hosts.push(current)
    } else if (key === 'include' && depth < 5) {
      for (const file of args.flatMap(include))
        hosts.push(...parseSshConfig(file, include, depth + 1))
    } else if (key === 'hostname') current.hostName ??= args[0]
    else if (key === 'user') current.user ??= args[0]
    else if (key === 'identityfile' && args[0])
      current.identityFiles.push(args[0])
  }
  return hosts.filter(
    (host) =>
      host.patterns.length > 0 ||
      host.hostName ||
      host.user ||
      host.identityFiles.length > 0
  )
}

/** A host pattern names one host: no wildcard and not negated */
export const namesOneHost = (pattern: string) => !/[*?!]/.test(pattern)

/**
 * The /24 an address is in, for a private address only (10/8, 172.16/12,
 * 192.168/16, 100.64/10): the range SSH checks may reach
 */
export function privateRange(ip: string): string | undefined {
  const parts = ip.split('.').map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return undefined
  const [a, b, c] = parts as [number, number, number, number]
  const isPrivate =
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  return isPrivate ? `${a}.${b}.${c}.0/24` : undefined
}

/**
 * The GitHub owner of a git remote: git@github.com:owner/repo.git,
 * https://github.com/owner/repo, ssh://git@github.com/owner/repo
 */
export function githubOwner(url: string): string | undefined {
  const match =
    /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?github\.com[:/]([A-Za-z0-9-]+)\//i.exec(
      url.trim()
    )
  return match?.[1]
}

/** The remote URLs in a repository's .git/config */
export function remoteUrls(gitConfig: string): string[] {
  return [...gitConfig.matchAll(/^\s*url\s*=\s*(\S+)\s*$/gm)].map(
    (match) => match[1]!
  )
}

/**
 * Names counted by how often they came, most first and then in the order
 * they came
 */
export function byCount(
  values: string[],
  key: (value: string) => string = (value) => value
): { value: string; count: number }[] {
  const counts = new Map<string, { value: string; count: number }>()
  for (const value of values) {
    const seen = counts.get(key(value))
    if (seen) seen.count += 1
    else counts.set(key(value), { value, count: 1 })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}
