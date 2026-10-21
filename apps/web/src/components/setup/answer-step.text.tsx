import type { Locale } from '@src/i18n/locale'
import type { ReactNode } from 'react'

const en = {
  titleDone: 'Pace is set up',
  title: 'Say hello to Pace in Slack',
  leadDone:
    'It answered in Slack, so the whole path works. Overview shows how it is doing from here.',
  lead: 'Pace is running. Mention it once to see the whole path work, from Slack to the AI and back.',
  toOverview: 'Go to Overview',
  start: 'Start Pace',
  starting: 'Pace is starting.',
  /** message: what Pace said about why, if anything */
  notRunning: (message?: string) =>
    `Pace isn't running, so it can't answer yet.${message ? ` ${message}` : ''}`,
  /** from: the Mac Pace answered on before */
  movedHere: (from: string | undefined) =>
    `Pace moved here from ${from}: this Mac answers the hello.`,
  movingHere: (from: string | undefined) => `Moving here from ${from}…`,
  askSomething: 'Ask it something in a channel it is in',
  /** What to ask it, typed in Slack */
  question: '@Pace what can you help me with?',
  /** command: /invite @Pace */
  inviteFirst: (command: ReactNode): ReactNode => (
    <>In another channel, invite it first with {command}.</>
  ),
  waiting: 'Waiting for your first mention',
  nothingYet:
    "Nothing yet? If Pace said in Slack that it can't answer there, mention it in a public channel it's in, as yourself.",
  answering: 'Pace is answering',
  sent: 'First answer sent',
  couldNot: 'It could not answer',
  inThread: ' · answered in the thread',
  openRun: 'Open the run',
  interrupted: 'Pace stopped before it answered.',
  noAnswer: "Pace couldn't produce an answer.",
  /** reason: why it failed, in a sentence or two */
  failed: (reason: string) =>
    `${reason} Fix it, then mention Pace again: its next answer finishes setup.`,
}

const ko: typeof en = {
  titleDone: 'Pace 설정을 마쳤어요',
  title: 'Slack에서 Pace에게 인사하세요',
  leadDone:
    'Slack에서 답변했으니 전체 경로가 잘 작동해요. 이제부터는 개요에서 Pace의 상태를 볼 수 있어요.',
  lead: 'Pace가 실행 중이에요. 한 번 멘션해서 Slack에서 AI를 거쳐 다시 돌아오는 전체 경로가 작동하는지 확인하세요.',
  toOverview: '개요로 이동',
  start: 'Pace 시작',
  starting: 'Pace가 시작하는 중이에요.',
  notRunning: (message) =>
    `Pace가 실행 중이 아니어서 아직 답변할 수 없어요.${message ? ` ${message}` : ''}`,
  movedHere: (from) =>
    `Pace가 ${from}에서 이 Mac으로 옮겨 왔어요. 인사에는 이 Mac이 답변해요.`,
  movingHere: (from) => `${from}에서 이 Mac으로 옮기는 중…`,
  askSomething: 'Pace가 들어 있는 채널에서 무엇이든 물어보세요',
  question: '@Pace 어떤 걸 도와줄 수 있어요?',
  inviteFirst: (command) => <>다른 채널에서는 먼저 {command}로 초대하세요.</>,
  waiting: '첫 멘션을 기다리는 중',
  nothingYet:
    '아직 소식이 없나요? 그 채널에서는 답변할 수 없다고 Pace가 Slack에서 알렸다면, Pace가 들어 있는 공개 채널에서 내 계정으로 멘션하세요.',
  answering: 'Pace가 답변하는 중',
  sent: '첫 답변 보냄',
  couldNot: '답변하지 못함',
  inThread: ' · 스레드에 답변함',
  openRun: '실행 기록 보기',
  interrupted: 'Pace가 답변하기 전에 멈췄어요.',
  noAnswer: 'Pace가 답변을 만들지 못했어요.',
  failed: (reason) =>
    `${reason} 문제를 고친 뒤 Pace를 다시 멘션하세요. 다음 답변이 오면 초기 설정이 끝나요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
