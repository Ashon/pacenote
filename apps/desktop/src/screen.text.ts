import type { Locale } from '../../../src/i18n/locale.js'
import { josa } from '../../../src/i18n/korean.js'

/** What the window says while its screen will not load (screen.ts) */
const en = {
  heading: 'The screen did not load',
  body: (app: string) =>
    `${app} is still running in the menu bar, and tries again on its own. This can happen for a moment while an update replaces the app.`,
  tryAgain: 'Try again',
  stillFailing: (app: string) =>
    `If it keeps happening, quit ${app} and open it again, or reinstall it (brew reinstall --cask pacenote).`,
}

const ko: typeof en = {
  heading: '화면을 불러오지 못했어요',
  body: (app) =>
    `${josa(app, '은/는')} 메뉴 막대에서 계속 실행 중이고, 알아서 다시 시도해요. 업데이트가 앱을 바꾸는 동안 잠깐 이럴 수 있어요.`,
  tryAgain: '다시 시도',
  stillFailing: (app) =>
    `계속 이러면 ${josa(app, '을/를')} 종료했다가 다시 열거나, 다시 설치하세요 (brew reinstall --cask pacenote).`,
}

export const text: Record<Locale, typeof en> = { en, ko }
