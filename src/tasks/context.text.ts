import type { Locale } from '../i18n/locale.js'

const en = {
  // How a task ended, or where it stands
  /** Closed by an AI tool, or done with a session in one */
  doneIn: (tool: string) => `Done in ${tool}`,
  done: 'Done',
  replied: 'You replied in the thread',
  checked: 'Marked with a check',
  settled: 'Settled in Slack',
  dismissed: 'Dismissed',
  /** Dismissed as done already: your work, done elsewhere */
  doneAlready: 'Done already',
  workedIn: (tool: string) => `Worked on in ${tool}`,
}

const ko: typeof en = {
  doneIn: (tool) => `${tool}에서 완료`,
  done: '완료',
  replied: '스레드에 답장함',
  checked: '체크 표시됨',
  settled: 'Slack에서 해결됨',
  dismissed: '제외됨',
  doneAlready: '이미 끝남',
  workedIn: (tool) => `${tool}에서 작업함`,
}

export const text: Record<Locale, typeof en> = { en, ko }
