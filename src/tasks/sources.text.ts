import type { Locale } from '../i18n/locale.js'

const en = {
  /** Where each CLI's Slack connector is connected, as the user finds it */
  slackWhere: {
    claude: "claude.ai's Settings > Connectors",
    codex: "ChatGPT's Settings > Apps",
  },
  /**
   * What each connector tool a collection may use did, as a person reads it
   * (the run history's Lookups), by the tool's name
   */
  reads: {
    slack_search_public: 'Searched public messages',
    slack_search_public_and_private: 'Searched messages',
    slack_search_channels: 'Looked up channels',
    slack_search_users: 'Looked up people',
    slack_read_channel: 'Read a channel',
    slack_read_thread: 'Read a thread',
    slack_get_reactions: 'Checked reactions',
    slack_list_user_channels: 'Listed your channels',
    slack_list_channel_members: 'Listed channel members',
    slack_read_user_profile: 'Looked up a person',
  },
}

const ko: typeof en = {
  // claude.ai's and ChatGPT's own words for their settings in Korean
  slackWhere: {
    claude: 'claude.ai의 설정 > 커넥터',
    codex: 'ChatGPT의 설정 > 앱',
  },
  reads: {
    slack_search_public: '공개 메시지 검색',
    slack_search_public_and_private: '메시지 검색',
    slack_search_channels: '채널 찾기',
    slack_search_users: '사람 찾기',
    slack_read_channel: '채널 읽기',
    slack_read_thread: '스레드 읽기',
    slack_get_reactions: '반응 확인',
    slack_list_user_channels: '내 채널 목록 보기',
    slack_list_channel_members: '채널 멤버 목록 보기',
    slack_read_user_profile: '사람 정보 보기',
  },
}

export const text: Record<Locale, typeof en> = { en, ko }

/** A connector tool a collection may use, by its name */
export type ReadTool = keyof typeof en.reads
