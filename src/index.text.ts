import type { Locale } from './i18n/locale.js'

const en = {
  /** A problem under what was checked: the reasoner CLI or the sandbox */
  problem: (checked: 'reasoner' | 'sandbox', problem: string) =>
    `${checked === 'reasoner' ? 'Reasoner' : 'Sandbox'}: ${problem}`,
  diagramsOff: (problem: string) => `Diagram rendering disabled: ${problem}`,
  diagramsWait:
    'Diagrams stay as text until the built-in sandbox is set up for them (Settings > Sandbox).',
  /** What to do about a sign-in, found before any mention failed on it */
  atStartup: (advice: string) => `${advice} (checked at startup)`,
}

const ko: typeof en = {
  problem: (checked, problem) =>
    `${checked === 'reasoner' ? '답변 CLI' : '샌드박스'}: ${problem}`,
  diagramsOff: (problem) => `다이어그램 렌더링 꺼짐: ${problem}`,
  diagramsWait:
    '내장 샌드박스를 준비할 때까지 다이어그램은 텍스트로 남아요 (설정 > 샌드박스).',
  atStartup: (advice) => `${advice} (시작할 때 확인함)`,
}

export const text: Record<Locale, typeof en> = { en, ko }
