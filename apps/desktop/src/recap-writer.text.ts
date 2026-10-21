import type { Locale } from '../../../src/i18n/locale.js'
import { josa } from '../../../src/i18n/korean.js'

/** Why Write it up came back with nothing; name: the CLI's */
const en = {
  slow: (name: string) => `${name} did not answer in 2 minutes.`,
  nothing: (name: string) => `${name} wrote nothing.`,
}

const ko: typeof en = {
  slow: (name) => `${josa(name, '이/가')} 2분 안에 답하지 않았어요.`,
  nothing: (name) => `${josa(name, '이/가')} 아무것도 쓰지 않았어요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
