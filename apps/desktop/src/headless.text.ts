import type { Locale } from '../../../src/i18n/locale.js'
import { josa } from '../../../src/i18n/korean.js'

const en = {
  /** name: as people name the CLI; cli: its command */
  notOnMac: (name: string, cli: string) =>
    `${name} is not on this Mac (${cli} executable not found).`,
}

const ko: typeof en = {
  notOnMac: (name, cli) =>
    `이 Mac에 ${josa(name, '이/가')} 없어요(${cli} 실행 파일을 찾을 수 없음).`,
}

export const text: Record<Locale, typeof en> = { en, ko }
