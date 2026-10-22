import { getLocale, type Locale } from './locale.js'

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
