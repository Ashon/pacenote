import type { Locale } from '@src/i18n/locale'

const en = {
  copy: 'Copy',
}

const ko: typeof en = {
  copy: '복사',
}

export const text: Record<Locale, typeof en> = { en, ko }
