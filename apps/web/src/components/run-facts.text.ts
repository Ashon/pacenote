import type { Locale } from '@src/i18n/locale'

const en = {
  elapsed: 'Elapsed',
  tokens: 'Tokens',
  /** Tokens, formatted: 1.2k new */
  newTokens: (n: string) => `${n} new`,
  fromCache: (n: string) => `+${n} from cache`,
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
  elapsed: '경과 시간',
  tokens: '토큰',
  newTokens: (n) => `신규 ${n}`,
  fromCache: (n) => `캐시에서 +${n}`,
  newInput: '새 입력',
  cacheRead: '캐시 읽기',
  cacheWrite: '캐시 쓰기',
  output: '출력',
  total: (n) => `총 ${n}`,
  cached: (percent) => `캐시 ${percent}%`,
  apiPrice: (usd) => `API 가격으로 $${usd}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
