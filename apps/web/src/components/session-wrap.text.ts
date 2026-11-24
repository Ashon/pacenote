import type { Locale } from '@src/i18n/locale'
import { josa } from '@src/i18n/korean'

/** Closing a session, and wrapping up the task it worked on */
const en = {
  close: 'Close',
  closeHint:
    'Ends its run here and moves it to Ended. Write to it again to go on.',
  closeHintLog:
    'Moves it to Ended here. It opens again once it writes to its log.',
  wrapUp: 'Wrap up',
  wrapTitle: 'Wrap up its task',
  wrapNote: (task: string) =>
    `${task} closes with what was done. The things left you keep become tasks after it.`,
  writing: 'Your AI is reading how it ended…',
  writtenBy: (by: string) => `What was done, as ${by} read it`,
  doneLabel: 'What was done',
  donePlaceholder: 'A line or two on what was done',
  notDone: 'It does not read as finished yet. Wrap it up anyway if it is.',
  leftLabel: 'Left after it: keep as tasks',
  closeToo: 'Close the session too',
  cancel: 'Cancel',
  wrapIt: 'Wrap up',
}

const ko: typeof en = {
  close: '닫기',
  closeHint:
    '여기서 돌던 것을 끝내고 끝난 세션으로 옮겨요. 다시 말을 걸면 이어 가요.',
  closeHintLog: '여기서 끝난 세션으로 옮겨요. 로그에 다시 쓰면 다시 열려요.',
  wrapUp: '마무리',
  wrapTitle: '할 일 마무리',
  wrapNote: (task) =>
    `${josa(task, '이/가')} 한 일과 함께 닫혀요. 남길 일은 이어지는 할 일이 돼요.`,
  writing: 'AI가 어떻게 끝났는지 읽는 중…',
  writtenBy: (by) => `${josa(by, '이/가')} 읽은 한 일`,
  doneLabel: '한 일',
  donePlaceholder: '한 일을 한두 줄로',
  notDone: '아직 끝난 것 같지는 않아요. 끝났다면 그래도 마무리하세요.',
  leftLabel: '남은 일: 할 일로 남기기',
  closeToo: '세션도 닫기',
  cancel: '취소',
  wrapIt: '마무리',
}

export const text: Record<Locale, typeof en> = { en, ko }
