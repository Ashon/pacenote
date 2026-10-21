import type { Locale } from '@src/i18n/locale'

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

const en = {
  todaySoFar: 'Today so far',
  thisWeekSoFar: 'This week so far',
  /** A past week, by its first day: Week of Oct 6 */
  weekOf: (date: string) => `Week of ${date}`,
  /** The current month: October 2026 so far */
  soFar: (month: string) => `${month} so far`,
  /** A week's days: Mon, Oct 6 to Sun, Oct 12 */
  range: (from: string, to: string) => `${from} to ${to}`,
  // An area's counts: "6 done · 18 commits · 4 days"
  done: (n: number) => `${n} done`,
  commits: (n: number) => plural(n, 'commit'),
  days: (n: number) => plural(n, 'day'),
  asks: (n: number) => plural(n, 'new ask'),
  runs: (n: number) => plural(n, 'run'),
  // The period's totals, under the bar
  workOn: (days: number) => `work on ${plural(days, 'day')}`,
  stillOpen: (n: number) => `${n} still open`,
  carriedOver: (n: number) => `${n} carried over`,
  // Copied as text
  yesterday: 'Yesterday',
  doneToday: 'Done today',
  doneTitle: 'Done',
  doing: 'Doing',
  next: 'Next',
  stillOpenTitle: 'Still open',
  moreCommits: (n: number) => plural(n, 'more commit'),
  carriesOver: (title: string) => `Carries over: ${title}`,
}

const ko: typeof en = {
  todaySoFar: '오늘 지금까지',
  thisWeekSoFar: '이번 주 지금까지',
  weekOf: (date) => `${date} 주간`,
  soFar: (month) => `${month} 지금까지`,
  range: (from, to) => `${from} ~ ${to}`,
  done: (n) => `완료 ${n}개`,
  commits: (n) => `커밋 ${n}개`,
  days: (n) => `${n}일`,
  asks: (n) => `새 요청 ${n}개`,
  runs: (n) => `실행 ${n}건`,
  workOn: (days) => `${days}일 작업`,
  stillOpen: (n) => `열린 할 일 ${n}개`,
  carriedOver: (n) => `이월된 할 일 ${n}개`,
  yesterday: '어제',
  doneToday: '오늘 완료',
  doneTitle: '완료',
  doing: '하는 중',
  next: '다음',
  stillOpenTitle: '남은 일',
  moreCommits: (n) => `커밋 ${n}개 더`,
  carriesOver: (title) => `이월: ${title}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
