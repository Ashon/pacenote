import type { Locale } from '../i18n/locale.js'
import { listWords } from '../i18n/words.js'

const en = {
  // What shows each role in an area, over the last 30 days
  /** Builds: the days with Claude Code or Codex sessions in it */
  sessionDays: (days: number) =>
    `sessions here on ${days} ${days === 1 ? 'day' : 'days'} of the last 30`,
  /** Reviews: tasks asking you for a review */
  reviews: (n: number) => `${n} reviews asked of you`,
  /** Answers: who asks most (one or two), and how often anyone asked */
  peopleAsked: (people: string[], n: number) =>
    `${listWords(people, 'en')} asked you ${n === 1 ? 'once' : `${n} times`}`,
  /** On call: its user groups (@infra-oncall), and how often they asked */
  groupsAsked: (groups: string[], n: number) =>
    `${groups.join(', ')} asked you ${n === 1 ? 'once' : `${n} times`}`,
}

const times = (n: number) => (n === 1 ? '한 번' : `${n}번`)

const ko: typeof en = {
  sessionDays: (days) => `최근 30일 중 ${days}일 동안 여기서 작업했어요`,
  reviews: (n) => `리뷰 요청을 ${n}번 받았어요`,
  peopleAsked: (people, n) =>
    `${listWords(people, 'ko')} 님이 ${times(n)} 요청했어요`,
  groupsAsked: (groups, n) => `${groups.join(', ')}에서 ${times(n)} 요청했어요`,
}

export const text: Record<Locale, typeof en> = { en, ko }
