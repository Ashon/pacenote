import type { Locale } from '../../../src/i18n/locale.js'

/** Settings > Sandbox's sign-in, when it cannot start */
const en = {
  unknownCli: 'Unknown CLI.',
  underWay: 'A sign-in is already under way.',
}

const ko: typeof en = {
  unknownCli: '알 수 없는 CLI예요.',
  underWay: '이미 로그인이 진행 중이에요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
