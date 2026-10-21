import type { Locale } from '@src/i18n/locale'

/**
 * The Debug section's words, made-up data included (development builds only).
 * The benches' titles are the motion patterns' names in motion.css, kept as
 * they are spelled there.
 */
const en = {
  title: 'Debug',
  intro:
    'Only in development builds. Nothing here changes Pace or its settings.',
  spinner: 'Spinner',
  fpsTip: 'Frames drawn in the last second, and the longest gap between two',
  fps: (fps: number, longest: number) =>
    `${fps} fps · longest frame ${longest} ms`,
  pause: 'Pause',
  play: 'Play',
  jumpTo: 'Jump to',
  writing: (size: number) => `writing ${size}px`,
  working: 'Working',
  /** A surface's name: on card */
  on: (surface: string) => `on ${surface}`,
  settle: 'Loading, then the logo',
  settleNote:
    'Pace looks around while a load runs and eases back into the logo when it ends, wherever it was. The loop is still for its first 0.3 seconds, so a shorter load never moves.',
  load: (seconds: number) => `Load ${seconds}s`,
  stop: 'Stop',
  loadUntilStopped: 'Load until stopped',
  loadingUntilStopped: 'Loading until stopped',
  loadingFor: (seconds: number) => `Loading for ${seconds}s`,
  atRest: 'At rest',
  justNow: 'Just now',
  reading: 'Reading the thread and checking web-01…',
  answer:
    'web-01 is healthy apart from disk: /var is at 91%. Rotating the logs under /var/log/app should bring it under 60%.',
  paceScreen: 'Pace screen',
  markNote:
    "The mark beside Pace's name. It looks around while Pace starts or stops, turns once in 16 seconds while Pace is connected, and four times as fast while it answers. Stopped, it is a gray stop sign. Switch states to see it change.",
  requestsInProgress: 'Requests in progress',
  answering: (n: number) =>
    `Answering ${n} ${n === 1 ? 'mention' : 'mentions'}`,
  asOnScreen: 'As on the Pace screen, at 40 px and at 96 px',
  statusBar: 'Status bar',
  statusNote:
    "The window's footer in made-up states. Requests and check issues show while Pace runs (Connected, Reconnecting, Disconnected).",
  taskCollection: 'Task collection',
  collect: {
    off: 'None',
    starting: 'Starting',
    reading: '12 lookups',
  },
  checkIssues: 'Check issues',
  /** Made-up check issues, as Pace would report them */
  issues: [
    'Sandbox: the egress proxy is not running',
    'Diagrams: the renderer did not answer',
  ],
  /** A made-up setup issue */
  tokenMissing: 'The Slack bot token is missing',
  width: 'Width',
  page: 'Page',
  wouldOpen: (route: string) => `That click would open ${route}.`,
  clickHint:
    'Click an item to see where it would go. (the folder button opens Finder)',
  motion: 'Motion',
  motionNote:
    'Each pattern on the components the screens use. With reduced motion on, nothing moves or resizes and what comes and goes fades.',
  screens: {
    overview: 'Overview',
    tasks: 'Todo',
    runs: 'Runs',
  },
  tabs: {
    open: 'Open',
    maybe: 'Maybe',
    done: 'Done',
  },
  swapNote: "A screen or a tab's list giving way",
  swapped: (screen: string) =>
    `${screen}: the old screen fades out, then this one rises in.`,
  indicatorNote: 'The selected tab, with its list',
  tabList: (tab: string) => `The ${tab} list.`,
  revealNote: 'A row opening in place',
  task: 'Review the payments retry PR',
  taskDetail:
    'mina asked for a review of the retry change before Thursday. The thread settled on 5 retries with a backoff.',
  arriveNote: 'Rows coming into a list and leaving it',
  addTask: 'Add a task',
  taskN: (n: number) => `Task ${n}`,
  done: 'Done',
  dialogNote: 'A question, and a panel at the side',
  openDialog: 'Open a dialog',
  openSheet: 'Open a sheet',
  dialogTitle: 'Where should the session open?',
  dialogBody: 'It lifts in and sinks back out.',
  close: 'Close',
  sessionLog: 'Session log',
  sheetBody: 'It slides in and goes at once.',
  fadeNote: 'An AI tool at work on a task, and what it changes',
  doneWorking: 'Done working',
  startWorking: 'Start working',
  moveDue: 'Move the due date',
  days: {
    thursday: 'Thursday',
    wednesday: 'Wednesday',
  },
  workingIn: 'Working in Claude Code',
  popNote: 'A menu and a tooltip out of their anchors',
  tooltip: 'Opens in ~/git/payments',
  hover: 'Hover for a tooltip',
  menu: 'A menu',
  continueInCodex: 'Continue in Codex',
  draftReply: 'Draft a reply',
}

