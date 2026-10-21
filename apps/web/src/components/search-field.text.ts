import type { Locale } from '@src/i18n/locale'

const en = {
  placeholder: 'Search runs by request, channel or reply',
  label: 'Search runs',
  clear: 'Clear search',
}

const ko: typeof en = {
  placeholder: '요청, 채널, 답변으로 실행 기록 검색',
  label: '실행 기록 검색',
  clear: '검색 지우기',
}

export const text: Record<Locale, typeof en> = { en, ko }
