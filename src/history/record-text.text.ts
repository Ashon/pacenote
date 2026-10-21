import type { Locale } from '../i18n/locale.js'

/**
 * Pacenote's own notes and errors in run records (recorder.ts, responder.ts),
 * which the records keep in English. Each English entry is the recorded text
 * itself, so the pattern that finds it and the words that show it stay in step
 * (tests/record-text.test.ts).
 */
const en = {
  interruptedBecause: (who: 'bot' | 'app') =>
    `Interrupted because the ${who} restarted`,
  interruptedBy: (who: 'bot' | 'app') => `Interrupted by ${who} restart`,
  resumed: (attempt: number) =>
    `Resumed after a bot restart (attempt ${attempt})`,
  tooManySteps: 'Too many steps, later steps not recorded',
  redacted: (n: number) =>
    `Redacted ${n} ${n === 1 ? 'secret' : 'secrets'} from the answer before posting it.`,
  imageUploadFailed: 'Image upload failed (check files:write)',
  stoppedToShutDown: 'Stopped to shut down; resumes on the next start.',
  notResumedOwner: 'Not resumed: Pace answers only the person it works for',
  queueFull: 'Could not resume because the queue was full',
  generatedImage: (n: number) => `Generated image ${n}`,
  figure: (n: number) => `Figure ${n}`,
}

const ko: typeof en = {
  interruptedBecause: (who) =>
    `${who === 'bot' ? '봇' : '앱'}이 다시 시작해서 중단됐어요`,
  interruptedBy: (who) => `${who === 'bot' ? '봇' : '앱'}이 다시 시작해 중단됨`,
  resumed: (attempt) =>
    `봇이 다시 시작한 뒤 이어서 했어요 (${attempt}번째 시도)`,
  tooManySteps: '단계가 너무 많아 이후 단계는 기록하지 않았어요',
  redacted: (n) => `답변을 올리기 전에 비밀 값 ${n}개를 가렸어요.`,
  imageUploadFailed: '이미지를 올리지 못했어요 (files:write 권한을 확인하세요)',
  stoppedToShutDown: '종료하느라 멈췄어요. 다음에 시작하면 이어서 해요.',
  notResumedOwner: '이어서 하지 않았어요: Pace는 자신을 쓰는 분에게만 답해요',
  queueFull: '대기열이 가득 차서 이어서 하지 못했어요',
  generatedImage: (n) => `생성한 이미지 ${n}`,
  figure: (n) => `그림 ${n}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