const ko: typeof en = {
  title: '디버그',
  intro:
    '개발 빌드에만 있어요. 여기서 무엇을 해도 Pace나 설정은 바뀌지 않아요.',
  spinner: '스피너',
  fpsTip: '지난 1초 동안 그린 프레임 수와 두 프레임 사이의 가장 긴 간격',
  fps: (fps, longest) => `${fps} fps · 가장 긴 프레임 ${longest} ms`,
  pause: '일시 정지',
  play: '재생',
  jumpTo: '이동',
  writing: (size) => `쓰기 ${size}px`,
  working: '작업 중',
  on: (surface) => `${surface} 위`,
  settle: '로딩 후 로고로',
  settleNote:
    'Pace는 로딩하는 동안 주위를 둘러보다가, 끝나면 어디에 있었든 부드럽게 로고로 돌아와요. 처음 0.3초 동안은 움직이지 않아서 그보다 짧은 로딩에는 움직임이 없어요.',
  load: (seconds) => `${seconds}초 로딩`,
  stop: '중지',
  loadUntilStopped: '멈출 때까지 로딩',
  loadingUntilStopped: '멈출 때까지 로딩 중',
  loadingFor: (seconds) => `${seconds}초 동안 로딩 중`,
  atRest: '멈춤',
  justNow: '방금',
  reading: '스레드를 읽고 web-01을 확인하는 중…',
  answer:
    'web-01은 디스크 말고는 괜찮아요. /var가 91% 찼어요. /var/log/app 아래 로그를 로테이트하면 60% 아래로 내려갈 거예요.',
  paceScreen: 'Pace 화면',
  markNote:
    'Pace 이름 옆의 마크예요. Pace가 시작하거나 중지하는 동안 주위를 둘러보고, 연결된 동안에는 16초에 한 바퀴, 답변하는 동안에는 네 배 빠르게 돌아요. 중지되면 회색 정지 표시가 돼요. 상태를 바꿔 가며 보세요.',
  requestsInProgress: '처리 중인 요청',
  answering: (n) => `멘션 ${n}건에 답변 중`,
  asOnScreen: 'Pace 화면에서처럼 40 px, 96 px 크기로',
  statusBar: '상태 표시줄',
  statusNote:
    '창 아래 표시줄을 지어낸 상태로 보여 줘요. 요청과 점검 문제는 Pace가 실행 중일 때(연결됨, 다시 연결 중, 연결 끊김) 보여요.',
  taskCollection: '할 일 모으기',
  collect: {
    off: '없음',
    starting: '시작 중',
    reading: '12번 조회',
  },
  checkIssues: '점검 문제',
  issues: [
    '샌드박스: 외부 연결 프록시가 실행 중이 아니에요',
    '다이어그램: 렌더러가 응답하지 않았어요',
  ],
  tokenMissing: 'Slack 봇 토큰이 없어요',
  width: '너비',
  page: '페이지',
  wouldOpen: (route) => `클릭하면 ${route} 화면이 열려요.`,
  clickHint:
    '항목을 클릭하면 어디로 가는지 보여요. (폴더 버튼은 Finder를 열어요)',
  motion: '모션',
  motionNote:
    '화면에서 쓰는 컴포넌트에 적용한 각 패턴이에요. 동작 줄이기를 켜면 움직이거나 크기가 바뀌는 것 없이, 나타나고 사라지는 것만 페이드돼요.',
  screens: {
    overview: '개요',
    tasks: '할 일',
    runs: '실행 기록',
  },
  tabs: {
    open: '열림',
    maybe: '후보',
    done: '완료',
  },
  swapNote: '화면이나 탭의 목록이 바뀔 때',
  swapped: (screen) => `${screen}: 이전 화면이 사라지고 이 화면이 올라와요.`,
  indicatorNote: '선택한 탭과 그 목록',
  tabList: (tab) => `${tab} 목록이에요.`,
  revealNote: '제자리에서 펼쳐지는 행',
  task: '결제 재시도 PR 리뷰하기',
  taskDetail:
    'mina가 목요일 전에 재시도 변경을 리뷰해 달라고 했어요. 스레드에서는 백오프를 두고 5번 재시도하기로 정했어요.',
  arriveNote: '목록에 들어오고 나가는 행',
  addTask: '할 일 추가',
  taskN: (n) => `할 일 ${n}`,
  done: '완료',
  dialogNote: '질문 창과 옆 패널',
  openDialog: '대화상자 열기',
  openSheet: '시트 열기',
  dialogTitle: '세션을 어디에서 열까요?',
  dialogBody: '떠오르듯 들어왔다가 가라앉듯 나가요.',
  close: '닫기',
  sessionLog: '세션 로그',
  sheetBody: '미끄러져 들어오고 한 번에 사라져요.',
  fadeNote: '할 일을 작업 중인 AI 도구와 그 도구가 바꾸는 내용',
  doneWorking: '작업 끝내기',
  startWorking: '작업 시작',
  moveDue: '마감일 옮기기',
  days: {
    thursday: '목요일',
    wednesday: '수요일',
  },
  workingIn: 'Claude Code에서 작업 중',
  popNote: '기준점에서 나오는 메뉴와 툴팁',
  tooltip: '~/git/payments에서 열려요',
  hover: '마우스를 올려 툴팁 보기',
  menu: '메뉴',
  continueInCodex: 'Codex에서 이어 하기',
  draftReply: '답장 초안 쓰기',
}

export const text: Record<Locale, typeof en> = { en, ko }
