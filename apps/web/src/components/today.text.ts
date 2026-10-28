import type { Locale } from '@src/i18n/locale'

const en = {
  /** Todo's three lines, to a screen reader */
  today: 'Today',
  waitingOnYou: 'Waiting on you',
  pickUp: 'Pick up',
  waitingOnOthers: 'Waiting on others',
  /** Who asked, and when */
  asked: (person: string | undefined, when: string) =>
    person ? `${person} asked ${when}` : `asked ${when}`,
  due: (due: string) => `due ${due}`,
  /** Left in a session, and when it last worked */
  leftIn: (tool: string, when: string) => `last in ${tool} ${when}`,
  youStarted: (when: string) => `you started it ${when}`,
  /** How long it has waited, by calendar days */
  waited: (days: number) =>
    days === 0
      ? 'since today'
      : days === 1
        ? 'since yesterday'
        : `${days} days`,
  more: (n: number) => `and ${n} more`,
}

const ko: typeof en = {
  today: '오늘',
  waitingOnYou: '나를 기다리는 일',
  pickUp: '이어서 할 일',
  waitingOnOthers: '남을 기다리는 일',
  asked: (person, when) => (person ? `${person}님의 요청 · ${when}` : when),
  due: (due) => `기한: ${due}`,
  leftIn: (tool, when) => `${tool} · ${when}`,
  youStarted: (when) => `시작함 · ${when}`,
  waited: (days) =>
    days === 0 ? '오늘부터' : days === 1 ? '어제부터' : `${days}일째`,
  more: (n) => `외 ${n}개`,
}

export const text: Record<Locale, typeof en> = { en, ko }
