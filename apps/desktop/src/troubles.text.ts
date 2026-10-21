import type { Locale } from '../../../src/i18n/locale.js'

/** The notifications about Pace, and the menu bar's lines about it */
const en = {
  stopped: 'Pace stopped',
  startsAgain: 'Pacenote starts it again.',
  needsSetup: 'Pace needs setup',
  settingsToFix: 'Some settings need fixing.',
  lostSlack: 'Pace lost its connection to Slack',
  mentionsWait: 'New mentions wait until it reconnects.',
  needsAttention: 'Pace needs attention',
}

const ko: typeof en = {
  stopped: 'Pace가 멈췄어요',
  startsAgain: 'Pacenote가 다시 시작해요.',
  needsSetup: 'Pace 설정이 필요해요',
  settingsToFix: '고쳐야 할 설정이 있어요.',
  lostSlack: 'Pace의 Slack 연결이 끊겼어요',
  mentionsWait: '다시 연결될 때까지 새 멘션은 기다려요.',
  needsAttention: 'Pace를 확인해 주세요',
}

export const text: Record<Locale, typeof en> = { en, ko }
