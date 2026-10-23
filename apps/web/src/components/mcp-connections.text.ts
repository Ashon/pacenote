import type { Locale } from '@src/i18n/locale'

const en = {
  checkAgain: 'Check again',
  checking: 'Checking Claude Code, Codex and opencode…',
  /** The change a tool's state calls for */
  action: {
    absent: 'Add',
    elsewhere: 'Use this app',
    failed: 'Add again',
    connected: 'Remove',
  },
  missing: 'Not installed on this Mac.',
  absent: 'Pacenote is not added yet.',
  elsewhere: 'Added, but it runs another Pacenote:',
  connectedTools: (n: number) => `Connected: ${n} tools.`,
  connected: 'Connected.',
  failed: 'Added, but it does not reach Pacenote.',
  notBuilt: 'The server is not built yet: run pnpm bundle in the repository.',
  byHand: 'Add it by hand',
  claudeByHand: 'Claude Code: run in a terminal',
  codexByHand: 'Codex: add to ~/.codex/config.toml',
  opencodeByHand: 'opencode: run in a terminal',
}

const ko: typeof en = {
  checkAgain: '다시 확인',
  checking: 'Claude Code, Codex, opencode 확인 중…',
  action: {
    absent: '추가',
    elsewhere: '이 앱 사용',
    failed: '다시 추가',
    connected: '제거',
  },
  missing: '이 Mac에 설치되어 있지 않아요.',
  absent: '아직 Pacenote를 추가하지 않았어요.',
  elsewhere: '추가됐지만 다른 Pacenote를 실행해요:',
  connectedTools: (n) => `연결됐어요. 도구 ${n}개를 쓸 수 있어요.`,
  connected: '연결됐어요.',
  failed: '추가됐지만 Pacenote에 연결되지 않아요.',
  notBuilt:
    '서버가 아직 빌드되지 않았어요. 저장소에서 pnpm bundle을 실행하세요.',
  byHand: '직접 추가하기',
  claudeByHand: 'Claude Code: 터미널에서 실행',
  codexByHand: 'Codex: ~/.codex/config.toml에 추가',
  opencodeByHand: 'opencode: 터미널에서 실행',
}

export const text: Record<Locale, typeof en> = { en, ko }
