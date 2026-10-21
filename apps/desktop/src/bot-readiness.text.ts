import type { Locale } from '../../../src/i18n/locale.js'

/**
 * Why Pace cannot start yet (SetupProblem.message). Setup's review step finds
 * the step to fix by the words Slack, hub, token and member ID in them
 * (stepToFix in src/settings/setup.ts), so the Korean keeps 허브, 토큰 and
 * 멤버 ID.
 */
const en = {
  slackNotConnected:
    "Slack is not connected yet. In Settings > Messengers > Slack, connect to your team's hub or enter your own Slack app's tokens.",
  hubNotPaired:
    'This desktop is not paired with the team hub yet. Connect it in Settings > Messengers > Slack to start Pace.',
  sayWhoYouAre:
    'Say who you are: add your own Slack member ID in Settings > Messengers > Slack. Pace answers only you.',
  settingsToFix: 'Some settings need fixing before Pace can start.',
  hubRejected: (code: string) =>
    `The team hub no longer accepts this desktop (${code}). Connect it again in Settings > Messengers > Slack.`,
  slackRejected: (code: string) =>
    `Slack rejected the tokens (${code}). Check them with "Check connection" in Settings, then save to start Pace.`,
}

const ko: typeof en = {
  slackNotConnected:
    'Slack이 아직 연결되지 않았어요. 설정 > 메신저 > Slack에서 팀 허브에 연결하거나 직접 만든 Slack 앱의 토큰을 입력하세요.',
  hubNotPaired:
    '이 데스크톱이 아직 팀 허브와 페어링되지 않았어요. Pace를 시작하려면 설정 > 메신저 > Slack에서 연결하세요.',
  sayWhoYouAre:
    '내가 누구인지 알려 주세요. 설정 > 메신저 > Slack에 내 Slack 멤버 ID를 추가하세요. Pace는 나에게만 답해요.',
  settingsToFix: 'Pace를 시작하려면 고쳐야 할 설정이 있어요.',
  hubRejected: (code) =>
    `팀 허브가 더 이상 이 데스크톱을 받지 않아요(${code}). 설정 > 메신저 > Slack에서 다시 연결하세요.`,
  slackRejected: (code) =>
    `Slack이 토큰을 거부했어요(${code}). 설정의 "연결 확인"으로 확인한 뒤 저장하면 Pace가 시작돼요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
