import { josa } from '../i18n/korean.js'
import type { Locale } from '../i18n/locale.js'
import type { ReasonerId } from './ids.js'

const en = {
  notInstalled: (backend: ReasonerId) =>
    `${backend} is not installed on this Mac, or not on its PATH: install ${backend === 'claude' ? 'Claude Code' : 'the Codex CLI'} and sign in, or choose the other reasoner in Settings > Answers.`,
  versionFailed: (backend: ReasonerId, reason: string) =>
    `${backend} --version failed: ${reason}`,
  codexTooOld: (version: string, min: string) =>
    `codex ${version} is too old: Pace needs ${min} or later, which keeps codex to the reference directory. Update codex (npm install -g @openai/codex, or brew upgrade codex).`,
  notSignedIn: (backend: ReasonerId) =>
    `${backend} is not signed in on this Mac: ${backend === 'claude' ? 'run claude in Terminal and sign in with /login' : 'run codex login in Terminal'}.`,
}

const ko: typeof en = {
  notInstalled: (backend) =>
    `이 Mac에 ${josa(backend, '이/가')} 설치되어 있지 않거나 PATH에 없어요. ${josa(backend === 'claude' ? 'Claude Code' : 'Codex CLI', '을/를')} 설치하고 로그인하거나, 설정 > 답변에서 다른 답변 CLI를 고르세요.`,
  versionFailed: (backend, reason) =>
    `${backend} --version을 실행하지 못했어요: ${reason}`,
  codexTooOld: (version, min) =>
    `${josa(`codex ${version}`, '은/는')} 너무 오래된 버전이에요. Pace에는 codex를 참고 디렉터리 안에 묶어 두는 ${min} 이상이 필요해요. codex를 업데이트하세요 (npm install -g @openai/codex 또는 brew upgrade codex).`,
  notSignedIn: (backend) =>
    backend === 'claude'
      ? '이 Mac에서 claude에 로그인되어 있지 않아요. 터미널에서 claude를 실행하고 /login으로 로그인하세요.'
      : '이 Mac에서 codex에 로그인되어 있지 않아요. 터미널에서 codex login을 실행하세요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
