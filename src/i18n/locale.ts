/**
 * The languages Pacenote writes its own text in: the app, its tray and
 * notifications, and the notes Pace posts itself. English is the source: each
 * message is written in English first, with Korean beside it in the same shape
 * (docs/i18n.md). What the AI writes follows the conversation instead.
 */
export const LOCALES = ['en', 'ko'] as const
export type Locale = (typeof LOCALES)[number]

/** Each language by its own name, as a language picker shows it */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
}

/** Each language as an instruction to an AI names it: "write in Korean" */
export const LANGUAGE_FOR_AI: Record<Locale, string> = {
  en: 'English',
  ko: 'Korean',
}

/** The tag dates and numbers are formatted with */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: 'en-US',
  ko: 'ko-KR',
}

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale)
}

/**
 * The first of these languages (BCP 47 tags such as ko-KR, the most preferred
 * first) Pacenote is written in; English when none is.
 */
export function pickLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.trim().toLowerCase().split(/[-_]/)[0]
    if (isLocale(base)) return base
  }
  return 'en'
}

/**
 * A process's language from its environment: PACENOTE_LOCALE, which the
 * desktop app passes Pace, or else the terminal's (LC_ALL, LC_MESSAGES, LANG).
 */
export function envLocale(env: Record<string, string | undefined>): Locale {
  const given = env.PACENOTE_LOCALE?.trim()
  if (isLocale(given)) return given
  return pickLocale(
    [env.LC_ALL, env.LC_MESSAGES, env.LANG].filter(
      (value): value is string => Boolean(value) && value !== 'C'
    )
  )
}

let current: Locale = 'en'

/**
 * Sets the language this process writes its text in: at startup, and when it
 * is changed in Settings.
 */
export function setLocale(locale: Locale): void {
  current = locale
}

/** The language this process writes its text in */
export function getLocale(): Locale {
  return current
}

/**
 * A module's messages in a language, the current one by default. Messages are
 * kept as { en, ko }, with Korean typed as English's shape.
 */
export function localized<T>(
  text: Record<Locale, T>,
  locale: Locale = current
): T {
  return text[locale]
}
