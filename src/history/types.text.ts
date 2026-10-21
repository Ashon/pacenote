import type { Locale } from '../i18n/locale.js'

const en = {
  collecting: 'Collecting',
  /** What a collection added: "Added 2 tasks and 1 Maybe" */
  added: (added: number, maybe: number) => {
    const parts = [
      added && `${added} ${added === 1 ? 'task' : 'tasks'}`,
      maybe && `${maybe} ${maybe === 1 ? 'Maybe' : 'Maybes'}`,
    ].filter(Boolean)
    return parts.length ? `Added ${parts.join(' and ')}` : 'Nothing new to add'
  },
  stoppedBefore: 'Stopped before it finished',
}

const ko: typeof en = {
  collecting: '모으는 중',
  added: (added, maybe) => {
    const parts = [
      added && `할 일 ${added}개`,
      maybe && `후보 ${maybe}개`,
    ].filter(Boolean)
    return parts.length ? `${parts.join(', ')} 추가` : '새로 추가할 것 없음'
  },
  stoppedBefore: '끝나기 전에 멈춤',
}

export const text: Record<Locale, typeof en> = { en, ko }
