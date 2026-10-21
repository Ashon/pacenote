import type { Locale } from '@src/i18n/locale'

const en = {
  noAppYet: 'No Slack app yet?',
  opensWith:
    "Slack opens with Pacenote's manifest filled in: choose your workspace and create the app.",
  create: 'Create the Slack app',
  appToken:
    'Basic Information > App-Level Tokens: generate a token with the connections:write scope. That is the App token.',
  botToken:
    'Install App: install it to your workspace and copy the Bot User OAuth Token. That is the Bot token.',
  memberId:
    'Add your Slack member ID under Who can ask, save, and invite Pace to a public channel with /invite @Pace.',
}

const ko: typeof en = {
  noAppYet: '아직 Slack 앱이 없나요?',
  opensWith:
    'Pacenote 매니페스트가 채워진 Slack이 열려요. 워크스페이스를 고르고 앱을 만드세요.',
  create: 'Slack 앱 만들기',
  appToken:
    'Basic Information > App-Level Tokens: connections:write 범위로 토큰을 생성하세요. 이것이 앱 토큰이에요.',
  botToken:
    'Install App: 워크스페이스에 설치하고 Bot User OAuth Token을 복사하세요. 이것이 봇 토큰이에요.',
  memberId:
    '물어볼 수 있는 사람에 내 Slack 멤버 ID를 넣고 저장한 뒤, /invite @Pace로 Pace를 공개 채널에 초대하세요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
