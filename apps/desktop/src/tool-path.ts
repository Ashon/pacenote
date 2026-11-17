import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** The line the login shell marks its PATH with; its other output is noise */
const MARKER = 'PACENOTE_PATH='

/**
 * Node version managers and installers that keep CLIs under the home folder,
 * in the order they are added.
 */
const HOME_DIRS = [
  'Library/Application Support/fnm/aliases/default/bin',
  '.local/share/fnm/aliases/default/bin',
  '.volta/bin',
  '.asdf/shims',
  '.local/share/mise/shims',
  '.bun/bin',
  '.local/bin',
]

/**
 * PATH as the login shell sees it: runs `shell -ilc` and reads the one line it
 * marks. undefined when the shell is missing, answers slower than timeoutMs, or
 * prints no usable line.
 */
export function loginShellPath(
  shell: string,
  timeoutMs = 5_000
): string | undefined {
  try {
    const output = execFileSync(
      shell,
      ['-ilc', `printf "\\n${MARKER}%s\\n" "$PATH"`],
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    )
    const line = output
      .split('\n')
      .reverse()
      .find((l) => l.startsWith(MARKER))
    const value = line?.slice(MARKER.length)
    return value || undefined
  } catch {
    // No shell, or no answer from it: the caller falls back to its own paths.
    return undefined
  }
}

/**
 * Folders a node version manager or an installer puts CLIs in: nvm's installed
 * node versions, newest first, then fnm, volta, asdf, mise, bun and Homebrew.
 * An app opened from Finder does not get the terminal's PATH, and a login shell
 * may leave these out too (nvm loads lazily, or the shell answers slower than
 * the timeout), so a CLI the user installed through one of them would look
 * missing. Only folders that exist, with no duplicates.
 */
export function toolDirs(
  home: string,
  nvmDir = path.join(home, '.nvm')
): string[] {
  const dirs = [...nvmBins(nvmDir), ...installedDirs(home)]
  return [...new Set(dirs.filter((dir) => existsSync(dir)))]
}

/**
 * PATH with the tool folders it does not have yet, appended in order. Keeps
 * what PATH already had, and never lists a folder twice.
 */
export function withToolDirs(
  PATH: string | undefined,
  dirs: readonly string[]
): string {
  const parts = (PATH ?? '').split(path.delimiter).filter(Boolean)
  for (const dir of dirs) if (!parts.includes(dir)) parts.push(dir)
  return parts.join(path.delimiter)
}

/**
 * Every nvm node version's bin folder, newest first. nvm's default alias moves
 * the version it names to the front. A missing or unreadable nvm gives nothing.
 */
function nvmBins(nvmDir: string): string[] {
  const versionsDir = path.join(nvmDir, 'versions', 'node')
  let names: string[]
  try {
    names = readdirSync(versionsDir)
  } catch {
    // No nvm here, or no reading it: nothing to add.
    return []
  }
  const bins: { dir: string; version: number[] }[] = []
  for (const name of names) {
    const version = versionOf(name)
    if (!version) continue
    const dir = path.join(versionsDir, name, 'bin')
    if (existsSync(dir)) bins.push({ dir, version })
  }
  bins.sort((a, b) => newestFirst(a.version, b.version))

  const alias = defaultAlias(nvmDir)
  const pinned = alias
    ? bins.find((bin) => matchesAlias(bin.version, alias))
    : undefined
  if (!pinned) return bins.map((bin) => bin.dir)
  return [
    pinned.dir,
    ...bins.filter((bin) => bin !== pinned).map((bin) => bin.dir),
  ]
}

/** v20.11.1 as 20, 11, 1; a folder named anything else is no node version */
function versionOf(name: string): number[] | undefined {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(name)
  if (!match) return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Sorts the newest version first, by number, so v10.0.0 comes before v9.9.9 */
function newestFirst(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return right - left
  }
  return 0
}

/**
 * The version nvm's default alias points at, written without a leading v
 * ("20", "20.9", "20.11.1"). undefined for a name nvm resolves by itself
 * ("node", "lts/*"), a missing file, or anything unreadable.
 */
function defaultAlias(nvmDir: string): string | undefined {
  let text: string
  try {
    text = readFileSync(path.join(nvmDir, 'alias', 'default'), 'utf8')
  } catch {
    return undefined
  }
  const alias = text.trim().replace(/^v/, '')
  return /^\d+(\.\d+){0,2}$/.test(alias) ? alias : undefined
}

/** "20" covers v20.11.1 and v20.9.0 but not v2.0.0 or v200.0.0 */
function matchesAlias(version: number[], alias: string): boolean {
  return alias.split('.').every((part, i) => version[i] === Number(part))
}

/** The fixed CLI folders: the version managers under home, then Homebrew */
function installedDirs(home: string): string[] {
  return [
    ...HOME_DIRS.map((dir) => path.join(home, dir)),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
}
