import type { Locale } from '../i18n/locale.js'

const en = {
  alreadyRunning: (pid: number, desktop: boolean) =>
    `Pace is already running (pid ${pid}, ${desktop ? 'desktop app' : 'terminal'}). ` +
    'Running two with the same app token makes Slack split events between them, so only one runs.',
}

const ko: typeof en = {
  alreadyRunning: (pid, desktop) =>
    `Pace가 이미 실행 중이에요 (pid ${pid}, ${desktop ? '데스크톱 앱' : '터미널'}). ` +
    '같은 앱 토큰으로 두 개를 실행하면 Slack이 이벤트를 둘로 나눠 보내기 때문에 하나만 실행해요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
