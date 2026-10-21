import type { Locale } from '@src/i18n/locale'

const en = {
  /** Above a step's question: "Step 2 of 5" */
  stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
  copyLabel: (text: string) => `Copy ${text}`,
  copy: 'Copy',
  copied: 'Copied',
  details: 'Details',
}

const ko: typeof en = {
  stepOf: (n, total) => `${total}단계 중 ${n}단계`,
  copyLabel: (text) => `${text} 복사`,
  copy: '복사',
  copied: '복사됨',
  details: '자세히',
}

export const text: Record<Locale, typeof en> = { en, ko }
