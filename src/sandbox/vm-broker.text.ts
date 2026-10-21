import type { Locale } from '../i18n/locale.js'

const en = {
  /** hint: where to build it (jobHint) */
  notBuilt: (hint: string) => `The ops broker's image is not built: ${hint}.`,
}

const ko: typeof en = {
  notBuilt: (hint) => `ops 브로커 이미지가 아직 없어요. ${hint}.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
