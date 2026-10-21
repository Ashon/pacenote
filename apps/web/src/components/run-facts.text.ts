import type { Locale } from '@src/i18n/locale'

const en = {
  newInput: 'New input',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
  output: 'Output',
  /** Tokens in all: 12,345 in total */
  total: (n: string) => `${n} in total`,
  cached: (percent: number) => `${percent}% cached`,
  /** Dollars with three decimals: 0.123 */
  apiPrice: (usd: string) => `$${usd} at API prices`,
}

const ko: typeof en = {
  newInput: '새 입력',
  cacheRead: '캐시 읽기',
  cacheWrite: '캐시 쓰기',
  output: '출력',
  total: (n) => `총 ${n}`,
  cached: (percent) => `캐시 ${percent}%`,
  apiPrice: (usd) => `API 가격으로 $${usd}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
