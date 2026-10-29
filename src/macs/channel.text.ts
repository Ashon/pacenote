import type { Locale } from '../i18n/locale.js'

const en = {
  // Why a handshake with another Mac did not go through
  noAnswer: 'The other Mac did not answer in time.',
  closed: 'The other Mac closed the connection.',
  unexpected: 'The other Mac said something unexpected.',
  otherApp: 'The other Mac runs Pace with another Slack app.',
  thisMac: 'That is this Mac.',
  removed: 'This device was removed from your Macs. Pair it again.',
  notWaiting:
    'The other Mac is not waiting for a new Mac. Click Add a Mac there.',
}

const ko: typeof en = {
  noAnswer: '다른 Mac이 제시간에 응답하지 않았어요.',
  closed: '다른 Mac이 연결을 닫았어요.',
  unexpected: '다른 Mac에서 예상하지 못한 응답이 왔어요.',
  otherApp: '다른 Mac은 다른 Slack 앱으로 Pace를 실행하고 있어요.',
  thisMac: '이 Mac이에요.',
  removed: '이 기기는 Mac에서 제거됐어요. 다시 페어링하세요.',
  notWaiting:
    '다른 Mac이 새 Mac을 기다리고 있지 않아요. 그 Mac에서 Mac 추가를 클릭하세요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
