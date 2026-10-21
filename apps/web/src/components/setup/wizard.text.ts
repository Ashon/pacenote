import type { Locale } from '@src/i18n/locale'

const en = {
  title: 'Set up Pace',
  stepsLabel: 'Setup steps',
  preparingLabel: 'Preparing the built-in sandbox',
  preparing: 'Preparing',
  preparingStopped: 'Preparing stopped',
  finishLater: 'Finish later',
  saved: 'Your choices are saved. Pick up from Overview.',
}

const ko: typeof en = {
  title: 'Pace 초기 설정',
  stepsLabel: '초기 설정 단계',
  preparingLabel: '내장 샌드박스 준비 중',
  preparing: '준비 중',
  preparingStopped: '준비 중지됨',
  finishLater: '나중에 마치기',
  saved: '고른 내용은 저장돼요. 개요에서 이어서 하세요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
