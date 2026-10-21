import type { Locale } from '@src/i18n/locale'

const en = {
  briefing: 'Briefing',
}

const ko: typeof en = {
  briefing: '브리핑',
}

export const text: Record<Locale, typeof en> = { en, ko }
