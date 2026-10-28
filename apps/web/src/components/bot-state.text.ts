import type { Locale } from '@src/i18n/locale'

/** Pace's state in a word, as the status bar and the Pace screen say it */
const en = {
  building: 'Building',
  stopping: 'Stopping',
  setup: 'Setup needed',
  failed: 'Failed to start',
  crashed: 'Crashed',
  starting: 'Starting',
  stopped: 'Stopped',
  /** Pace turned off: Pacenote for Todo alone */
  off: 'Off',
  standingBy: 'Standing by',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
}

const ko: typeof en = {
  building: '빌드 중',
  stopping: '중지 중',
  setup: '설정 필요',
  failed: '시작 실패',
  crashed: '비정상 종료',
  starting: '시작 중',
  stopped: '중지됨',
  off: '꺼짐',
  standingBy: '대기 중',
  connected: '연결됨',
  reconnecting: '다시 연결 중',
  disconnected: '연결 끊김',
}

/** One of Pace's states, by its name in text */
export type BotStateName = keyof typeof en

export const text: Record<Locale, typeof en> = { en, ko }
