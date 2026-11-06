import { readFileSync, writeFileSync } from 'node:fs'
import {
  isLocale,
  pickLocale,
  type LanguagePreference,
  type LanguageState,
} from '../../../src/i18n/locale.js'

export type { LanguagePreference, LanguageState }

/**
 * desktop.json, the desktop app's own preferences (not the bot's settings
 * file): read as a whole and written back with only the given keys changed,
 * so each preference keeps the others.
 */
export function readPrefs(file: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function writePrefs(file: string, patch: Record<string, unknown>): void {
  writeFileSync(
    file,
    `${JSON.stringify({ ...readPrefs(file), ...patch }, null, 2)}\n`
  )
}

export function readLanguage(file: string): LanguagePreference {
  const value = readPrefs(file).language
  return isLocale(value) ? value : 'system'
}

/**
 * The language the app is in: the one chosen in Settings, or else the first of
 * macOS's preferred languages Pacenote is written in. PACENOTE_DESKTOP_LANGUAGE
 * stands in for macOS's (end-to-end tests and screen captures pin it).
 */
export function resolveLanguage(
  preference: LanguagePreference,
  systemLanguages: readonly string[],
  env: Record<string, string | undefined> = process.env
): LanguageState {
  const pinned = env.PACENOTE_DESKTOP_LANGUAGE?.trim()
  const system = pinned ? [pinned] : systemLanguages
  return {
    preference,
    locale: preference === 'system' ? pickLocale(system) : preference,
  }
}
