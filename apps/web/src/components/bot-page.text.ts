import type { BotStatus } from '@runtime/types'
import type { Locale } from '@src/i18n/locale'
import type { LogView } from './bot-page'

const en = {
  socket: {
    connecting: 'connecting',
    connected: 'connected',
    reconnecting: 'reconnecting',
    disconnecting: 'disconnecting',
    disconnected: 'disconnected',
  } satisfies Record<BotStatus['socket']['state'], string>,
  /** Under Pace's name: Socket Mode connected 3h ago, 1 reconnect */
  socketLine: (state: string, since: string, reconnects: number) =>
    `Socket Mode ${state} ${since}, ${reconnects} ${reconnects === 1 ? 'reconnect' : 'reconnects'}`,
  intro: 'The process that receives your Slack mentions and answers them.',
  botAccount: 'Bot account',
  reasoner: 'Reasoner',
  mcpLine: (mcp: readonly string[], diagrams: boolean) =>
    `MCP ${mcp.length ? mcp.join(', ') : 'none'} / diagrams ${diagrams ? 'on' : 'off'}`,
  requests: 'Requests',
  active: (n: number) => `${n} active`,
  /** Last: 3m ago */
  handled: (n: number, last?: string) =>
    `${n} handled since start` + (last ? `, last ${last}` : ''),
  process: 'Process',
  /** Up: 3h 4m */
  processLine: (desktop: boolean, up: string) =>
    `${desktop ? 'Desktop app' : 'Terminal'}, up ${up}`,
  lastOutput: 'Last output',
  openSettings: 'Open Settings',
  startingNow: 'Starting it again now.',
  /** In seconds below a minute, else as a duration */
  startingIn: (seconds: number, duration: string) =>
    `Starting it again in ${seconds < 60 ? `${seconds}s` : duration}.`,
  /** Without the desktop app, on two lines */
  desktopOnly: ['Start and stop Pace', 'from the desktop app.'] as [
    string,
    string,
  ],
  start: 'Start',
  startNow: 'Start now',
  restart: 'Restart',
  rebuild: 'Rebuild and restart',
  stop: 'Stop',
  logs: 'Logs',
  views: {
    all: 'All',
    socket: 'Socket Mode',
    mention: 'Mentions',
    problems: 'Warnings and errors',
  } satisfies Record<LogView, string>,
  searchLogs: 'Search logs',
  follow: 'Follow',
  openLogs: 'Open logs folder',
  logsFailed: 'Could not load logs.',
  noLogs: 'No logs to show.',
}

const ko: typeof en = {
  socket: {
    connecting: '연결 중',
    connected: '연결됨',
    reconnecting: '다시 연결 중',
    disconnecting: '연결 끊는 중',
    disconnected: '연결 끊김',
  },
  socketLine: (state, since, reconnects) =>
    `Socket Mode ${state} · ${since} · 재연결 ${reconnects}번`,
  intro: 'Slack 멘션을 받아 답변하는 프로세스예요.',
  botAccount: '봇 계정',
  reasoner: '답변 CLI',
  mcpLine: (mcp, diagrams) =>
    `MCP ${mcp.length ? mcp.join(', ') : '없음'} / 다이어그램 ${diagrams ? '켜짐' : '꺼짐'}`,
  requests: '요청',
  active: (n) => `${n}건 처리 중`,
  handled: (n, last) =>
    `시작 후 ${n}건 처리` + (last ? `, 마지막 ${last}` : ''),
  process: '프로세스',
  processLine: (desktop, up) =>
    `${desktop ? '데스크톱 앱' : '터미널'}, 가동 ${up}`,
  lastOutput: '마지막 출력',
  openSettings: '설정 열기',
  startingNow: '지금 다시 시작해요.',
  startingIn: (seconds, duration) =>
    `${seconds < 60 ? `${seconds}초` : duration} 뒤에 다시 시작해요.`,
  desktopOnly: ['Pace는 데스크톱 앱에서', '시작하고 중지해요.'],
  start: '시작',
  startNow: '지금 시작',
  restart: '다시 시작',
  rebuild: '다시 빌드하고 시작',
  stop: '중지',
  logs: '로그',
  views: {
    all: '전체',
    socket: 'Socket Mode',
    mention: '멘션',
    problems: '경고 및 오류',
  },
  searchLogs: '로그 검색',
  follow: '따라가기',
  openLogs: '로그 폴더 열기',
  logsFailed: '로그를 불러오지 못했어요.',
  noLogs: '보여 줄 로그가 없어요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
