import { josa } from '../../i18n/korean.js'
import type { Locale } from '../../i18n/locale.js'

const en = {
  tokens: 'Tokens',
  bothTokens: 'Both the bot token and the app token are required.',
  botToken: 'Bot token',
  botScopes: 'Bot scopes',
  missingScopes: (scopes: readonly string[]) => `Missing: ${scopes.join(', ')}`,
  missingOptional: (scopes: readonly string[]) =>
    `Missing ${scopes.join(', ')}: only the asker sees that Pace is working or failed, instead of 👀 and ⚠️ on their mention. Add it from the manifest and reinstall the app.`,
  sameApp: 'Same app',
  /** The app each token belongs to: "?" when it cannot tell */
  appIds: (bot: string, appToken: string) =>
    `bot=${bot}, app token=${appToken}`,
  socketMode: 'Socket Mode',
  urlIssued: 'Connection URL issued (not connected)',
}

const ko: typeof en = {
  tokens: '토큰',
  bothTokens: '봇 토큰과 앱 토큰이 모두 필요해요.',
  botToken: '봇 토큰',
  botScopes: '봇 스코프',
  missingScopes: (scopes) => `빠진 스코프: ${scopes.join(', ')}`,
  missingOptional: (scopes) =>
    `${josa(scopes.join(', '), '이/가')} 없어요. 멘션에 👀와 ⚠️를 다는 대신, Pace가 작업 중이거나 실패했다는 것을 요청한 사람만 볼 수 있어요. 매니페스트에서 추가하고 앱을 다시 설치하세요.`,
  sameApp: '같은 앱',
  appIds: (bot, appToken) => `봇=${bot}, 앱 토큰=${appToken}`,
  socketMode: 'Socket Mode',
  urlIssued: '연결 URL을 받았어요 (연결하지는 않았어요)',
}

export const text: Record<Locale, typeof en> = { en, ko }
