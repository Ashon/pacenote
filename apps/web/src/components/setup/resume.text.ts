import type { Locale } from '@src/i18n/locale'

const en = {
  title: 'Finish setting up Pace',
  /** next: what the next step does, "connect Slack" */
  progress: (done: number, total: number, next: string) =>
    `${done} of ${total} steps done. Next: ${next}.`,
  resume: 'Resume setup',
  inSettings: 'Set it up in Settings instead',
  factsLabel: 'Where setup stands',
  running: 'Running',
  notRunning: 'Not running yet',
  answering: 'Answering mentions',
  startsAfter: 'Starts when setup finishes',
  answers: 'Answers',
  noneYet: 'None yet',
  answersHint: 'Each answer and its steps show up in Runs',
  sandbox: 'Built-in sandbox',
  notOnThisMac: 'Not on this Mac',
  notUsed: 'Not used',
  ready: 'Ready',
  preparing: (percent: number) => `Preparing, ${percent}%`,
  preparingStopped: 'Preparing stopped',
  notPrepared: 'Not prepared yet',
  directly: 'Pace runs directly on this Mac',
  answersInIt: 'Pace answers in it',
  background: 'Keeps going in the background',
  tryAgain: 'Try again in setup, under Where it runs',
  preparesOnResume: 'Prepares once you resume setup',
}

const ko: typeof en = {
  title: 'Pace 초기 설정 마치기',
  progress: (done, total, next) =>
    `${total}단계 중 ${done}단계를 마쳤어요. 다음: ${next}`,
  resume: '초기 설정 이어서 하기',
  inSettings: '설정에서 직접 하기',
  factsLabel: '초기 설정 진행 상황',
  running: '실행 중',
  notRunning: '아직 실행 전',
  answering: '멘션에 답변하는 중',
  startsAfter: '초기 설정을 마치면 시작해요',
  answers: '답변',
  noneYet: '아직 없음',
  answersHint: '답변과 그 단계는 실행 기록에 나와요',
  sandbox: '내장 샌드박스',
  notOnThisMac: '이 Mac에서 쓸 수 없음',
  notUsed: '사용 안 함',
  ready: '준비됨',
  preparing: (percent) => `준비 중, ${percent}%`,
  preparingStopped: '준비 중지됨',
  notPrepared: '아직 준비 전',
  directly: 'Pace가 이 Mac에서 바로 실행돼요',
  answersInIt: 'Pace가 이 안에서 답변해요',
  background: '백그라운드에서 계속 진행돼요',
  tryAgain: '초기 설정의 실행 환경 단계에서 다시 시도하세요',
  preparesOnResume: '초기 설정을 이어서 하면 준비해요',
}

export const text: Record<Locale, typeof en> = { en, ko }
