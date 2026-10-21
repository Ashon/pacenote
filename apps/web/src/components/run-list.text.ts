import type { Locale } from '@src/i18n/locale'

const en = {
  /** The kind filter: all, mentions, task collections */
  kinds: {
    all: 'All',
    mention: 'Mentions',
    collection: 'Task collections',
  },
  status: 'Status',
  statuses: {
    all: 'All',
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
    interrupted: 'Interrupted',
  },
  noMatch: 'No runs match the filters.',
  noCollections:
    'No task collections yet. Collect now on the Todo screen runs one.',
  noMentions: 'Pace has not answered any mentions yet.',
  loadFailed: 'Could not load run history.',
  emptyRequest: '(empty request)',
  taskCollection: 'Task collection',
  mention: 'Mention',
}

const ko: typeof en = {
  kinds: {
    all: '전체',
    mention: '멘션',
    collection: '할 일 모으기',
  },
  status: '상태',
  statuses: {
    all: '전체',
    running: '실행 중',
    succeeded: '성공',
    failed: '실패',
    interrupted: '중단됨',
  },
  noMatch: '필터에 맞는 실행이 없어요.',
  noCollections:
    '아직 할 일 모으기 기록이 없어요. 할 일 화면에서 지금 모으기를 누르면 시작돼요.',
  noMentions: 'Pace가 아직 답변한 멘션이 없어요.',
  loadFailed: '실행 기록을 불러오지 못했어요.',
  emptyRequest: '(빈 요청)',
  taskCollection: '할 일 모으기',
  mention: '멘션',
}

export const text: Record<Locale, typeof en> = { en, ko }
