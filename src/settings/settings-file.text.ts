import type { Locale } from '../i18n/locale.js'

const en = {
  notJson: (reason: string) => `The settings file is not valid JSON: ${reason}`,
  notObject: 'The settings file must hold one object, in braces.',
}

const ko: typeof en = {
  notJson: (reason) => `설정 파일이 올바른 JSON이 아니에요: ${reason}`,
  notObject: '설정 파일에는 중괄호로 감싼 객체 하나가 있어야 해요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
