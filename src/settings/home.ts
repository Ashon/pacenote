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
