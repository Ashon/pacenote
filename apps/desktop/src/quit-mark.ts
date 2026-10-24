import { readFileSync, writeFileSync } from 'node:fs'

/**
 * When the app last quit, kept in the data folder for the next copy to read.
 *
 * Homebrew quits the app before an upgrade by asking it again and again until
 * it is gone (osascript), and a quit request to an app that is not running
 * opens it first, to hand it the request. That copy is handed the quit only
 * once it has started: one that has started Pace by then is still stopping it
 * when Homebrew looks again, so Homebrew asks again, which opens yet another
 * copy once this one is gone, until Homebrew gives up after 10 seconds and
 * leaves the new version closed. So a copy opened moments after a quit waits a
 * moment for one before it starts anything, and goes at once if one comes.
 */
export const QUIT_MARK_FILE = 'desktop-quit.txt'

/** Notes that the app quits now; a mark that cannot be written is let go */
export function markQuit(file: string, now = Date.now()): void {
  try {
    writeFileSync(file, `${new Date(now).toISOString()}\n`)
  } catch {
    // The next copy starts as after any quit.
  }
}

/** True when the app quit less than ms before now */
export function quitWithin(
  file: string,
  ms: number,
  now = Date.now()
): boolean {
  let at: number
  try {
    at = Date.parse(readFileSync(file, 'utf8').trim())
  } catch {
    return false
  }
  return now >= at && now - at < ms
}
