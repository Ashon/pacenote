import type { Locale } from '../../../src/i18n/locale.js'
import { josa } from '../../../src/i18n/korean.js'
import type { ConnectorCli } from '../../../src/tasks/own-ai.js'

/** Why a reply draft did not come; name: the CLI's, cli: its command */
const en = {
  stoppedBefore: (name: string) => `${name} stopped before it wrote a draft.`,
  notSignedIn: (name: string, cli: ConnectorCli) =>
    `${name} is not signed in. ${cli === 'codex' ? 'Run codex login in a terminal' : 'Run claude in a terminal and sign in'}, then draft again.`,
  noDraft: (name: string) => `${name} wrote no draft.`,
  needsCli: (name: string, cli: string) =>
    `Drafting needs ${name}, signed in, with its Slack connector: ${cli} is not on this Mac.`,
  slow: 'The draft did not come in 3 minutes.',
}

const ko: typeof en = {
  stoppedBefore: (name) => `${josa(name, '이/가')} 초안을 쓰기 전에 멈췄어요.`,
  notSignedIn: (name, cli) =>
    `${name}에 로그인되어 있지 않아요. ${cli === 'codex' ? '터미널에서 codex login을 실행한' : '터미널에서 claude를 실행해 로그인한'} 뒤 다시 초안을 쓰세요.`,
  noDraft: (name) => `${josa(name, '이/가')} 초안을 쓰지 않았어요.`,
  needsCli: (name, cli) =>
    `초안을 쓰려면 ${name}에 로그인하고 Slack 커넥터를 연결해야 해요. 이 Mac에 ${josa(cli, '이/가')} 없어요.`,
  slow: '3분 안에 초안이 오지 않았어요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
