import { isHubUrl } from './address.js'

/**
 * The team hub's installer (deploy/hub/install.sh) and the way back from it:
 * Pacenote writes the command that runs it on a Linux server, and the installer
 * ends with a pacenote:// link that opens Pacenote on this hub.
 */

/** Where the installer for a version is: its release's own, else main's */
export function hubScriptUrl(version: string): string {
  const ref = /^\d+\.\d+\.\d+$/.test(version) ? `v${version}` : 'main'
  return `https://raw.githubusercontent.com/Ashon/pacenote/${ref}/deploy/hub/install.sh`
}

export interface HubInstallOptions {
  /** Pacenote's version: the installer and the hub image of the same one */
  version: string
  /** The address members use for the hub */
  url: string
  /** Who may use it, by Slack member ID; none is everyone */
  allow: readonly string[]
  /** The language of its notes in Slack, and of the installer's own lines */
  lang: 'en' | 'ko'
  /** This Mac's own pairing: its member and its token's SHA-256 */
  pair?: { user: string; tokenHash: string }
}

/** A word for sh, quoted only when it needs to be */
const word = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`

/**
 * The command to paste in the server's shell. It holds no secret: the Slack
 * tokens are asked for there, and this Mac's pairing goes as its token's hash.
 */
export function hubInstallCommand(options: HubInstallOptions): string {
  const args = [
    '--url',
    options.url,
    ...(/^\d+\.\d+\.\d+$/.test(options.version)
      ? ['--version', options.version]
      : []),
    ...(options.allow.length > 0 ? ['--allow', options.allow.join(',')] : []),
    '--lang',
    options.lang,
    ...(options.pair
      ? ['--pair', `${options.pair.user}:${options.pair.tokenHash}`]
      : []),
  ]
  return `curl -fsSL ${hubScriptUrl(options.version)} | sh -s -- ${args.map(word).join(' ')}`
}

/** The link the installer ends with, for a hub's address */
export function hubLink(url: string): string {
  return `pacenote://hub/connect?url=${encodeURIComponent(url)}`
}

/**
 * The hub a pacenote://hub/connect link names, when it is a link Pacenote
 * opens and the address one a hub can have (isHubUrl); otherwise nothing
 */
export function hubFromLink(link: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(link)
  } catch {
    return undefined
  }
  if (
    parsed.protocol !== 'pacenote:' ||
    parsed.hostname !== 'hub' ||
    parsed.pathname !== '/connect'
  )
    return undefined
  const url = parsed.searchParams.get('url')?.trim().replace(/\/+$/, '')
  return url && isHubUrl(url) ? url : undefined
}
