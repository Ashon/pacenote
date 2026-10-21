import type { Locale } from '../i18n/locale.js'

const en = {
  /** label: what was checked, as the log names it */
  checkFailed: (label: string, reason: string) =>
    `${label} check failed: ${reason}`,
}

const ko: typeof en = {
  // The problem is shown under what was checked, so it need not say it again.
  checkFailed: (_label, reason) => `확인하지 못했어요: ${reason}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
