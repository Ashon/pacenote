import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'
import { listWords } from '@src/i18n/words'

const en = {
  title: 'You',
  intro:
    'Where you contribute and what is going on in each, from your tasks and your Claude Code and Codex sessions.',
  desktopOnly: 'Your areas are counted by the desktop app.',
  /** Beside the title: 3 areas · 1 resting */
  areas: (active: number, resting: number) =>
    `${active} ${active === 1 ? 'area' : 'areas'}${resting > 0 ? ` · ${resting} resting` : ''}`,
  notYours: (area: string) => `${area} is not listed as yours anymore.`,
  undo: 'Undo',
  close: 'Close',
  empty:
    'Nothing yet. Your areas show up once you have tasks here, or work in a repository with Claude Code or Codex.',
  resting: 'Resting',
  restingHint: 'Nothing for 4 weeks. They come back when work does.',
  /** accounts: "ashon in Slack and Ashon on GitHub" */
  keptAs: (accounts: string) => `Kept as ${accounts}.`,
  // An area's row
  workingIn: (tool: string) => `Working in ${tool}`,
  lastWorked: (day: string) => `Last worked ${day}`,
  nothingLately: 'Nothing lately',
  nothingOpenShort: 'Nothing open',
  openTasks: (n: number) => `${n} open ${n === 1 ? 'task' : 'tasks'}`,
  askYouMost: (people: string[]) => `${listWords(people, 'en')} ask you most`,
  moreFor: (area: string) => `More for ${area}`,
  rename: 'Rename',
  mergeIntoAnother: 'Merge into another area',
  notMine: 'Not mine anymore',
  // Open
  mergeInto: 'Merge into',
  cancel: 'Cancel',
  roles: 'Roles',
  notEnough: 'Not enough work here yet to tell.',
  now: 'Now',
  nothingOpen: 'Nothing open.',
  askedYou: (person: string) => `${person} asked you`,
  due: (when: string) => `due ${when}`,
  lately: 'Lately',
  nothingDone: 'Nothing done here in the last 30 days.',
  moreInRecap: (n: number) => `and ${n} more in 30 days, in Recap`,
  thisWeekInRecap: 'This week in Recap',
  madeOf: 'Made of',
  takeOut: (part: string, area: string) => `Take ${part} out of ${area}`,
  areaName: 'Area name',
  weeks: (total: number) => `${total} tasks and sessions over 8 weeks`,
  weeksTitle: 'Tasks and sessions each week, the last 8 weeks',
}

const ko: typeof en = {
  title: '나',
  intro:
    '내가 기여하는 곳과 그곳마다 일어나는 일이에요. 할 일과 Claude Code, Codex 세션을 바탕으로 해요.',
  desktopOnly: '영역은 데스크톱 앱이 집계해요.',
  areas: (active, resting) =>
    `영역 ${active}개${resting > 0 ? ` · 쉬는 중 ${resting}개` : ''}`,
  notYours: (area) => `${josa(area, '은/는')} 이제 내 영역이 아니에요.`,
  undo: '되돌리기',
  close: '닫기',
  empty:
    '아직 없어요. 여기에 할 일이 생기거나 Claude Code나 Codex로 저장소에서 작업하면 영역이 나타나요.',
  resting: '쉬는 중',
  restingHint: '4주 동안 아무 일도 없었어요. 일이 생기면 다시 돌아와요.',
  keptAs: (accounts) => `${josa(accounts, '으로/로')} 알고 있어요.`,
  workingIn: (tool) => `${tool}에서 작업 중`,
  lastWorked: (day) => `마지막 작업 ${day}`,
  nothingLately: '최근 활동 없음',
  nothingOpenShort: '열린 할 일 없음',
  openTasks: (n) => `열린 할 일 ${n}개`,
  askYouMost: (people) =>
    `${josa(listWords(people, 'ko'), '이/가')} 가장 자주 요청해요`,
  moreFor: (area) => `${area} 더보기`,
  rename: '이름 바꾸기',
  mergeIntoAnother: '다른 영역과 합치기',
  notMine: '이제 내 영역 아님',
  mergeInto: '합칠 영역',
  cancel: '취소',
  roles: '역할',
  notEnough: '아직 판단할 만큼 작업이 없어요.',
  now: '지금',
  nothingOpen: '열린 할 일이 없어요.',
  askedYou: (person) => `${person}님이 요청함`,
  due: (when) => `마감 ${when}`,
  lately: '최근',
  nothingDone: '최근 30일 동안 여기서 끝낸 일이 없어요.',
  moreInRecap: (n) => `30일 동안 ${n}개 더, 회고에서 보기`,
  thisWeekInRecap: '이번 주 회고 보기',
  madeOf: '구성',
  takeOut: (part, area) => `${area}에서 ${part} 빼기`,
  areaName: '영역 이름',
  weeks: (total) => `8주 동안 할 일과 세션 ${total}개`,
  weeksTitle: '최근 8주, 주마다 할 일과 세션',
}

export const text: Record<Locale, typeof en> = { en, ko }
