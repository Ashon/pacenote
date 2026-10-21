import type { Locale } from '@src/i18n/locale'
import type { Section } from './sidebar'

const en = {
  sections: {
    overview: 'Overview',
    tasks: 'Todo',
    recap: 'Recap',
    you: 'You',
    runs: 'Runs',
    bot: 'Pace',
    settings: 'Settings',
    debug: 'Debug',
  } satisfies Record<Section, string>,
  /** The sidebar, to a screen reader */
  nav: 'Sections',
  /** Beside the name in a development run */
  dev: 'Dev',
  /** A section with its count, when the labels are hidden */
  withCount: (label: string, count: number) => `${label} (${count})`,
}

const ko: typeof en = {
  sections: {
    overview: '개요',
    tasks: '할 일',
    recap: '회고',
    you: '나',
    runs: '실행 기록',
    bot: 'Pace',
    settings: '설정',
    debug: '디버그',
  },
  nav: '섹션',
  dev: '개발용',
  withCount: (label, count) => `${label} (${count})`,
}

export const text: Record<Locale, typeof en> = { en, ko }
