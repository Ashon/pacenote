import { getLocale, LOCALE_TAGS, type Locale } from './locale.js'

/**
 * Words joined into a list: "a, b and c" in English, "a, b, c" in Korean,
 * where the last word takes the particle of the sentence it is in.
 */
export function listWords(
  items: readonly string[],
  locale: Locale = getLocale()
): string {
  if (locale === 'ko') return items.join(', ')
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** A number with the grouping its language uses: 12,345 */
export function numberWords(n: number, locale: Locale = getLocale()): string {
  return n.toLocaleString(LOCALE_TAGS[locale])
}
