import type { Locale } from '../i18n/locale.js'

const en = {
  cancelled: 'Cancelled.',
  /** last: the CLI's last line */
  notFinished: (last: string) => `The sign-in did not finish: ${last}`,
  notFinishedCode: (code: number | null) =>
    `The sign-in did not finish (exit code ${code ?? 'none'}).`,
}

const ko: typeof en = {
  cancelled: '취소했어요.',
  notFinished: (last) => `로그인을 마치지 못했어요: ${last}`,
  notFinishedCode: (code) =>
    `로그인을 마치지 못했어요 (종료 코드 ${code ?? '없음'}).`,
}

export const text: Record<Locale, typeof en> = { en, ko }
