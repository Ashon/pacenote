import type { Locale } from '@src/i18n/locale'
import type { HandledHow } from '@src/tasks/types'

const runs = (n: number): string => (n === 1 ? 'run' : 'runs')

const en = {
  // The setup card
  setUpPace: 'Set up Pace',
  missingSettings: 'Some settings are missing before Pace can start.',
  stepByStep: 'Set up step by step',
  openSettings: 'Open Settings',
  title: 'Overview',
  intro:
    'How Pace has answered your Slack mentions and how your tasks went: how many, how well, with which tools, and with how many tokens.',
  // The figures
  totals: 'Totals',
  totalRuns: 'Total runs',
  /** The unit after a number of runs */
  runsUnit: (n: number) => runs(n),
  today: (n: string) => `${n} today`,
  successRate: 'Success rate',
  failedInterrupted: (failed: number, interrupted: number) =>
    `${failed} failed / ${interrupted} interrupted`,
  averageDuration: 'Average duration',
  averageHint: 'Time to finish one request',
  running: 'Running',
  generating: 'Generating replies now',
  noActive: 'No active requests',
  // Runs
  last14Days: 'Last 14 days',
  runsPerDay: 'Runs per day',
  failed: (n: number) => `${n} failed`,
  noFailures: 'No failures',
  runsChart: 'Runs per day for the last 14 days, failures at the top',
  runsDay: (day: string, n: number, failed: number) =>
    `${day}: ${n} ${runs(n)}${failed ? `, ${failed} failed` : ''}`,
  topTools: 'Top tools',
  calls: 'Calls',
  noToolCalls: 'No tool calls recorded.',
  // Tasks
  tasksHandled: 'Tasks handled',
  perDay: 'Per day',
  howTheyEnded: 'How they ended',
  noneHandled: (open: number) =>
    `None handled in the last 14 days.${open > 0 ? ` ${open} still open.` : ''}`,
  handledUnit: 'handled',
  stillOpen: (n: number) => `${n} still open`,
  noneOpen: 'None open',
  tasksChart: 'Tasks you handled per day for the last 14 days',
  tasksDay: (day: string, n: number) => `${day}: ${n} handled`,
  how: {
    tool: 'In Claude Code or Codex',
    slack: 'Closed in Slack',
    you: 'Marked done',
  } as Record<HandledHow, string>,
  medianTitle: "The median, from a task's message to when it was handled",
  usuallyWithin: 'Usually handled within',
  // Tokens
  tokensPerDay: 'Tokens per day',
  newTokens: 'New tokens',
  newUnit: 'new',
  fromCache: (tokens: string) => `+${tokens} from cache`,
  noneFromCache: 'None from cache',
  tokensChart:
    'New tokens per day for the last 14 days: mentions at the bottom of each bar, task collections above them, recap write-ups on top',
  tokensDay: (
    day: string,
    total: string,
    mentions: string,
    collections: string,
    recaps: string,
    cached: string
  ) =>
    `${day}: ${total} new (mentions ${mentions}, task collections ${collections}, recaps ${recaps}), ${cached} from cache`,
  bySource: 'By source',
  mentions: 'Mentions',
  mentionsHint: (n: number, perRun: string) =>
    `${n} ${runs(n)} · ${perRun} per run`,
  noRunsWithTokens: 'No runs with tokens yet',
  collections: 'Task collections',
  collectionsCount: (n: number) =>
    `${n} ${n === 1 ? 'collection' : 'collections'}`,
  each: (tokens: string) => `${tokens} each`,
  perTaskFound: (tokens: string) => `${tokens} per task found`,
  noCollections: 'None run from the app yet',
  recaps: 'Recaps',
  recapsHint: (n: number, each: string) =>
    `${n} ${n === 1 ? 'write-up' : 'write-ups'} · ${each} each`,
  noRecaps: 'None written up yet',
  readFromCache: 'Read from cache',
  reused: 'Context reused from earlier turns.',
  reusedShare: (percent: number) =>
    `Context reused from earlier turns: ${percent}% of all tokens.`,
}

