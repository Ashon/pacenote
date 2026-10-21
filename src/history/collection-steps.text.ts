import type { Locale } from '../i18n/locale.js'

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

const en = {
  /**
   * Pacenote's and the CLI's tools as a person reads them (the sources' are
   * in src/tasks/sources.text.ts)
   */
  tools: {
    collect_context: 'Got the rules',
    my_tasks: 'Read your open tasks',
    add_tasks: 'Added tasks',
    close_task: 'Closed a task',
    update_task: 'Updated a task',
    wrap_up_task: 'Wrapped up a task',
    ToolSearch: 'Loaded its tools',
  },
  // What add_tasks answered: "2 tasks added, 1 Maybe, 1 left out by your
  // settings"
  added: (n: number) => `${plural(n, 'task')} added`,
  maybe: (n: number) => plural(n, 'Maybe'),
  leftOutBySettings: (n: number) => `${n} left out by your settings`,
  // The rules collect_context gave: "Since Oct 20, 14:03 · DMs count"
  since: (when: string) => `Since ${when}`,
  dmsCount: 'DMs count',
  dmsNotCounted: 'DMs not counted',
  channelsLeftOut: (n: number) => `${plural(n, 'channel')} left out`,
}

const ko: typeof en = {
  tools: {
    collect_context: '규칙 받기',
    my_tasks: '열린 할 일 읽기',
    add_tasks: '할 일 추가',
    close_task: '할 일 닫기',
    update_task: '할 일 수정',
    wrap_up_task: '할 일 마무리',
    ToolSearch: '도구 불러오기',
  },
  added: (n) => `할 일 ${n}개 추가`,
  maybe: (n) => `후보 ${n}개`,
  leftOutBySettings: (n) => `설정에 따라 ${n}개 제외`,
  since: (when) => `${when}부터`,
  dmsCount: 'DM 포함',
  dmsNotCounted: 'DM 제외',
  channelsLeftOut: (n) => `채널 ${n}개 제외`,
}

export const text: Record<Locale, typeof en> = { en, ko }
