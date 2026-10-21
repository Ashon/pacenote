import type { Locale } from '@src/i18n/locale'
import type { SetupStep } from '@src/settings/setup'

const en: {
  steps: Record<SetupStep, string>
  next: Record<SetupStep, string>
} = {
  /** What each step is called, in the list and in "Change ..." */
  steps: {
    ai: 'AI service',
    runtime: 'Where it runs',
    slack: 'Slack',
    review: 'Review',
    answer: 'First answer',
  },
  /** "Next: ..." on the resume card, for the step it stopped before */
  next: {
    ai: 'choose the AI service Pace answers with',
    runtime: 'choose where Pace works out answers',
    slack: 'connect Slack',
    review: 'review and start Pace',
    answer: 'say hello to Pace in Slack',
  },
}

const ko: typeof en = {
  steps: {
    ai: 'AI 서비스',
    runtime: '실행 환경',
    slack: 'Slack',
    review: '확인',
    answer: '첫 답변',
  },
  next: {
    ai: 'Pace가 답변에 쓸 AI 서비스 고르기',
    runtime: 'Pace가 답변을 만들 곳 고르기',
    slack: 'Slack 연결',
    review: '확인하고 Pace 시작',
    answer: 'Slack에서 Pace에게 인사하기',
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
