import type { Locale } from '@src/i18n/locale'

/** A session's conversation: its turns, its steps, and what it does now */
const en = {
  thinking: 'Thinking',
  writing: 'Writing',
  working: 'Working',
  running: 'Running',
  workingIn: (where: string) => `Working in ${where}`,
  elapsed: (seconds: number) =>
    seconds < 60
      ? `${seconds}s`
      : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`,
  steps: (count: number) => `${count} steps`,
  showSteps: 'Show each step',
  foldSteps: 'Fold the steps',
  failed: 'Failed',
  failedCount: (count: number) => `${count} failed`,
  compacted: 'What came before, summarized',
  showSummary: 'Show the summary',
  stopped: 'You stopped it here',
  images: (count: number) => (count === 1 ? 'An image' : `${count} images`),
  image: (place: number) => `Image ${place}`,
  openImage: (place: number) => `Open image ${place}`,
  copy: 'Copy',
  copied: 'Copied',
  showAll: 'Show all',
  showLess: 'Show less',
  // What you sent, before Claude Code reads it
  queued: 'Queued',
  queuedNote: 'Claude Code reads it once the step it is on is done.',
}

const ko: typeof en = {
  thinking: '생각하는 중',
  writing: '답을 쓰는 중',
  working: '작업 중',
  running: '실행 중',
  workingIn: (where) => `${where}에서 작업 중`,
  elapsed: (seconds) =>
    seconds < 60
      ? `${seconds}초`
      : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`,
  steps: (count) => `단계 ${count}개`,
  showSteps: '단계 모두 보기',
  foldSteps: '단계 접기',
  failed: '실패',
  failedCount: (count) => `${count}개 실패`,
  compacted: '앞의 대화를 요약했어요',
  showSummary: '요약 보기',
  stopped: '여기서 멈췄어요',
  images: (count) => `이미지 ${count}개`,
  image: (place) => `이미지 ${place}`,
  openImage: (place) => `이미지 ${place} 크게 보기`,
  copy: '복사',
  copied: '복사됨',
  showAll: '모두 보기',
  showLess: '접기',
  queued: '대기 중',
  queuedNote: 'Claude Code가 지금 단계를 마치면 읽어요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
