import type { Locale } from '@src/i18n/locale'
import type { SessionAskKind, SessionWhere } from '@src/sessions/types'

const en = {
  title: 'Sessions',
  newSession: 'New session',
  meta: (open: number, working: number) =>
    `${open} open on this Mac · ${working} working`,
  /** From your phone or iPad: on the Mac it is linked to, by its name */
  metaOn: (mac: string, open: number, working: number) =>
    `${open} open on ${mac} · ${working} working`,
  yourTurnLabel: 'Your turn',
  workingLabel: 'Working',
  andMore: (n: number) => `and ${n} more`,
  tabOpen: 'Open',
  tabEnded: 'Ended today',
  groupLine: (n: number, working: number, turn: number) =>
    [
      n === 1 ? '1 session' : `${n} sessions`,
      working ? `${working} working` : '',
      turn ? `${turn} your turn` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  notInProject: 'Not in a project',
  working: 'Working',
  yourTurn: 'Your turn',
  /** How long it has been quiet: "3 hours" */
  quiet: (wait: string) => `Quiet ${wait}`,
  ended: 'Ended',
  where: {
    'claude-app': 'Claude app',
    terminal: 'Terminal',
    web: 'claude.ai',
    'codex-app': 'Codex app',
    pacenote: 'Pacenote',
  } satisfies Record<SessionWhere, string>,
  openIn: {
    'claude-app': 'Open in Claude',
    terminal: (app?: string) => `Show in ${app ?? 'Terminal'}`,
    web: 'Open on claude.ai',
    'codex-app': 'Open in Codex',
    pacenote: 'Open',
  },
  /** A session's page, in Pacenote */
  open: 'Open',
  asks: {
    command: 'Asks to run a command',
    edit: 'Asks to change a file',
    web: 'Asks to go online',
    plan: 'Has a plan',
    tool: 'Asks to use a tool',
  } satisfies Record<SessionAskKind, string>,
  youAsked: 'You typed',
  branch: 'Branch',
  folder: 'Folder',
  task: 'Task',
  started: 'Started',
  copyResume: (command: string) => `Copy ${command}`,
  // Its task
  notATask: 'Not a task yet',
  linkToTask: 'Link to a task',
  makeTask: 'Make it a task',
  unlink: 'Unlink',
  looksLike: 'Looks like',
  link: 'Link',
  notIt: 'Not it',
  linkTitle: 'Link to a task',
  linkLead: (title: string) =>
    `“${title}” becomes the task's work: it shows on the task, and the task shows what it does.`,
  findTask: 'Find a task',
  openTasks: 'Open tasks',
  noTasks: 'No open task has those words.',
  askedYou: (who: string) => `${who} asked you`,
  noneOpen: 'No sessions are open on this Mac.',
  noneEnded: 'No session ended today.',
  notListed:
    'Claude Code did not say which of its sessions are open, so these are the ones that wrote to their logs today.',
  reading: 'Reading the sessions on this Mac.',
  // Before it is on
  offTitle: 'Your sessions, in one place',
  offLead:
    'Pacenote can list the Claude Code and Codex sessions open on this Mac: where each runs, whether it is working or waiting for you, and the task it is for.',
  offFoot:
    "It reads which sessions are open and what you typed in them, and a session's whole log only when you open it. Sessions that worked on a task show on it too. Nothing leaves this Mac but for your own phone or iPad paired with it. Settings > Todo turns it off.",
  claudeOpen: (n: number, where: string) =>
    n === 0 ? 'None open now' : `${n} open now: ${where}`,
  codexToday: (n: number) =>
    n === 0
      ? 'None wrote to their logs today'
      : n === 1
        ? '1 session wrote to its log today'
        : `${n} sessions wrote to their logs today`,
  inWhere: {
    'claude-app': 'in the Claude app',
    terminal: 'in a terminal',
    web: 'from claude.ai',
    'codex-app': 'in the Codex app',
    pacenote: 'in Pacenote',
  } satisfies Record<SessionWhere, string>,
  notNow: 'Not now',
  show: 'Show my sessions',
}

const ko: typeof en = {
  title: '세션',
  newSession: '새 세션',
  meta: (open, working) => `이 Mac에서 ${open}개 열림 · ${working}개 작업 중`,
  metaOn: (mac, open, working) =>
    `${mac}에서 ${open}개 열림 · ${working}개 작업 중`,
  yourTurnLabel: '내 차례',
  workingLabel: '작업 중',
  andMore: (n) => `외 ${n}개`,
  tabOpen: '열림',
  tabEnded: '오늘 끝남',
  groupLine: (n, working, turn) =>
    [
      `세션 ${n}개`,
      working ? `작업 중 ${working}` : '',
      turn ? `내 차례 ${turn}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  notInProject: '프로젝트 밖',
  working: '작업 중',
  yourTurn: '내 차례',
  quiet: (wait) => `${wait}째 조용함`,
  ended: '끝남',
  where: {
    'claude-app': 'Claude 앱',
    terminal: '터미널',
    web: 'claude.ai',
    'codex-app': 'Codex 앱',
    pacenote: 'Pacenote',
  },
  openIn: {
    'claude-app': 'Claude에서 열기',
    terminal: (app) => `${app ?? '터미널'}에서 보기`,
    web: 'claude.ai에서 열기',
    'codex-app': 'Codex에서 열기',
    pacenote: '열기',
  },
  open: '열기',
  asks: {
    command: '명령 실행을 물어요',
    edit: '파일 변경을 물어요',
    web: '인터넷 접속을 물어요',
    plan: '계획을 보여 줘요',
    tool: '도구 사용을 물어요',
  },
  youAsked: '내가 입력한 말',
  branch: '브랜치',
  folder: '폴더',
  task: '할 일',
  started: '시작',
  copyResume: (command) => `${command} 복사`,
  notATask: '아직 할 일이 아님',
  linkToTask: '할 일에 연결',
  makeTask: '할 일로 만들기',
  unlink: '연결 해제',
  looksLike: '비슷한 할 일',
  link: '연결',
  notIt: '아님',
  linkTitle: '할 일에 연결',
  linkLead: (title) =>
    `“${title}” 세션을 할 일의 작업으로 연결해요. 할 일에 이 세션과 세션이 하는 일이 보여요.`,
  findTask: '할 일 찾기',
  openTasks: '열린 할 일',
  noTasks: '그런 말이 들어간 열린 할 일이 없어요.',
  askedYou: (who) => `${who}님이 요청`,
  noneOpen: '이 Mac에 열린 세션이 없어요.',
  noneEnded: '오늘 끝난 세션이 없어요.',
  notListed:
    'Claude Code가 어떤 세션이 열려 있는지 알려 주지 않아서, 오늘 로그를 쓴 세션을 보여 줘요.',
  reading: '이 Mac의 세션을 읽고 있어요.',
  offTitle: '내 세션을 한곳에서',
  offLead:
    'Pacenote가 이 Mac에 열린 Claude Code와 Codex 세션을 모아 보여 줘요. 어디서 돌고 있는지, 작업 중인지 내 차례인지, 어떤 할 일을 하는지요.',
  offFoot:
    '어떤 세션이 열려 있는지와 내가 입력한 말을 읽고, 세션의 전체 로그는 열어 볼 때만 읽어요. 할 일을 다룬 세션은 그 할 일에도 보여요. 이 Mac과 연결한 내 폰이나 iPad 말고는 이 Mac 밖으로 나가지 않아요. 설정 > 할 일에서 끌 수 있어요.',
  claudeOpen: (n, where) =>
    n === 0 ? '지금 열린 세션 없음' : `지금 ${n}개 열림: ${where}`,
  codexToday: (n) =>
    n === 0 ? '오늘 로그를 쓴 세션 없음' : `오늘 로그를 쓴 세션 ${n}개`,
  inWhere: {
    'claude-app': 'Claude 앱',
    terminal: '터미널',
    web: 'claude.ai',
    'codex-app': 'Codex 앱',
    pacenote: 'Pacenote',
  },
  notNow: '나중에',
  show: '내 세션 보기',
}

export const text: Record<Locale, typeof en> = { en, ko }
