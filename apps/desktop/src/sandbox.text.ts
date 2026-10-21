import type { Locale } from '../../../src/i18n/locale.js'

/** Settings > Sandbox: the allowed domains and the sandbox jobs */
const en = {
  badDomains: 'The domain list format is invalid.',
  unknownJob: 'Unknown job.',
  jobRunning: (job: string) => `A job is already in progress: ${job}.`,
  noRunner: (file: string) =>
    `Job runner not found: ${file} (run pnpm bundle in the repository)`,
  /** A line of the job's output */
  failedToRun: (error: string) => `Failed to run: ${error}`,
}

const ko: typeof en = {
  badDomains: '도메인 목록 형식이 올바르지 않아요.',
  unknownJob: '알 수 없는 작업이에요.',
  jobRunning: (job) => `이미 진행 중인 작업이 있어요: ${job}.`,
  noRunner: (file) =>
    `작업 실행기를 찾을 수 없어요: ${file} (저장소에서 pnpm bundle을 실행하세요)`,
  failedToRun: (error) => `실행하지 못했어요: ${error}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
