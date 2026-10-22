import { readFileSync } from 'node:fs'
import path from 'node:path'
import { envLocale, isLocale, type Locale } from './locale.js'

/**
 * The desktop app's own preferences in the data folder, where it also keeps
 * the language it is in (apps/desktop/src/language.ts)
 */
export const DESKTOP_PREFS_FILE = 'desktop.json'

/**
 * The language the user reads Pacenote in, which what an AI writes for them
 * follows (task titles and summaries, wrap-ups, recaps, answers whose request
 * does not show a language): the app's, as the app tells Pace
 * (PACENOTE_LOCALE) or keeps it in the data folder for the processes it does
 * not start, such as Pacenote's MCP server in Claude Code; else the
 * terminal's.
 */
export function userLocale(
  dataDir: string,
  env: Record<string, string | undefined> = process.env
): Locale {
  const given = env.PACENOTE_LOCALE?.trim()
  if (isLocale(given)) return given
  try {
    const prefs = JSON.parse(
      readFileSync(path.join(dataDir, DESKTOP_PREFS_FILE), 'utf8')
    ) as { locale?: unknown } | null
    if (isLocale(prefs?.locale)) return prefs.locale
  } catch {
    // No app on this Mac, or not opened yet
  }
  return envLocale(env)
}
