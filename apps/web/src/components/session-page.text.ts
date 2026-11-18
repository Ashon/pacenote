import type { Locale } from '@src/i18n/locale'
import { josa } from '@src/i18n/korean'
import type { SessionAskKind, SessionMode } from '@src/sessions/types'

/** A session's page: its conversation, what it asks, and the composer */
const en = {
  notHere: 'This session is not on this Mac anymore.',
  backToSessions: 'Back to Sessions',
  more: 'More for this session',
  nothingSaid: 'Nothing said in it yet.',
  stoppedShort: (why: string) => `Its last turn stopped short: ${why}`,
  // What it asks
  askTitle: (kind: SessionAskKind, tool: string) =>
    ({
      command: 'Claude Code asks to run a command',
      edit: 'Claude Code asks to change a file',
      web: 'Claude Code asks to go online',
      plan: 'Claude Code has a plan for you',
      tool: `Claude Code asks to use ${tool}`,
    })[kind],
  askMeta: (folder: string, ago: string) => `In ${folder} · asked ${ago}`,
  allow: 'Allow',
  allowRule: (rule: string) => `Allow ${rule} in this session`,
  deny: 'Deny',
  goAhead: 'Go ahead',
  keepPlanning: 'Keep planning',
  // The composer
  placeholder: {
    idle: 'Reply to Claude Code',
    busy: 'Tell Claude Code what to do next. It reads it after this step.',
    ask: 'Or tell it what to do instead',
    resume: 'Continue this session here',
    copy: 'What should the copy do first?',
  },
  message: 'Message',
  send: 'Send',
  stop: 'Stop',
  endHere: 'End it here',
  modeLabel: 'How it asks before it acts',
  modes: {
    default: 'Ask before edits',
    acceptEdits: 'Edit without asking',
    plan: 'Plan first',
    auto: 'Auto',
  } satisfies Record<SessionMode, string>,
  foot: "Runs Claude Code on this Mac with your own sign-in. The conversation stays in Claude Code's own log: claude --resume picks it up anywhere.",
  /** From your phone or iPad */
  footOn: (mac: string) =>
    `Claude Code runs on ${mac}, with your own sign-in there.`,
  // Open somewhere else
  elseTitle: (where: string) => `It is open in ${where}, so you type there`,
  elseLead:
    'Pacenote shows it as it goes. Two places typing into one session would tangle it, so you type here once it is closed there.',
  copyHere: 'Continue in a copy here',
  copyLead:
    'The copy starts from this conversation and runs here; the session open there goes on as it is.',
  // Resting in the Claude app or a terminal: it moves here as you send
  moveFromApp: (where: string) =>
    `It is open in ${where}. What you send continues it here; type in the app again and it goes on there, in the same conversation.`,
  moveFromTerminal: (where: string) =>
    `It is open in ${where}. What you send continues it here and closes it there; claude --resume opens it there again, in the same conversation.`,
  // On a turn there
  busyThereTitle: (where: string) => `It is working in ${where}`,
  busyThereLead:
    'Pacenote shows it as it goes. Once its turn there is done, you continue it here, in the same conversation.',
  cancel: 'Cancel',
  codexTitle: 'Codex runs it, so you continue it there',
  codexLead: 'Pacenote shows its log as it goes.',
}

const ko: typeof en = {
  notHere: '이 세션은 이제 이 Mac에 없어요.',
  backToSessions: '세션으로 돌아가기',
  more: '세션 더 보기',
  nothingSaid: '아직 나눈 말이 없어요.',
  stoppedShort: (why) => `지난 턴이 중간에 멈췄어요: ${why}`,
  askTitle: (kind, tool) =>
    ({
      command: 'Claude Code가 명령을 실행해도 되는지 물어요',
      edit: 'Claude Code가 파일을 바꿔도 되는지 물어요',
      web: 'Claude Code가 인터넷에 접속해도 되는지 물어요',
      plan: 'Claude Code가 계획을 세웠어요',
      tool: `Claude Code가 ${josa(tool, '을/를')} 써도 되는지 물어요`,
    })[kind],
  askMeta: (folder, ago) => `${folder} · ${ago} 물음`,
  allow: '허용',
  allowRule: (rule) => `이 세션에서 ${rule} 계속 허용`,
  deny: '거절',
  goAhead: '진행',
  keepPlanning: '계속 계획',
  placeholder: {
    idle: 'Claude Code에게 답하기',
    busy: 'Claude Code에게 다음에 할 일을 말하세요. 지금 단계가 끝나면 읽어요.',
    ask: '아니면 대신 할 일을 말하세요',
    resume: '이 세션을 여기서 이어 가기',
    copy: '복사본이 먼저 할 일은?',
  },
  message: '메시지',
  send: '보내기',
  stop: '멈추기',
  endHere: '여기서 끝내기',
  modeLabel: '실행 전에 묻는 방식',
  modes: {
    default: '바꾸기 전에 묻기',
    acceptEdits: '묻지 않고 바꾸기',
    plan: '먼저 계획',
    auto: '자동',
  },
  foot: '이 Mac의 Claude Code를 내 로그인으로 실행해요. 대화는 Claude Code의 로그에 남아서 claude --resume으로 어디서든 이어 갈 수 있어요.',
  footOn: (mac) => `${mac}에서 그 Mac의 내 로그인으로 Claude Code가 실행돼요.`,
  elseTitle: (where) => `${where}에 열려 있어서 그곳에서 입력해요`,
  elseLead:
    'Pacenote는 진행되는 대로 보여 줘요. 한 세션에 두 곳에서 입력하면 엉키기 때문에, 그곳에서 닫으면 여기서 입력할 수 있어요.',
  copyHere: '여기서 복사본으로 잇기',
  copyLead:
    '복사본은 이 대화에서 시작해 여기서 돌아요. 그곳에 열린 세션은 그대로 이어져요.',
  moveFromApp: (where) =>
    `${where}에 열려 있어요. 여기서 보내면 여기서 이어지고, 앱에서 다시 입력하면 그곳에서 이어져요. 대화는 하나로 이어져요.`,
  moveFromTerminal: (where) =>
    `${where}에 열려 있어요. 여기서 보내면 여기서 이어지고 그곳의 Claude Code는 닫혀요. claude --resume으로 다시 열어도 같은 대화예요.`,
  busyThereTitle: (where) => `${where}에서 일하는 중이에요`,
  busyThereLead:
    'Pacenote는 진행되는 대로 보여 줘요. 그곳의 턴이 끝나면 같은 대화로 여기서 이어 가세요.',
  cancel: '취소',
  codexTitle: 'Codex가 돌리고 있어서 그곳에서 이어 가요',
  codexLead: 'Pacenote는 로그를 진행되는 대로 보여 줘요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
