import type { Locale } from '../../../src/i18n/locale.js'
import { josa } from '../../../src/i18n/korean.js'
import type { ConnectorCli } from '../../../src/tasks/own-ai.js'

/**
 * How a collection ended, when it found nothing: Todo shows it and the run
 * history keeps it. name: the CLI's, cli: its command, sources: the names of
 * the sources it reads ("Slack").
 */
const en = {
  noConnector: (name: string, sources: readonly string[], where: string) =>
    `${name} has no ${sources.join(' or ')} connector. Connect ${sources.join(' or ')} in ${where}, then collect again.`,
  stopped: 'Stopped.',
  /**
   * Collecting runs the CLI on this Mac, whichever one answers mentions, so it
   * may be signed out there while Pace answers.
   */
  signedOut: {
    claude:
      'Claude Code on this Mac is signed out, and collecting reads Slack through it.',
    codex:
      'Codex on this Mac is signed out, and collecting reads Slack through it.',
  } satisfies Record<ConnectorCli, string>,
  unfinished: 'The collection stopped before it finished.',
  running: 'A collection is already running.',
  notStarted: 'The collection did not start.',
  slow: (minutes: number) =>
    `The collection did not finish in ${minutes} minutes.`,
  needsCli: (name: string, sources: readonly string[], cli: string) =>
    `Collecting needs ${name}, signed in, with its ${sources.join(' or ')} connector: ${cli} is not on this Mac.`,
  exited: (cli: string, code: number | null) =>
    `${cli} exited with code ${code}.`,
}

const ko: typeof en = {
  noConnector: (name, sources, where) =>
    `${name}에는 ${sources.join(' 또는 ')} 커넥터가 없어요. ${where}에서 ${josa(sources.join(' 또는 '), '을/를')} 연결한 뒤 다시 모으세요.`,
  stopped: '중지했어요.',
  signedOut: {
    claude:
      '이 Mac의 Claude Code가 로그아웃됐어요. 할 일 모으기는 Claude Code로 Slack을 읽어요.',
    codex:
      '이 Mac의 Codex가 로그아웃됐어요. 할 일 모으기는 Codex로 Slack을 읽어요.',
  },
  unfinished: '모으기가 끝나기 전에 멈췄어요.',
  running: '이미 모으는 중이에요.',
  notStarted: '모으기를 시작하지 못했어요.',
  slow: (minutes) => `모으기가 ${minutes}분 안에 끝나지 않았어요.`,
  needsCli: (name, sources, cli) =>
    `모으려면 ${name}에 로그인하고 ${sources.join(' 또는 ')} 커넥터를 연결해야 해요. 이 Mac에 ${josa(cli, '이/가')} 없어요.`,
  exited: (cli, code) => `${josa(cli, '이/가')} 종료됐어요(코드 ${code}).`,
}

export const text: Record<Locale, typeof en> = { en, ko }
