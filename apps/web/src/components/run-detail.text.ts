import type { Locale } from '@src/i18n/locale'

const en = {
  notFound: 'Run not found.',
  instructions: 'Instructions (system)',
  input: 'Input (thread context, request, attachments)',
  noPrompt: 'This run ended before the prompt was built.',
  tabs: {
    timeline: 'Timeline',
    attachments: 'Attachments',
    prompt: 'Prompt',
    raw: 'JSON',
  },
  mention: 'Mention',
  attempts: (n: number) => `${n} attempts`,
  /** The messenger by name: View in Slack */
  viewIn: (messenger: string) => `View in ${messenger}`,
  emptyRequest: '(empty request)',
  duration: 'Duration',
  toolCalls: 'Tool calls',
  calls: (n: number) => `${n} ${n === 1 ? 'call' : 'calls'}`,
  reasoner: 'Reasoner',
  attachment: {
    read: 'Read',
    skipped: 'Skipped',
    failed: 'Failed',
  },
  noAttachments: 'This request has no attachments.',
}

const ko: typeof en = {
  notFound: '실행을 찾을 수 없어요.',
  instructions: '지시문 (system)',
  input: '입력 (스레드 맥락, 요청, 첨부 파일)',
  noPrompt: '프롬프트를 만들기 전에 실행이 끝났어요.',
  tabs: {
    timeline: '타임라인',
    attachments: '첨부 파일',
    prompt: '프롬프트',
    raw: 'JSON',
  },
  mention: '멘션',
  attempts: (n) => `${n}번 시도`,
  viewIn: (messenger) => `${messenger}에서 보기`,
  emptyRequest: '(빈 요청)',
  duration: '걸린 시간',
  toolCalls: '도구 호출',
  calls: (n) => `${n}번`,
  reasoner: '답변 CLI',
  attachment: {
    read: '읽음',
    skipped: '건너뜀',
    failed: '실패',
  },
  noAttachments: '이 요청에는 첨부 파일이 없어요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
