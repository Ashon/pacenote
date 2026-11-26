import type { Locale } from '@src/i18n/locale'

/** A task Pacenote hands a session, drawn as cards (handed-task.tsx) */
const en = {
  handedOver: 'Pacenote handed this task over',
  handedOverMany: (count: number) =>
    `Pacenote handed these ${count} tasks over`,
  task: 'Task',
  action: { code: 'Code', reply: 'Reply' } as Record<string, string>,
  openTask: 'Open the task',
  earlier: (count: number) =>
    count === 1 ? 'What came before it' : `What came before it, ${count}`,
  earlierPace: 'Asked Pace in its thread',
  earlierTask: 'An earlier task',
  openSlack: 'Open in Slack',
  openMessage: 'Open its message',
  group: 'Group',
  grouped: (others: number) =>
    others === 1
      ? 'With the task below, as one piece of work'
      : `With the ${others} tasks below, as one piece of work`,
  brief: (tool: string) => `What Pacenote asks of ${tool}`,
}

const ko: typeof en = {
  handedOver: 'Pacenote가 넘긴 할 일',
  handedOverMany: (count) => `Pacenote가 넘긴 할 일 ${count}개`,
  task: '할 일',
  action: { code: '코드', reply: '답장' },
  openTask: '할 일 열기',
  earlier: (count) =>
    count === 1 ? '앞서 있던 일' : `앞서 있던 일 ${count}개`,
  earlierPace: '스레드에서 Pace에게 물은 것',
  earlierTask: '앞선 할 일',
  openSlack: 'Slack에서 열기',
  openMessage: '메시지 열기',
  group: '묶음',
  grouped: (others) => `아래 할 일 ${others}개와 한 가지 일로 묶었어요`,
  brief: (tool) => `Pacenote가 ${tool}에게 부탁한 것`,
}

export const text: Record<Locale, typeof en> = { en, ko }
