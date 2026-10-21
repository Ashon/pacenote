import type { Locale } from '@src/i18n/locale'
import type { ReactNode } from 'react'

const en = {
  /**
   * Who you are in Slack: name (set off), realName when it differs, team: the
   * workspace
   */
  youAre: (name: ReactNode, realName?: string, team?: string): ReactNode => (
    <>
      In Slack you are {name}
      {realName ? ` (${realName})` : ''}
      {team ? ` in ${team}` : ''}, as Collect now last looked you up.
    </>
  ),
  notYet:
    'The next collection looks up who you are in Slack, so a request that calls you by your name counts.',
  /** name: the account Collect now reads Slack as */
  notPace: (name: string | undefined) =>
    `Collect now reads Slack as ${name}, not as the account Pace answers.`,
}

const ko: typeof en = {
  youAre: (name, realName, team) => (
    <>
      지금 모으기가 마지막으로 확인한 내 Slack 계정: {name}
      {realName ? ` (${realName})` : ''}
      {team ? ` · ${team}` : ''}
    </>
  ),
  notYet:
    '다음에 모을 때 Slack에서 내가 누구인지 확인해요. 그래야 내 이름을 부르는 요청도 할 일에 들어가요.',
  notPace: (name) =>
    `지금 모으기는 Pace가 답변하는 계정이 아니라 ${name} 계정으로 Slack을 읽어요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
