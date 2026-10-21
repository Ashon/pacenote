import { josa } from '../i18n/korean.js'
import type { Locale } from '../i18n/locale.js'

const en = {
  empty: 'The domain is empty.',
  wildcard: 'Wildcards are not allowed. Enter an exact host name.',
  url: 'Enter only a host name, not a URL.',
  port: 'Do not include a port. (Only HTTPS 443 is allowed)',
  ip: 'IP addresses are not allowed.',
  invalid: 'Not a valid host name.',
  required: (reasoner: string) => `Required for ${reasoner} to work.`,
}

const ko: typeof en = {
  empty: '도메인이 비어 있어요.',
  wildcard: '와일드카드는 쓸 수 없어요. 정확한 호스트 이름을 입력하세요.',
  url: 'URL이 아니라 호스트 이름만 입력하세요.',
  port: '포트는 넣지 마세요. (HTTPS 443만 허용돼요)',
  ip: 'IP 주소는 쓸 수 없어요.',
  invalid: '올바른 호스트 이름이 아니에요.',
  required: (reasoner) => `${josa(reasoner, '이/가')} 동작하려면 필요해요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
