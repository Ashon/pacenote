import type { Locale } from '@src/i18n/locale'

const en = {
  title: 'This screen stopped working',
  body: "Pace keeps answering. Reload to try again, or go back to Overview. What broke is in the app's log: Pace > Open logs folder.",
  reload: 'Reload',
  back: 'Back to Overview',
}

const ko: typeof en = {
  title: '이 화면이 멈췄어요',
  body: 'Pace는 계속 답변해요. 새로고침해서 다시 시도하거나 개요로 돌아가세요. 무엇이 잘못됐는지는 앱 로그에 있어요: Pace > 로그 폴더 열기.',
  reload: '새로고침',
  back: '개요로 돌아가기',
}

export const text: Record<Locale, typeof en> = { en, ko }
