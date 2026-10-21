import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'
import type { RecapPeriod } from '@src/you/types'

const en = {
  title: 'Recap',
  subtitle: 'What you did, by day, week and month',
  periods: {
    day: 'Day',
    week: 'Week',
    month: 'Month',
  } as Record<RecapPeriod, string>,
  recapOf: 'Recap of',
  before: (period: RecapPeriod) => `The ${period} before`,
  after: (period: RecapPeriod) => `The ${period} after`,
  writeItUp: 'Write it up',
  writingItUp: 'Writing it up',
  desktopOnly: 'Recaps are counted by the desktop app.',
  // Copy
  copyAs: {
    day: 'Copy as standup',
    week: 'Copy as weekly update',
    month: 'Copy as monthly recap',
  } as Record<RecapPeriod, string>,
  copied: 'Copied',
  standup: 'Standup',
  asMarkdown: 'As Markdown',
  markdownHint: 'Each part with its lines',
  forSlack: 'For Slack',
  slackHint: "The same, in Slack's formatting",
  summaryOnly: 'The summary only',
  summaryHint: 'Just the sentences written up',
  // Written up
  writtenUp: 'Written up',
  writtenBy: (by: string, when: string) =>
    `Written by ${by} from the lines below, with no tools · ${when}`,
  writeAgain: 'Write again',
  yourAi: 'Your AI',
  writing: (writer: string) =>
    `${writer} is writing it up from the lines below`,
  empty: (period: RecapPeriod) =>
    `Nothing here for this ${period}. Tasks you settle, your commits and your sessions show up here.`,
  // A day
  yesterday: 'Yesterday',
  yesterdayMeta: 'what you did, for the standup',
  done: 'Done',
  today: 'today',
  nothingDone: 'Nothing done yet.',
  doing: 'Doing',
  doingMeta: 'worked on today',
  next: 'Next',
  nextMeta: 'open, due ones first',
  nothingOpen: 'Nothing open.',
  stillOpen: 'Still open',
  stillOpenMeta: 'at the end of the day',
  carriesOver: 'carries over',
  // A week or a month
  onYou: (area: string) => `${area} on the You screen`,
  share: (percent: number, period: RecapPeriod) =>
    `About ${percent}% of your ${period}`,
  moreCommits: (n: number, repos: string[]) =>
    `and ${n} more ${n === 1 ? 'commit' : 'commits'}${repos.length > 0 ? ` in ${repos.join(', ')}` : ''}`,
  started: 'Started',
  wentQuiet: 'Went quiet',
  askedMostBy: 'Asked most by',
  // Where it comes from
  tasksDone: (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'} done`,
  commits: (n: number, emails: string[]) =>
    `${n} ${n === 1 ? 'commit' : 'commits'}${emails.length ? ` by ${emails.join(', ')}` : ''}`,
  runs: (n: number) => `${n} of Pace's ${n === 1 ? 'run' : 'runs'}`,
  from: (parts: string[]) => `From ${parts.join(', ')}.`,
}

/** A period as a sentence names it: 이 주에는 */
const PERIOD: Record<RecapPeriod, string> = {
  day: '날',
  week: '주',
  month: '달',
}

/** A period's length: 한 주의 약 40% */
const SPAN: Record<RecapPeriod, string> = {
  day: '하루',
  week: '한 주',
  month: '한 달',
}

const ko: typeof en = {
  title: '회고',
  subtitle: '한 일을 하루, 한 주, 한 달 단위로 봐요',
  periods: {
    day: '일간',
    week: '주간',
    month: '월간',
  },
  recapOf: '회고 기간',
  before: (period) => `이전 ${PERIOD[period]}`,
  after: (period) => `다음 ${PERIOD[period]}`,
  writeItUp: '정리하기',
  writingItUp: '정리하는 중',
  desktopOnly: '회고는 데스크톱 앱이 집계해요.',
  copyAs: {
    day: '스탠드업으로 복사',
    week: '주간 업데이트로 복사',
    month: '월간 회고로 복사',
  },
  copied: '복사됨',
  standup: '스탠드업',
  asMarkdown: 'Markdown으로',
  markdownHint: '섹션마다 항목을 한 줄씩',
  forSlack: 'Slack용',
  slackHint: '같은 내용을 Slack 서식으로',
  summaryOnly: '요약만',
  summaryHint: '정리한 문장만',
  writtenUp: '정리한 글',
  writtenBy: (by, when) =>
    `${josa(by, '이/가')} 아래 내용만 보고 도구 없이 썼어요 · ${when}`,
  writeAgain: '다시 정리',
  yourAi: '내 AI',
  writing: (writer) => `${josa(writer, '이/가')} 아래 내용을 정리하고 있어요`,
  empty: (period) =>
    `이 ${PERIOD[period]}에는 아무것도 없어요. 처리한 할 일, 내 커밋과 세션이 여기에 나와요.`,
  yesterday: '어제',
  yesterdayMeta: '스탠드업에 쓸 어제 한 일',
  done: '완료',
  today: '오늘',
  nothingDone: '아직 완료한 일이 없어요.',
  doing: '하는 중',
  doingMeta: '오늘 작업한 일',
  next: '다음',
  nextMeta: '열린 할 일, 마감 있는 것 먼저',
  nothingOpen: '열린 할 일이 없어요.',
  stillOpen: '남은 일',
  stillOpenMeta: '하루가 끝날 때',
  carriesOver: '이월',
  onYou: (area) => `나 화면에서 ${area} 보기`,
  share: (percent, period) => `${SPAN[period]}의 약 ${percent}%`,
  moreCommits: (n, repos) =>
    repos.length > 0
      ? `${repos.join(', ')}에 커밋 ${n}개 더`
      : `커밋 ${n}개 더`,
  started: '시작',
  wentQuiet: '잠잠해짐',
  askedMostBy: '자주 요청한 사람',
  tasksDone: (n) => `완료한 할 일 ${n}개`,
  commits: (n, emails) =>
    emails.length ? `${emails.join(', ')}의 커밋 ${n}개` : `커밋 ${n}개`,
  runs: (n) => `Pace 실행 ${n}건`,
  from: (parts) => `${josa(parts.join(', '), '을/를')} 바탕으로 했어요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
