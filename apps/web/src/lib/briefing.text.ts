import type { Locale } from '../../../../src/i18n/locale.js'

const en = {
  next: 'Next',
  doing: 'Doing',
  doneToday: 'Done today',
  yesterday: 'Yesterday',
  moreOpen: (n: number) => `${n} more open`,
  andMore: (n: number) => `and ${n} more`,
  /** "2 tasks and 3 commits in Payments": the area only when there is one */
  done: (tasks: number, commits: number, area?: string) => {
    const what = [
      tasks ? `${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : undefined,
      commits
        ? `${commits} ${commits === 1 ? 'commit' : 'commits'}`
        : undefined,
    ]
      .filter(Boolean)
      .join(' and ')
    return area ? `${what} in ${area}` : what
  },
}

const ko: typeof en = {
  next: '다음',
  doing: '하는 중',
  doneToday: '오늘 완료',
  yesterday: '어제',
  moreOpen: (n) => `열린 할 일 ${n}개 더`,
  andMore: (n) => `외 ${n}개`,
  done: (tasks, commits, area) => {
    const what = [
      tasks ? `할 일 ${tasks}개` : undefined,
      commits ? `커밋 ${commits}개` : undefined,
    ]
      .filter(Boolean)
      .join(', ')
    return area ? `${area}에서 ${what}` : what
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
