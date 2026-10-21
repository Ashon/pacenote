import type { Locale } from '@src/i18n/locale'

const en = {
  showLabels: 'Show sidebar labels',
  hideLabels: 'Hide sidebar labels',
  /** The toggle's tooltip, with its shortcut: Hide sidebar labels (⌘B) */
  withKey: (label: string, key: string) => `${label} (${key})`,
  tooNarrow: 'The window is too narrow for labels',
  /** Back to the run list, when the window shows one pane at a time */
  runs: 'Runs',
  resizeRunList: 'Resize run list',
  pickRun:
    'Pick a run to see what it did: what Pace was asked and how it answered, or what a collection found.',
}

const ko: typeof en = {
  showLabels: '사이드바 이름 보기',
  hideLabels: '사이드바 이름 가리기',
  withKey: (label, key) => `${label} (${key})`,
  tooNarrow: '창이 좁아서 이름을 보여 줄 수 없어요',
  runs: '실행 기록',
  resizeRunList: '실행 목록 너비 조절',
  pickRun:
    '실행을 고르면 무엇을 했는지 볼 수 있어요. Pace가 받은 요청과 답변, 또는 할 일 모으기가 찾은 것을 보여 줘요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
