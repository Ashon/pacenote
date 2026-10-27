import type { Locale } from '../i18n/locale.js'

/**
 * A link that shares a team hub with teammates (Settings > Messengers > Slack,
 * once paired). It goes to pacenote.dev's join page, which opens Pacenote on
 * the hub with the link the hub's installer ends with, and says how to install
 * Pacenote on a Mac without it. A pacenote:// link alone is not one Slack or
 * mail makes clickable, and does nothing on a Mac without Pacenote.
 *
 * The hub's address goes after the #, which a browser never sends: neither
 * pacenote.dev nor a link preview sees it, and the page counts nothing.
 * Browser-safe, as the settings screen builds it.
 */
export function hubShareLink(url: string, locale: Locale): string {
  const page = locale === 'ko' ? 'ko/join/' : 'join/'
  return `https://pacenote.dev/${page}#url=${encodeURIComponent(url)}`
}
