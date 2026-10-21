import type { Locale } from '../i18n/locale.js'

const en = {
  /** A collection with no error kept: one that was cut off */
  stopped: 'The collection stopped before it finished.',
}

const ko: typeof en = {
  stopped: '할 일 모으기가 끝나기 전에 멈췄어요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
