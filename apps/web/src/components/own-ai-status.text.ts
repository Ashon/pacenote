import type { Unable } from '@src/tasks/own-ai'
import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'

/** Why a CLI could not, as a switch line reads it: "at its usage limit" */
const UNABLE_EN: Record<Unable, string> = {
  limit: 'at its usage limit',
  unavailable: 'unavailable',
  auth: 'signed out',
  missing: 'not on this Mac',
  connector: 'without its Slack connector',
}

const UNABLE_KO: Record<Unable, string> = {
  limit: '사용 한도 도달',
  unavailable: '사용할 수 없음',
  auth: '로그아웃됨',
  missing: '이 Mac에 없음',
  connector: 'Slack 커넥터 없음',
}

const en = {
  /** "Claude Code was at its usage limit until 14:00" */
  switched: (cli: string, unable: Unable, until?: string) =>
    `${cli} was ${UNABLE_EN[unable]}${until ? ` until ${until}` : ''}`,
  notHere: 'Not on this Mac.',
  tooOld: 'Too old. Update it to use it here.',
  signedOut: 'Signed out.',
  /** next: the CLI that does the work meanwhile, when this one is chosen */
  resting: (unavailable: boolean, until: string, next?: string) =>
    `${unavailable ? 'Unavailable' : 'At its usage limit'} until ${until}.${next ? ` ${next} does the work until then.` : ''}`,
  onlyWhenChosen: 'Used only when chosen.',
  opencodeReady: (next: string) =>
    `Ready. Looks done and Write it up run here; Collect now and drafts go to ${next}, as it reads no Slack yet.`,
  opencodeAlone:
    "Ready. Looks done and Write it up run here; Collect now and drafts need Claude Code or Codex, and switching when it can't is off.",
  noConnector: (where: string) =>
    `Has no Slack connector. Connect Slack in ${where}.`,
  doesTheWork: 'Ready. It does the work.',
  takesOver: (chosen: string) => `Ready to take over when ${chosen} can't.`,
  notUsed: "Not used: switching when it can't is off.",
  intro: "Each runs on this Mac, with your own login or opencode's config.",
  checkAgain: 'Check again',
  checking: 'Checking Claude Code, Codex and opencode…',
  signIn: 'Sign in',
}

const ko: typeof en = {
  switched: (cli, unable, until) =>
    `${cli} ${UNABLE_KO[unable]}${until ? ` (${until}까지)` : ''}`,
  notHere: '이 Mac에 없어요.',
  tooOld: '버전이 너무 오래됐어요. 여기서 쓰려면 업데이트하세요.',
  signedOut: '로그아웃됐어요.',
  resting: (unavailable, until, next) =>
    `${until}까지 ${unavailable ? '사용할 수 없어요' : '사용 한도에 걸려 있어요'}.${next ? ` 그때까지 ${josa(next, '이/가')} 작업해요.` : ''}`,
  onlyWhenChosen: '선택했을 때만 써요.',
  opencodeReady: (next) =>
    `준비됐어요. 끝난 것 같음과 정리하기는 여기서 실행돼요. opencode는 아직 Slack을 읽지 못해서 지금 모으기와 초안은 ${next}에서 해요.`,
  opencodeAlone:
    '준비됐어요. 끝난 것 같음과 정리하기는 여기서 실행돼요. 지금 모으기와 초안에는 Claude Code나 Codex가 필요한데, 안 될 때 전환하기가 꺼져 있어요.',
  noConnector: (where) =>
    `Slack 커넥터가 없어요. ${where}에서 Slack을 연결하세요.`,
  doesTheWork: '준비됐어요. 이 CLI가 작업해요.',
  takesOver: (chosen) =>
    `${josa(chosen, '이/가')} 못 할 때 이어받을 준비가 됐어요.`,
  notUsed: '쓰지 않아요. 안 될 때 전환하기가 꺼져 있어요.',
  intro: '모두 이 Mac에서 내 로그인이나 opencode 설정으로 실행돼요.',
  checkAgain: '다시 확인',
  checking: 'Claude Code, Codex, opencode 확인 중…',
  signIn: '로그인',
}

export const text: Record<Locale, typeof en> = { en, ko }
