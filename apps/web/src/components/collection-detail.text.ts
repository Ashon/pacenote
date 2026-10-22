import type { Locale } from '@src/i18n/locale'

const en = {
  taskCollection: 'Task collection',
  trigger: { now: 'Collect now' },
  openTodo: 'Open Todo',
  tabResult: 'Result',
  tabLookups: 'Lookups',
  tabRules: 'Rules',

  // Its facts
  duration: 'Duration',
  lookups: 'Lookups',
  lookupsHint: 'in Slack, read only',
  collectedBy: 'Collected by',
  onYourMac: 'on your Mac',
  readSlackAs: 'Read Slack as',
  you: 'You',
  chatGptApp: "ChatGPT's Slack app",
  claudeConnector: "Claude's connector",
  nothingRead: 'Nothing read',

  /** Where each task is now */
  state: {
    open: 'Open',
    maybe: 'Maybe',
    done: 'Done',
    dismissed: 'Dismissed',
    closed: 'Closed',
  },

  // Its result
  collecting: (reads: number) => `Collecting: ${reads} lookups so far.`,
  nothingNew: 'Nothing new to add, and no open task changed or closed.',
  added: 'Added',
  addedMeta: (tasks: number, maybes: number) =>
    [
      `${tasks} ${tasks === 1 ? 'task' : 'tasks'}`,
      maybes ? `${maybes} ${maybes === 1 ? 'Maybe' : 'Maybes'}` : '',
    ]
      .filter(Boolean)
      .join(', '),
  maybe: 'Maybe',
  closed: 'Closed',
  updated: 'Updated',
  wrappedUp: 'Wrapped up',
  leftOut: 'Left out by your settings',
  tasks: (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`,
  messages: (n: number) => `${n} ${n === 1 ? 'message' : 'messages'}`,
  leftOutInSettings: 'Left out in Settings > Todo',
  /** Why a task closed */
  why: {
    replied: 'You replied in its thread',
    checked: 'Its message got a check mark',
    resolved: 'Settled another way',
  } as Record<string, string>,

  // A collection that did not finish
  stopped: 'Stopped',
  couldNotFinish: 'Could not finish',
  stoppedEarly: 'The collection stopped before it finished.',
  connectorNote:
    "A collection reads Slack as you, through your AI tool's connector. Pace's own Slack connection answers mentions and is not used here.",
  nothingChanged: 'Nothing was added or closed.',

  // Its lookups
  noLookups: 'This collection made no lookups.',
  lookupsIntro: (reads: number, duration?: string) =>
    `${reads} lookups in Slack${duration ? ` in ${duration}` : ''}. Pacenote's own tools gave the rules and took the tasks.`,
  failed: (n: number) => `${n} failed`,
  notKept:
    'What Slack returned is not kept: it is your messages. The record keeps which tool ran, when and for how long.',

  // Its rules
  noRules: 'This collection did not get the rules.',
  rulesLabel: 'What Pacenote gave it (collect_context)',
}

const ko: typeof en = {
  taskCollection: '할 일 모으기',
  trigger: { now: '지금 모으기' },
  openTodo: '할 일 열기',
  tabResult: '결과',
  tabLookups: '조회',
  tabRules: '규칙',

  duration: '소요 시간',
  lookups: '조회',
  lookupsHint: 'Slack, 읽기 전용',
  collectedBy: '모은 AI',
  onYourMac: '내 Mac에서',
  readSlackAs: 'Slack을 읽은 계정',
  you: '나',
  chatGptApp: 'ChatGPT의 Slack 앱',
  claudeConnector: 'Claude의 커넥터',
  nothingRead: '읽은 것 없음',

  state: {
    open: '열림',
    maybe: '후보',
    done: '완료',
    dismissed: '제외됨',
    closed: '닫힘',
  },

  collecting: (reads) => `모으는 중: 지금까지 ${reads}번 조회했어요.`,
  nothingNew: '새로 추가할 것도, 바뀌거나 닫힌 할 일도 없어요.',
  added: '추가됨',
  addedMeta: (tasks, maybes) =>
    [`할 일 ${tasks}개`, maybes ? `후보 ${maybes}개` : '']
      .filter(Boolean)
      .join(', '),
  maybe: '후보',
  closed: '닫힘',
  updated: '변경됨',
  wrappedUp: '정리됨',
  leftOut: '설정에 따라 뺀 것',
  tasks: (n) => `할 일 ${n}개`,
  messages: (n) => `메시지 ${n}개`,
  leftOutInSettings: '설정 > 할 일에서 뺐어요',
  why: {
    replied: '스레드에 답장함',
    checked: '메시지에 체크 표시가 달림',
    resolved: '다른 방법으로 해결됨',
  },

  stopped: '중지됨',
  couldNotFinish: '끝내지 못함',
  stoppedEarly: '모으기가 끝나기 전에 멈췄어요.',
  connectorNote:
    '모으기는 AI 도구의 커넥터를 통해 내 계정으로 Slack을 읽어요. Pace의 Slack 연결은 멘션에 답할 때만 쓰고 여기서는 쓰지 않아요.',
  nothingChanged: '추가되거나 닫힌 할 일이 없어요.',

  noLookups: '이 모으기는 조회를 하지 않았어요.',
  lookupsIntro: (reads, duration) =>
    `${duration ? `${duration} 동안 ` : ''}Slack에서 ${reads}번 조회했어요. 규칙을 주고 할 일을 받은 건 Pacenote의 도구예요.`,
  failed: (n) => `${n}건 실패`,
  notKept:
    'Slack이 돌려준 내용은 내 메시지라서 남기지 않아요. 기록에는 어떤 도구가 언제, 얼마 동안 실행됐는지만 남아요.',

  noRules: '이 모으기는 규칙을 받지 못했어요.',
  rulesLabel: 'Pacenote가 전달한 것 (collect_context)',
}

export const text: Record<Locale, typeof en> = { en, ko }
