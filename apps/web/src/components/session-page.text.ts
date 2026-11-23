import type { Locale } from '@src/i18n/locale'
import { josa } from '@src/i18n/korean'
import type { SessionAskKind, SessionMode } from '@src/sessions/types'

/** A session's page: its conversation, what it asks, and the composer */
const en = {
  notHere: 'This session is not on this Mac anymore.',
  notOnOtherMac:
    'This session is not on your other Mac anymore, or that Mac is out of reach.',
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
  // Images with a message
  attachImage: 'Add images',
  attachHint: 'Add images. You can also paste them or drop them here.',
  attached: (count: number) =>
    count === 1 ? 'An image goes with it' : `${count} images go with it`,
  image: 'Image',
  removeImage: (name: string) => (name ? `Remove ${name}` : 'Remove the image'),
  imageKind: 'Only PNG, JPEG, GIF or WebP images go with a message.',
  imageSize: 'That image stays over 1 MB even made smaller.',
  tooManyImages: (most: number) => `Up to ${most} images go with one message.`,
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
  // Resting there with work in the background, which would stop if it moved
  backgroundThereTitle: (where: string) =>
    `It runs work in the background in ${where}`,
  backgroundThereLead:
    'Moving it here would stop that work. Once it is done, you continue it here, in the same conversation.',
  cancel: 'Cancel',
  /** On another of your Macs: read from there */
  otherMacTitle: (mac: string) => `It is on ${mac}, so you type there`,
  otherMacLead:
    'Pacenote shows it as it goes, read from that Mac each time. What it asks is answered there too.',
  codexTitle: 'Codex runs it, so you continue it there',
  codexLead: 'Pacenote shows its log as it goes.',
  // Below the conversation
  latest: 'Latest',
  plan: 'Plan',
  planDone: (done: number, total: number) => `${done} of ${total} done`,
  context: (model: string, percent: number) =>
    model ? `${model} · ${percent}%` : `${percent}%`,
  contextNote: (percent: number) =>
    `The conversation takes ${percent}% of the model's context. Claude Code summarizes what came before as it fills.`,
}

const ko: typeof en = {
  notHere: '이 세션은 이제 이 Mac에 없어요.',
  notOnOtherMac: '이 세션이 이제 다른 Mac에 없거나, 그 Mac에 닿지 않아요.',
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
  attachImage: '이미지 추가',
  attachHint: '이미지를 추가해요. 붙여 넣거나 여기에 끌어다 놓아도 돼요.',
  attached: (count) => `이미지 ${count}장을 함께 보내요`,
  image: '이미지',
  removeImage: (name) => (name ? `${name} 빼기` : '이미지 빼기'),
  imageKind: 'PNG, JPEG, GIF, WebP 이미지만 함께 보낼 수 있어요.',
  imageSize: '이 이미지는 줄여도 1MB가 넘어요.',
  tooManyImages: (most) => `한 메시지에 이미지는 ${most}장까지 보낼 수 있어요.`,
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
  backgroundThereTitle: (where) => `${where}에서 백그라운드 작업이 돌고 있어요`,
  backgroundThereLead:
    '여기로 옮기면 그 작업이 멈춰요. 작업이 끝나면 같은 대화로 여기서 이어 가세요.',
  cancel: '취소',
  otherMacTitle: (mac) => `${mac}에 있는 세션이라 그곳에서 입력해요`,
  otherMacLead:
    'Pacenote가 그 Mac에서 그때그때 읽어 진행을 보여 줘요. 세션이 묻는 것도 그곳에서 답해요.',
  codexTitle: 'Codex가 돌리고 있어서 그곳에서 이어 가요',
  codexLead: 'Pacenote는 로그를 진행되는 대로 보여 줘요.',
  latest: '최신으로',
  plan: '계획',
  planDone: (done, total) => `${total}개 중 ${done}개 완료`,
  context: (model, percent) =>
    model ? `${model} · ${percent}%` : `${percent}%`,
  contextNote: (percent) =>
    `대화가 모델 컨텍스트의 ${percent}%를 쓰고 있어요. 차면 Claude Code가 앞의 대화를 요약해요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
