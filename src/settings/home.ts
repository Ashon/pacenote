import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/** Where settings and data live unless PACENOTE_HOME says otherwise */
export function defaultHome(home = homedir()): string {
  return path.join(home, '.pacenote')
}

/**
 * Data folders that may hold a running bot's status file (bot.json): this one
 * and the default home, so a bot with its own PACENOTE_DATA_DIR and one in
 * ~/.pacenote never connect to Slack at the same time
 */
export function botLockDirs(dataDir: string, home = homedir()): string[] {
  return [
    ...new Set([dataDir, defaultHome(home)].map((dir) => path.resolve(dir))),
  ]
}

/**
 * Keeps a Pacenote folder (settings, run history, logs) to its owner, so other
 * accounts on this Mac cannot list or read it. Creates it if missing, and
 * tightens one an earlier version made open to all.
 */
export function securePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  tighten(dir, 0o700)
}

/** The same for a file that holds secrets (settings.json), when it exists */
export function securePrivateFile(file: string): void {
  if (existsSync(file)) tighten(file, 0o600)
}

/** Takes the group's and others' access away, for a path this account owns */
function tighten(target: string, mode: number): void {
  const info = statSync(target)
  if (info.uid !== process.getuid?.() || (info.mode & 0o077) === 0) return
  chmodSync(target, mode)
}
