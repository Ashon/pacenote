import type { Locale } from '@src/i18n/locale'

const en = {
  emptyRequest: '(empty request: answered from the conversation context)',
  /** What came with the request: 3 thread messages, 1 attachment */
  context: (messages: number, attachments: number) =>
    `${messages} thread ${messages === 1 ? 'message' : 'messages'}` +
    (attachments > 0
      ? `, ${attachments} ${attachments === 1 ? 'attachment' : 'attachments'}`
      : ''),
  working: 'Working',
  /** An output under its picture: its title, and what made it */
  output: (title: string, diagram: boolean) =>
    `${title}${diagram ? ' (diagram block)' : ' (generated image)'}`,
  source: 'Source',
  interrupted: 'Interrupted',
  failed: 'Failed',
  openSettings: 'Open Settings',
  openPace: 'Open Pace',
  thinking: 'Thinking',
  arguments: 'Arguments',
  command: 'Command',
  error: 'Error',
  result: 'Result',
  /** A command's output, with its exit code once it has one */
  commandOutput: (exitCode?: number | null) =>
    `Output${exitCode != null ? ` (exit code ${exitCode})` : ''}`,
  running: 'Running...',
}

const ko: typeof en = {
  emptyRequest: '(빈 요청: 대화 맥락으로 답변했어요)',
  context: (messages, attachments) =>
    `스레드 메시지 ${messages}개` +
    (attachments > 0 ? `, 첨부 파일 ${attachments}개` : ''),
  working: '작업 중',
  output: (title, diagram) =>
    `${title} (${diagram ? '다이어그램 블록' : '생성한 이미지'})`,
  source: '소스',
  interrupted: '중단됨',
  failed: '실패',
  openSettings: '설정 열기',
  openPace: 'Pace 열기',
  thinking: '생각',
  arguments: '인자',
  command: '명령',
  error: '오류',
  result: '결과',
  commandOutput: (exitCode) =>
    `출력${exitCode != null ? ` (종료 코드 ${exitCode})` : ''}`,
  running: '실행 중...',
}

export const text: Record<Locale, typeof en> = { en, ko }