const ko: typeof en = {
  setUpPace: 'Pace 초기 설정',
  missingSettings: 'Pace를 시작하려면 아직 채워야 할 설정이 있어요.',
  stepByStep: '단계별로 설정',
  openSettings: '설정 열기',
  title: '개요',
  intro:
    'Pace가 Slack 멘션에 어떻게 답했고 할 일은 어떻게 됐는지 보여 줘요. 얼마나 많이, 얼마나 잘, 어떤 도구로, 토큰은 얼마나 썼는지요.',
  totals: '합계',
  totalRuns: '전체 실행',
  runsUnit: () => '건',
  today: (n) => `오늘 ${n}건`,
  successRate: '성공률',
  failedInterrupted: (failed, interrupted) =>
    `실패 ${failed} / 중단 ${interrupted}`,
  averageDuration: '평균 소요 시간',
  averageHint: '요청 하나에 걸린 시간',
  running: '실행 중',
  generating: '지금 답변 작성 중',
  noActive: '처리 중인 요청 없음',
  last14Days: '최근 14일',
  runsPerDay: '일별 실행',
  failed: (n) => `실패 ${n}건`,
  noFailures: '실패 없음',
  runsChart: '최근 14일 동안의 일별 실행, 위쪽은 실패',
  runsDay: (day, n, failed) =>
    `${day}: 실행 ${n}건${failed ? `, 실패 ${failed}건` : ''}`,
  topTools: '많이 쓴 도구',
  calls: '호출',
  noToolCalls: '기록된 도구 호출이 없어요.',
  tasksHandled: '처리한 할 일',
  perDay: '일별',
  howTheyEnded: '끝난 방식',
  noneHandled: (open) =>
    `최근 14일 동안 처리한 할 일이 없어요.${open > 0 ? ` 열린 할 일이 ${open}개 있어요.` : ''}`,
  handledUnit: '개 처리',
  stillOpen: (n) => `열린 할 일 ${n}개`,
  noneOpen: '열린 할 일 없음',
  tasksChart: '최근 14일 동안 일별로 처리한 할 일',
  tasksDay: (day, n) => `${day}: ${n}개 처리`,
  how: {
    tool: 'Claude Code나 Codex에서',
    slack: 'Slack에서 닫음',
    you: '완료로 표시',
  },
  medianTitle: '할 일 메시지가 온 때부터 처리할 때까지 걸린 시간의 중앙값',
  usuallyWithin: '보통 처리까지 걸리는 시간',
  tokensPerDay: '일별 토큰',
  newTokens: '새 토큰',
  newUnit: '신규',
  fromCache: (tokens) => `캐시에서 +${tokens}`,
  noneFromCache: '캐시 사용 없음',
  tokensChart:
    '최근 14일 동안의 일별 새 토큰: 막대마다 아래부터 멘션, 할 일 모으기, 회고 정리',
  tokensDay: (day, total, mentions, collections, recaps, cached) =>
    `${day}: 새 토큰 ${total} (멘션 ${mentions}, 할 일 모으기 ${collections}, 회고 ${recaps}), 캐시 ${cached}`,
  bySource: '출처별',
  mentions: '멘션',
  mentionsHint: (n, perRun) => `실행 ${n}건 · 실행당 ${perRun}`,
  noRunsWithTokens: '아직 토큰을 쓴 실행 없음',
  collections: '할 일 모으기',
  collectionsCount: (n) => `${n}회`,
  each: (tokens) => `회당 ${tokens}`,
  perTaskFound: (tokens) => `찾은 할 일당 ${tokens}`,
  noCollections: '아직 앱에서 실행한 적 없음',
  recaps: '회고',
  recapsHint: (n, each) => `정리 ${n}회 · 회당 ${each}`,
  noRecaps: '아직 정리한 적 없음',
  readFromCache: '캐시에서 읽음',
  reused: '이전 턴의 컨텍스트를 다시 썼어요.',
  reusedShare: (percent) =>
    `이전 턴의 컨텍스트를 다시 썼어요. 전체 토큰의 ${percent}%예요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
