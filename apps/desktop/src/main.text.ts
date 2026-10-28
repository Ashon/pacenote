import type { Locale } from '../../../src/i18n/locale.js'
import { josa } from '../../../src/i18n/korean.js'
import type { SupervisorState } from '../../../src/runtime/types.js'

const en = {
  /** Pace's state in the menu bar's menu and its tooltip */
  phase: {
    idle: 'Stopped',
    setup: 'Setup needed',
    failed: 'Failed to start',
    building: 'Building',
    starting: 'Starting',
    running: 'Running',
    stopping: 'Stopping',
    crashed: 'Crashed',
    external: 'Running in terminal',
  } satisfies Record<SupervisorState['phase'], string>,
  retrying: (label: string) => `${label}, starting again`,
  /** Pace turned off: Pacenote for Todo alone */
  off: 'Off',
  standingBy: 'Standing by (another of your Macs answers)',
  socket: (reconnecting: boolean) =>
    `Socket Mode ${reconnecting ? 'reconnecting' : 'disconnected'}`,
  connected: (inTerminal: boolean, reasoner: string) =>
    `Connected${inTerminal ? ' in terminal' : ''} (${reasoner})`,
  tooltip: (app: string, label: string) => `${app} - Pace: ${label}`,
  status: (label: string) => `Pace: ${label}`,
  restart: 'Restart Pace',
  setUp: 'Set up Pace...',
  openSettings: 'Open Settings...',
  start: 'Start Pace',
  open: (app: string) => `Open ${app}`,
  activeRequests: (n: number) =>
    `${n} active ${n === 1 ? 'request' : 'requests'}`,
  updateOut: (version: string) => `Pacenote ${version} is out...`,
  quit: (app: string) => `Quit ${app}`,
  /** Errors the window shows */
  notAllowed: 'Not allowed.',
  denied: 'Denied',
  noSlackAppToShare: (mac: string) =>
    `${mac} has no Slack app of its own to share.`,
  notAGroup: (group: string) => `${group} is not a user group.`,
  notARecap: 'Not a recap.',
  nothingToWriteUp: 'There is nothing to write up yet.',
  bothResting: 'Both AIs are resting.',
  tasksOff: 'Turn on Settings > Todo > Gather my tasks from Slack first.',
  nothingToAnswer: 'There is nothing to answer.',
  whereIs: (repo: string) => `Where is ${repo}?`,
  chooseFolder: 'Choose a folder',
  noSuchTask: 'There is no such task.',
  chooseFolderFirst: 'Choose the folder to work in first.',
  noSuchSession: 'There is no such session.',
  otherMac: 'your other Mac',
  sessionElsewhere: (mac: string) =>
    `That session is on ${mac}. Start one here instead.`,
  drafting: 'A draft is already being written.',
  emptyReply: 'The reply is empty.',
  noSessionLog: (tool: string) =>
    `${tool} has no log of this session on this Mac.`,
  bothTokensFirst: 'Connect your Slack app with both tokens first.',
  runningElsewhere:
    'Pace is running elsewhere, such as a terminal, and takes the mentions. Stop it there, then try again.',
  notAMember: 'That is not a Slack member.',
  startedElsewhere:
    'Pace started running elsewhere, such as a terminal, and takes the mentions now. Stop it there, then try again.',
  startedHere:
    'Pace started, so setup stopped listening. Try again to stop Pace and listen.',
}

const ko: typeof en = {
  phase: {
    idle: '중지됨',
    setup: '설정 필요',
    failed: '시작 실패',
    building: '빌드 중',
    starting: '시작 중',
    running: '실행 중',
    stopping: '중지 중',
    crashed: '비정상 종료',
    external: '터미널에서 실행 중',
  },
  retrying: (label) => `${label}, 곧 다시 시작`,
  off: '꺼짐',
  standingBy: '대기 중 (내 다른 Mac이 답변 중)',
  socket: (reconnecting) =>
    `Socket Mode ${reconnecting ? '다시 연결 중' : '연결 끊김'}`,
  connected: (inTerminal, reasoner) =>
    `${inTerminal ? '터미널에서 ' : ''}연결됨 (${reasoner})`,
  tooltip: (app, label) => `${app} - Pace: ${label}`,
  status: (label) => `Pace: ${label}`,
  restart: 'Pace 다시 시작',
  setUp: 'Pace 초기 설정...',
  openSettings: '설정 열기...',
  start: 'Pace 시작',
  open: (app) => `${app} 열기`,
  activeRequests: (n) => `처리 중인 요청 ${n}개`,
  updateOut: (version) => `Pacenote ${version} 업데이트가 나왔어요...`,
  quit: (app) => `${app} 종료`,
  notAllowed: '허용되지 않아요.',
  denied: '거부됨',
  noSlackAppToShare: (mac) => `${mac}에는 공유할 자체 Slack 앱이 없어요.`,
  notAGroup: (group) => `${josa(group, '은/는')} 사용자 그룹이 아니에요.`,
  notARecap: '회고가 아니에요.',
  nothingToWriteUp: '아직 정리할 내용이 없어요.',
  bothResting: '두 AI 모두 쉬는 중이에요.',
  tasksOff: '먼저 설정 > 할 일 > Slack에서 내 할 일 모으기를 켜세요.',
  nothingToAnswer: '답할 내용이 없어요.',
  whereIs: (repo) => `${josa(repo, '은/는')} 어디에 있나요?`,
  chooseFolder: '폴더 선택',
  noSuchTask: '그런 할 일이 없어요.',
  chooseFolderFirst: '먼저 작업할 폴더를 선택하세요.',
  noSuchSession: '그런 세션이 없어요.',
  otherMac: '내 다른 Mac',
  sessionElsewhere: (mac) =>
    `그 세션은 ${mac}에 있어요. 대신 여기서 새로 시작하세요.`,
  drafting: '이미 초안을 쓰고 있어요.',
  emptyReply: '답장이 비어 있어요.',
  noSessionLog: (tool) => `이 Mac에는 이 세션의 ${tool} 로그가 없어요.`,
  bothTokensFirst: '먼저 토큰 두 개로 Slack 앱을 연결하세요.',
  runningElsewhere:
    'Pace가 터미널 같은 다른 곳에서 실행 중이라 멘션을 그쪽에서 받고 있어요. 그곳에서 중지한 뒤 다시 시도하세요.',
  notAMember: 'Slack 멤버가 아니에요.',
  startedElsewhere:
    'Pace가 터미널 같은 다른 곳에서 실행되기 시작해 이제 멘션을 그쪽에서 받아요. 그곳에서 중지한 뒤 다시 시도하세요.',
  startedHere:
    'Pace가 시작되어 초기 설정이 멘션 기다리기를 멈췄어요. 다시 시도하면 Pace를 중지하고 기다려요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
