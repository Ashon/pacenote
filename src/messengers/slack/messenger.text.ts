import type { Locale } from '../../i18n/locale.js'

const en = {
  /** Told to the asker in Slack, in Pace's notes language */
  publicOnly: 'I only answer in public channels.',
  /**
   * Why reactions do not work, by error, as the app's status shows it, in its
   * language
   */
  reactionLimits: {
    missing_scope:
      'Slack: the app does not have reactions:write, so only the asker sees that Pace is working or failed, in messages for them alone, instead of 👀 and ⚠️ on their mention. Adding the scope (slack-app-manifest.yaml) and reinstalling the app turns reactions on.',
    method_not_allowed_by_hub:
      'Slack: the team hub does not relay reactions, so only the asker sees that Pace is working or failed, in messages for them alone, instead of 👀 and ⚠️ on their mention. Updating the hub turns reactions on.',
  },
}

const ko: typeof en = {
  publicOnly: '저는 공개 채널에서만 답해요.',
  reactionLimits: {
    missing_scope:
      'Slack: 앱에 reactions:write 권한이 없어서, Pace가 작업 중이거나 실패했다는 것을 멘션에 👀와 ⚠️로 표시하는 대신 요청한 사람에게만 보이는 메시지로 알려요. 권한을 추가하고(slack-app-manifest.yaml) 앱을 다시 설치하면 이모지 반응이 켜져요.',
    method_not_allowed_by_hub:
      'Slack: 팀 허브가 이모지 반응을 전달하지 않아서, Pace가 작업 중이거나 실패했다는 것을 멘션에 👀와 ⚠️로 표시하는 대신 요청한 사람에게만 보이는 메시지로 알려요. 허브를 업데이트하면 이모지 반응이 켜져요.',
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
