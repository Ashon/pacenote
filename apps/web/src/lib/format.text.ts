import type { Locale } from '../../../../src/i18n/locale.js'

const en = {
  today: 'Today',
  yesterday: 'Yesterday',
  justNow: 'just now',
  minutesAgo: (n: number) => `${n}m ago`,
  hoursAgo: (n: number) => `${n}h ago`,
  daysAgo: (n: number) => `${n}d ago`,
  /** Seconds with one decimal: 12.3s */
  seconds: (n: string) => `${n}s`,
  minutes: (min: number) => `${min}m`,
  minutesSeconds: (min: number, sec: number) => `${min}m ${sec}s`,
  hours: (hours: number) => `${hours}h`,
  hoursMinutes: (hours: number, min: number) => `${hours}h ${min}m`,
  waitMinutes: (n: number) => `${n} min`,
  waitHours: (n: number) => `${n} ${n === 1 ? 'hour' : 'hours'}`,
  waitDays: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
}

const ko: typeof en = {
  today: '오늘',
  yesterday: '어제',
  justNow: '방금',
  minutesAgo: (n) => `${n}분 전`,
  hoursAgo: (n) => `${n}시간 전`,
  daysAgo: (n) => `${n}일 전`,
  seconds: (n) => `${n}초`,
  minutes: (min) => `${min}분`,
  minutesSeconds: (min, sec) => `${min}분 ${sec}초`,
  hours: (hours) => `${hours}시간`,
  hoursMinutes: (hours, min) => `${hours}시간 ${min}분`,
  waitMinutes: (n) => `${n}분`,
  waitHours: (n) => `${n}시간`,
  waitDays: (n) => `${n}일`,
}

export const text: Record<Locale, typeof en> = { en, ko }
