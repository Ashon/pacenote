import type { Locale } from '../i18n/locale.js'

const en = {
  noFolder: 'There is no such folder.',
  notCheckout: 'It is not a git checkout.',
}

const ko: typeof en = {
  noFolder: '그런 폴더가 없어요.',
  notCheckout: 'git 저장소가 아니에요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
