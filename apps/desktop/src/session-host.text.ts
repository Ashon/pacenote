import { josa } from '../../../src/i18n/korean.js'
import type { Locale } from '../../../src/i18n/locale.js'
import type { SessionAskKind } from '../../../src/sessions/types.js'

/**
 * A session Pacenote runs: the notifications when it asks and when its turn
 * is done, out of sight, and the question before Pacenote quits on a turn
 */
const en = {
  asks: (kind: SessionAskKind, tool: string, by = 'Claude Code') =>
    ({
      command: `${by} asks to run a command`,
      edit: `${by} asks to change a file`,
      web: `${by} asks to go online`,
      plan: `${by} has a plan for you`,
      tool: `${by} asks to use ${tool}`,
    })[kind],
  inFolder: (what: string, folder: string) => `${what} · in ${folder}`,
  done: (by = 'Claude Code') => `${by} is done`,
  /** When Claude Code did not say what its turn did */
  doneTurn: 'Its turn is done',
  quitTitle: (count: number) =>
    count === 1
      ? 'A session Pacenote runs is working.'
      : `${count} sessions Pacenote runs are working.`,
  quitDetail:
    "Quitting stops the turn it is on. The conversation stays in its tool's own log, to continue here or anywhere later.",
  quit: 'Quit',
  cancel: 'Cancel',
}

const ko: typeof en = {
  asks: (kind, tool, by = 'Claude Code') =>
    ({
      command: `${josa(by, '이/가')} 명령을 실행해도 되는지 물어요`,
      edit: `${josa(by, '이/가')} 파일을 바꿔도 되는지 물어요`,
      web: `${josa(by, '이/가')} 인터넷에 접속해도 되는지 물어요`,
      plan: `${josa(by, '이/가')} 계획을 세웠어요`,
      tool: `${josa(by, '이/가')} ${josa(tool, '을/를')} 써도 되는지 물어요`,
    })[kind],
  inFolder: (what, folder) => `${what} · ${folder}에서`,
  done: (by = 'Claude Code') => `${josa(by, '이/가')} 끝냈어요`,
  doneTurn: '이번 턴을 마쳤어요',
  quitTitle: (count) =>
    count === 1
      ? 'Pacenote가 돌리는 세션이 일하고 있어요.'
      : `Pacenote가 돌리는 세션 ${count}개가 일하고 있어요.`,
  quitDetail:
    '끝내면 진행 중인 턴이 멈춰요. 대화는 그 도구의 로그에 남아 있어 나중에 여기서든 어디서든 이어 갈 수 있어요.',
  quit: '끝내기',
  cancel: '취소',
}

export const text: Record<Locale, typeof en> = { en, ko }
