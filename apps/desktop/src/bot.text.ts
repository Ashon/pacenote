import type { Locale } from '../../../src/i18n/locale.js'

/** What the supervisor says of Pace (SupervisorState.message) */
const en = {
  stopped: 'Stopped',
  finishing: 'Finishing active requests before stopping.',
  building: 'Building Pace (pnpm build)',
  buildFailed: 'The build failed.',
  /** last: the last line Pace wrote, without its time and level */
  stoppedAtStart: (code: number, last: string) =>
    `Pace stopped right after starting (code ${code}). ${last}`.trim(),
  exited: (code: number) => `Pace exited (code ${code}).`,
  runningElsewhere:
    'Pace is running elsewhere, such as a terminal. Stop it there to manage it here.',
  stoppedElsewhere: 'Pace stopped running elsewhere.',
}

const ko: typeof en = {
  stopped: '중지됨',
  finishing: '중지하기 전에 처리 중인 요청을 마무리하고 있어요.',
  building: 'Pace 빌드 중 (pnpm build)',
  buildFailed: '빌드에 실패했어요.',
  stoppedAtStart: (code, last) =>
    `Pace가 시작하자마자 멈췄어요(코드 ${code}). ${last}`.trim(),
  exited: (code) => `Pace가 종료됐어요(코드 ${code}).`,
  runningElsewhere:
    'Pace가 터미널 같은 다른 곳에서 실행 중이에요. 여기서 관리하려면 그곳에서 중지하세요.',
  stoppedElsewhere: '다른 곳에서 실행 중이던 Pace가 멈췄어요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
