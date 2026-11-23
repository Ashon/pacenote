import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'

/** Names joined as a sentence says them: "hyun, mina and dara" */
const andList = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

const en = {
  /** The group row */
  tasks: (n: number) => `${n} tasks`,
  waits: (names: readonly string[]) =>
    names.length > 3
      ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} others wait`
      : `${andList(names)} ${names.length === 1 ? 'waits' : 'wait'}`,
  noneDone: 'none done yet',
  someDone: (done: number, of: number) => `${done} of ${of} done`,
  allDone: 'all done',
  doneAll: 'Done all',
  moreForGroup: 'More for this group',
  openGroup: 'Open this group',
  ungroup: 'Ungroup',
  fillAgain: 'Fill again',
  continueAll: 'Continue here with all of them',
  continueHereShort: 'Continue here',
  /** Your AI at work on it */
  filling: (tool: string) => `${tool} is filling it in`,
  filledIn: (when: string, by?: string) =>
    `Filled in ${when}${by ? ` · ${by}` : ''}`,
  changedSince: 'its tasks changed since',
  undo: 'Undo',
  noFill:
    'Not filled in. Your AI fills a group in from its tasks once it is set up and Group similar tasks is on.',
  /** The opened group */
  whoWaits: 'Who waits',
  due: 'Due',
  first: 'First',
  left: 'Left',
  leftOf: (left: number, of: number) => `${left} of ${of}`,
  wrapUp: 'What you did',
  /** The suggestion card */
  suggest: (n: number) => `These ${n} look like one piece of work:`,
  group: 'Group them',
  notOne: 'Not one piece',
  sawAfter: (tool: string, title: string) =>
    `${tool} saw them after filling in “${title}”.`,
  saw: (tool: string) => `${tool} saw them in your open tasks.`,
  /** A task's menu, and grouping by hand */
  groupWith: 'Group with…',
  moveOut: 'Move out of the group',
  groupTitle: 'Group with other tasks',
  groupNote:
    'Tasks that are one piece of work go in one group: its row shows who waits and what comes first, and Continue here takes them all. Each stays a task of its own.',
  intoGroup: (name: string) => `Into “${name}”`,
  noOthers: 'No other open task in this project.',
  pickSome: 'Pick a task or a group.',
  cancel: 'Cancel',
  groupThem: 'Group',
  /** Done all */
  doneTitle: (name: string) => `Done with ${name}?`,
  doneNote: (n: number) =>
    `The ${n} open tasks close together, with one note of what you did. Draft a reply on each task for those who wait.`,
  writing: (tool: string) => `${tool} is writing it up…`,
  wrapLabel: 'What you did, kept with the group',
  wrapPlaceholder: 'A line or two on what you did',
  doneAllN: (n: number) => `Done all ${n}`,
}

const ko: typeof en = {
  tasks: (n) => `할 일 ${n}개`,
  waits: (names) =>
    names.length > 3
      ? `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}명이 기다려요`
      : `${[...names.slice(0, -1), josa(names.at(-1) ?? '', '이/가')].join(', ')} 기다려요`,
  noneDone: '아직 끝낸 것 없음',
  someDone: (done, of) => `${of}개 중 ${done}개 끝냄`,
  allDone: '모두 끝냄',
  doneAll: '모두 완료',
  moreForGroup: '이 묶음 더 보기',
  openGroup: '이 묶음 열기',
  ungroup: '묶음 풀기',
  fillAgain: '다시 채우기',
  continueAll: '모두 여기서 계속',
  continueHereShort: '여기서 계속',
  filling: (tool) => `${josa(tool, '이/가')} 채우는 중`,
  filledIn: (when, by) =>
    by ? `${josa(by, '이/가')} ${when} 채움` : `${when} 채움`,
  changedSince: '그 뒤로 할 일이 바뀌었어요',
  undo: '되돌리기',
  noFill:
    '채우지 않았어요. AI를 설정하고 비슷한 할 일 묶기를 켜면 할 일을 보고 묶음을 채워요.',
  whoWaits: '기다리는 사람',
  due: '기한',
  first: '먼저',
  left: '남은 것',
  leftOf: (left, of) => `${of}개 중 ${left}개`,
  wrapUp: '한 일',
  suggest: (n) => `이 ${n}개는 한 가지 일 같아요:`,
  group: '묶기',
  notOne: '따로 두기',
  sawAfter: (tool, title) =>
    `${josa(tool, '이/가')} “${title}” 할 일을 채우다가 알아챘어요.`,
  saw: (tool) => `${josa(tool, '이/가')} 열린 할 일에서 알아챘어요.`,
  groupWith: '다른 할 일과 묶기…',
  moveOut: '묶음에서 빼기',
  groupTitle: '다른 할 일과 묶기',
  groupNote:
    '한 가지 일인 할 일을 한 묶음에 넣어요. 묶음 줄에 누가 기다리는지, 무엇을 먼저 할지 보이고, 여기서 계속은 모두를 한 세션에 넘겨요. 할 일은 각자 그대로예요.',
  intoGroup: (name) => `“${name}”에 넣기`,
  noOthers: '이 프로젝트에 다른 열린 할 일이 없어요.',
  pickSome: '할 일이나 묶음을 고르세요.',
  cancel: '취소',
  groupThem: '묶기',
  doneTitle: (name) => `${name}, 다 끝났나요?`,
  doneNote: (n) =>
    `열린 할 일 ${n}개를 한 번에 닫고, 한 일은 한 번만 적어요. 기다리는 사람에게는 할 일마다 답장 초안을 쓰세요.`,
  writing: (tool) => `${josa(tool, '이/가')} 정리하는 중…`,
  wrapLabel: '한 일, 묶음에 남겨요',
  wrapPlaceholder: '한 일을 한두 줄로',
  doneAllN: (n) => `${n}개 모두 완료`,
}

export const text: Record<Locale, typeof en> = { en, ko }
