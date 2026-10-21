import type { Locale } from '@src/i18n/locale'

const en = {
  /** A Mac not (or no longer) in the list */
  otherMac: 'your other Mac',
}

const ko: typeof en = {
  otherMac: '다른 Mac',
}

export const text: Record<Locale, typeof en> = { en, ko }
