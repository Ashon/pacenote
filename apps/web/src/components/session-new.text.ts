import type { Locale } from '@src/i18n/locale'
import { josa } from '@src/i18n/korean'

/** A new session Pacenote runs (V5): where, and its first message */
const en = {
  title: 'New session',
  fromTask: (repo?: string) =>
    repo ? `From your tasks · ${repo}` : 'From your tasks',
  lead: (by = 'Claude Code') => `${by} runs it here, in the folder you choose.`,
  /** From your phone or iPad: the Mac it runs on */
  leadOn: (mac: string, by = 'Claude Code') =>
    `${by} runs it on ${mac}, in the folder you choose.`,
  runIn: 'Runs in',
  here: (by = 'Claude Code') => `${by}, here in Pacenote`,
  /** After the choice of Claude Code or Codex (Z1) */
  hereInPacenote: 'here in Pacenote',
  /** After the choice, from your phone or iPad */
  onMac: (mac: string) => `on ${mac}`,
  /** From your phone or iPad: the Mac it runs on */
  hereOn: (mac: string, by = 'Claude Code') => `${by}, on ${mac}`,
  /** Why Codex cannot run a session here, beside the choice */
  codexWhy: {
    missing: 'Codex is not on this Mac.',
    signedOut: 'Sign in to Codex first: codex login.',
    old: 'Codex runs sessions here from 0.163 on. Update it first.',
  },
  folder: 'Folder',
  noFolder: 'No folder yet',
  change: 'Change',
  choose: 'Choose a folder',
  useFolder: 'Use this folder',
  message: 'First message',
  placeholder: (by = 'Claude Code') => `What should ${by} do first?`,
  start: 'Start',
  keys: '⌘↩ starts it',
  notOpen: 'This task is not open anymore.',
  backToTodo: 'Back to Todo',
  off: 'Sessions on this Mac is off',
  offLead: 'Pacenote runs sessions on their page once it lists them.',
  turnOn: 'Turn on Sessions',
}

const ko: typeof en = {
  title: '새 세션',
  fromTask: (repo) => (repo ? `할 일에서 · ${repo}` : '할 일에서'),
  lead: (by = 'Claude Code') =>
    `선택한 폴더에서 ${josa(by, '이/가')} 여기서 실행돼요.`,
  leadOn: (mac, by = 'Claude Code') =>
    `${josa(by, '이/가')} ${mac}의 선택한 폴더에서 실행돼요.`,
  runIn: '실행',
  here: (by = 'Claude Code') => `${by}, 여기 Pacenote에서`,
  hereInPacenote: '여기 Pacenote에서',
  onMac: (mac) => `${mac}에서`,
  hereOn: (mac, by = 'Claude Code') => `${by}, ${mac}에서`,
  codexWhy: {
    missing: '이 Mac에 Codex가 없어요.',
    signedOut: '먼저 Codex에 로그인하세요: codex login',
    old: 'Codex 0.163부터 여기서 세션을 돌려요. 먼저 업데이트하세요.',
  },
  folder: '폴더',
  noFolder: '아직 폴더가 없어요',
  change: '바꾸기',
  choose: '폴더 선택',
  useFolder: '이 폴더 쓰기',
  message: '첫 메시지',
  placeholder: (by = 'Claude Code') =>
    `${josa(by, '이/가')} 먼저 할 일을 적으세요`,
  start: '시작',
  keys: '⌘↩로 시작',
  notOpen: '이 할 일은 이제 열려 있지 않아요.',
  backToTodo: '할 일로 돌아가기',
  off: '이 Mac의 세션이 꺼져 있어요',
  offLead: '세션 목록을 켜면 Pacenote가 세션을 그 페이지에서 돌려요.',
  turnOn: '세션 켜기',
}

export const text: Record<Locale, typeof en> = { en, ko }
