import type { Locale } from '../../../src/i18n/locale.js'

/** Changes from the Settings screen that cannot be saved as they are */
const en = {
  badChanges: 'The changes format is invalid.',
  notOnScreen: 'This entry cannot be changed from the Settings screen.',
  badValue: 'The value format is invalid.',
  empty: 'Cannot be empty.',
  lineBreaks: 'Cannot contain line breaks.',
}

const ko: typeof en = {
  badChanges: '변경 내용 형식이 올바르지 않아요.',
  notOnScreen: '이 항목은 설정 화면에서 바꿀 수 없어요.',
  badValue: '값 형식이 올바르지 않아요.',
  empty: '비워 둘 수 없어요.',
  lineBreaks: '줄바꿈을 넣을 수 없어요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
