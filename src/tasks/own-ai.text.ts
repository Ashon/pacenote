import { josa } from '../i18n/korean.js'
import type { Locale } from '../i18n/locale.js'
import type { Unable } from './own-ai.js'

const en = {
  /** A CLI with no Slack connector here, when work needs one */
  noSlackYet: (cli: string) => `${cli} reads no Slack in Pacenote yet.`,
  /** Why a CLI could not, as a line reads it after its name */
  unable: {
    limit: 'at its usage limit',
    unavailable: 'unavailable',
    auth: 'signed out',
    missing: 'not on this Mac',
    connector: 'without its Slack connector',
  } satisfies Record<Unable, string>,
  /**
   * A switch to the other CLI: "Claude Code was at its usage limit until
   * 14:00"; until, the time it rests to, as the screen says it
   */
  switched: (cli: string, unable: Unable, until?: string) =>
    `${cli} was ${en.unable[unable]}${until ? ` until ${until}` : ''}`,
}

const ko: typeof en = {
  noSlackYet: (cli) =>
    `${josa(cli, '은/는')} 아직 Pacenote에서 Slack을 읽을 수 없어요.`,
  unable: {
    limit: '사용 한도 도달',
    unavailable: '사용할 수 없음',
    auth: '로그아웃됨',
    missing: '이 Mac에 없음',
    connector: 'Slack 커넥터 없음',
  },
  switched: (cli, unable, until) => {
    const why = {
      limit: `${josa(cli, '이/가')} 사용 한도에 도달했어요`,
      unavailable: `${josa(cli, '을/를')} 사용할 수 없었어요`,
      auth: `${cli}에서 로그아웃되어 있었어요`,
      missing: `${josa(cli, '이/가')} 이 Mac에 없었어요`,
      connector: `${cli}에 Slack 커넥터가 없었어요`,
    }[unable]
    return until ? `${why} (${until}까지)` : why
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
