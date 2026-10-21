import type { Locale } from '../../../src/i18n/locale.js'

/** Why Claude Code or Codex does not reach Pacenote's MCP server */
const en = {
  claudeCouldNot: 'Claude Code could not connect to it.',
  codexUnreadable: 'Could not read what Codex has.',
  codexOff: 'It is turned off in ~/.codex/config.toml (enabled = false).',
  notBuilt: 'The server is not built yet: run pnpm bundle in the repository.',
  exited: (code: number | null) => `Exited with code ${code}`,
  noAnswer: (seconds: number) =>
    `The server did not answer in ${seconds} seconds.`,
  serverExited: (code: number | null) => `The server exited with code ${code}.`,
  refused: 'The server refused.',
}

const ko: typeof en = {
  claudeCouldNot: 'Claude Code가 서버에 연결하지 못했어요.',
  codexUnreadable: 'Codex에 등록된 내용을 읽을 수 없어요.',
  codexOff: '~/.codex/config.toml에서 꺼져 있어요(enabled = false).',
  notBuilt:
    '서버가 아직 빌드되지 않았어요. 저장소에서 pnpm bundle을 실행하세요.',
  exited: (code) => `종료 코드 ${code}`,
  noAnswer: (seconds) => `서버가 ${seconds}초 안에 응답하지 않았어요.`,
  serverExited: (code) => `서버가 종료됐어요(코드 ${code}).`,
  refused: '서버가 거부했어요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
