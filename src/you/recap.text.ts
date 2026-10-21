import type { Locale } from '../i18n/locale.js'

const en = {
  /** Work in none of your areas */
  elsewhere: 'Elsewhere',
  /** What you asked Pace, by the request's first line */
  askedPace: (request: string) => `Asked Pace: ${request}`,
  // An open task's note: "mina asked you · due Friday"; the due date is the
  // AI's words, as the task has it
  askedYou: (person: string) => `${person} asked you`,
  due: (when: string) => `due ${when}`,
  keptForLater: 'kept for later',
  /** A day's commits in one repository */
  commitsIn: (n: number, repo: string) =>
    `${n} ${n === 1 ? 'commit' : 'commits'} in ${repo}`,
}

const ko: typeof en = {
  elsewhere: '기타',
  askedPace: (request) => `Pace에게 요청: ${request}`,
  askedYou: (person) => `${person}님의 요청`,
  due: (when) => `마감 ${when}`,
  keptForLater: '나중에 할 일로 남김',
  commitsIn: (n, repo) => `${repo} 커밋 ${n}개`,
}

export const text: Record<Locale, typeof en> = { en, ko }
