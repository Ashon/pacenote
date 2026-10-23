import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'

/** A task in a sentence: its title quoted, or "a task" */
const it = (title?: string) => (title ? `“${title}”` : 'a task')

const en = {
  title: 'Todo',
  noDesktop: 'Tasks are gathered by the desktop app.',
  /** The header: open tasks, and when (and on which Mac) they were collected */
  meta: (open: number, collected?: string, mac?: string) =>
    `${open} open${
      collected ? ` · collected ${collected}${mac ? ` on ${mac}` : ''}` : ''
    }`,
  leaveOutOffer: (count: number, label: string) =>
    `You dismissed ${count} tasks from ${label} as not for you. Leave ${label} out?`,
  leaveOut: 'Leave it out',
  notNow: 'Not now',
  maybeNote:
    'Guesses Pace is not sure about. They stay out of the list until you keep one.',
  nothingOpen:
    'Nothing open. The next collection reads what is new since this one.',
  nothingYet: 'Nothing yet. A first collection reads the last 7 days.',
  noMaybes: 'No Maybes.',
  nothingSettled: 'Nothing settled in the last 14 days.',
  dismissRate: (percent: number) =>
    `You dismissed ${percent}% of the tasks you settled. Above about 30%, Pace is picking too loosely.`,
  tabOpen: 'Open',
  tabMaybe: 'Maybe',
  tabDone: 'Done',
  tabCollections: 'Collections',
  showMore: (n: number) => `Show ${n} more`,
  newTasks: (n: number) => `${n} new ${n === 1 ? 'task' : 'tasks'}`,

  // Collect now
  collectingOn: (mac: string) => `Collecting on ${mac}`,
  collecting: 'Collecting',
  stop: 'Stop',
  collectNow: 'Collect now',

  // What an AI tool does with your tasks over MCP
  anAiTool: 'An AI tool',
  liveCollecting: (tool: string, added?: number) =>
    `${tool} is collecting your tasks${added ? `: ${added} found so far` : ''}.`,
  liveLook: (tool: string, title?: string) =>
    `${tool} is working on ${it(title)}.`,
  liveUpdate: (tool: string, title?: string) => `${tool} updated ${it(title)}.`,
  liveClose: (tool: string, title?: string) => `${tool} closed ${it(title)}.`,
  liveWrapUp: (tool: string, title?: string) =>
    `${tool} wrote how ${it(title)} ended.`,
  liveFollowUp: (tool: string, title?: string) =>
    `${tool} kept ${it(title)} for later.`,
  liveAdded: (tool: string, n: number) =>
    `${tool} added ${n} ${n === 1 ? 'task' : 'tasks'}.`,
  liveNothing: (tool: string) => `${tool} found nothing new to add.`,

  // The app's collection
  yourAi: 'Your AI',
  reading: (cli: string, reads: number) =>
    `${cli} is reading Slack, read only: ${reads} lookups so far.`,
  starting: (cli: string) =>
    `Starting ${cli}: Pacenote gives the collection its rules.`,
  elsewhere: (mac: string) =>
    `Collecting on ${mac}. Its tasks come here when it is done.`,
  /** How the last one ended: what it added, where, and what it left out */
  collected: (added: number, maybe: number, mac?: string, skipped?: number) => {
    const found = [
      added && `${added} ${added === 1 ? 'task' : 'tasks'}`,
      maybe && `${maybe} ${maybe === 1 ? 'Maybe' : 'Maybes'}`,
    ].filter(Boolean)
    const where = mac ? ` on ${mac}` : ''
    const line = found.length
      ? `Added ${found.join(' and ')}${where}.`
      : `Nothing new to add${where}.`
    return skipped ? `${line} ${skipped} left out by your settings.` : line
  },
  spent: (tokens: string, reads: number, cli?: string) =>
    `${tokens} new tokens over ${reads} Slack lookups${cli ? ` by ${cli}` : ''}.`,
  signIn: (cli: string) => `Sign in to ${cli}`,
  /** After why the chosen CLI could not ("Claude Code was signed out") */
  tookOver: (switched: string, cli: string) =>
    `${switched}, so ${cli} took over.`,
  collectedInstead: (switched: string, cli: string) =>
    `${switched}, so ${cli} collected.`,
  couldNotEither: (switched: string, cli: string) =>
    `${switched}, and ${cli} could not either.`,

  // Collections
  recentSummary: (n: number, tokens: string) =>
    `Last 7 days · ${n} ${n === 1 ? 'collection' : 'collections'} · ${tokens} new`,
  noCollections: 'No collections in the last 7 days.',
  newTokens: (tokens: string) => `${tokens} new`,
  openRun: "Open this collection's run",
  trigger: { now: 'Collect now' },
  /** "23 lookups · 2 tasks, 1 Maybe" */
  note: (reads: number, added: number, maybe: number) => {
    const found = [
      added && `${added} ${added === 1 ? 'task' : 'tasks'}`,
      maybe && `${maybe} ${maybe === 1 ? 'Maybe' : 'Maybes'}`,
    ].filter(Boolean)
    return `${reads} ${reads === 1 ? 'lookup' : 'lookups'} · ${
      found.length ? found.join(', ') : 'Nothing new'
    }`
  },

  // Before Todo is turned on
  setup:
    'Pacenote has your AI read Slack with its own Slack connector, and keeps a short list here of what people asked of you and what you said you would do. Pacenote holds no Slack token for this, and nothing is posted anywhere.',
  needsTitle: 'What it needs',
  needs:
    'Claude Code or Codex on this Mac, signed in, with Slack connected to your claude.ai account or ChatGPT. With both, one takes over when the other is at its limit.',
  readTitle: 'What is read',
  read: 'Messages that mention you, threads you took part in, and what you said you would do, since the last collection; DMs only if you count them. Read only: the collection cannot post or react.',
  howTitle: 'How to collect',
  how: 'Collect now on this screen. Pacenote gives the collection its rules: precision first, and anything unsure is a Maybe.',
  turnOn: 'Turn on in Settings',
}

/** A task in a sentence, followed by 을, 의 or 에서 as 할 일 takes them */
const koIt = (title?: string) => (title ? `“${title}” 할 일` : '할 일')

/**
 * Why the chosen CLI could not ("Claude Code 사용 한도 도달"), ended to go
 * before a sentence of its own
 */
const sentence = (line: string) => line.replace(/[.。]\s*$/, '')

const ko: typeof en = {
  title: '할 일',
  noDesktop: '할 일은 데스크톱 앱이 모아요.',
  meta: (open, collected, mac) =>
    `열린 할 일 ${open}개${
      collected ? ` · ${mac ? `${mac}에서 ` : ''}${collected} 모음` : ''
    }`,
  leaveOutOffer: (count, label) =>
    `${label}에서 온 할 일 ${count}개를 내 일 아님으로 제외했어요. ${josa(label, '을/를')} 모으기에서 뺄까요?`,
  leaveOut: '빼기',
  notNow: '나중에',
  maybeNote:
    'Pace가 확신하지 못한 할 일 후보예요. 유지하기 전까지는 목록에 넣지 않아요.',
  nothingOpen:
    '열린 할 일이 없어요. 다음 모으기는 이번 이후에 새로 온 것만 읽어요.',
  nothingYet: '아직 없어요. 첫 모으기는 지난 7일을 읽어요.',
  noMaybes: '후보가 없어요.',
  nothingSettled: '지난 14일 동안 끝내거나 제외한 할 일이 없어요.',
  dismissRate: (percent) =>
    `끝내거나 제외한 할 일 중 ${percent}%를 제외했어요. 30%를 넘으면 Pace가 너무 느슨하게 고르고 있는 거예요.`,
  tabOpen: '열림',
  tabMaybe: '후보',
  tabDone: '완료',
  tabCollections: '모으기 기록',
  showMore: (n) => `${n}개 더 보기`,
  newTasks: (n) => `새 할 일 ${n}개`,

  collectingOn: (mac) => `${mac}에서 모으는 중`,
  collecting: '모으는 중',
  stop: '중지',
  collectNow: '지금 모으기',

  anAiTool: 'AI 도구',
  liveCollecting: (tool, added) =>
    `${josa(tool, '이/가')} 할 일을 모으고 있어요${
      added ? `. 지금까지 ${added}개 찾았어요` : ''
    }.`,
  liveLook: (tool, title) =>
    `${josa(tool, '이/가')} ${koIt(title)}을 작업하고 있어요.`,
  liveUpdate: (tool, title) =>
    `${josa(tool, '이/가')} ${koIt(title)}을 수정했어요.`,
  liveClose: (tool, title) =>
    `${josa(tool, '이/가')} ${koIt(title)}을 닫았어요.`,
  liveWrapUp: (tool, title) =>
    `${josa(tool, '이/가')} ${koIt(title)}의 결과를 정리했어요.`,
  liveFollowUp: (tool, title) =>
    `${josa(tool, '이/가')} ${koIt(title)}을 후속 작업으로 남겼어요.`,
  liveAdded: (tool, n) => `${josa(tool, '이/가')} 할 일 ${n}개를 추가했어요.`,
  liveNothing: (tool) =>
    `${josa(tool, '이/가')} 새로 추가할 할 일을 찾지 못했어요.`,

  yourAi: '내 AI',
  reading: (cli, reads) =>
    `${josa(cli, '이/가')} Slack을 읽고 있어요(읽기 전용). 지금까지 ${reads}번 조회했어요.`,
  starting: (cli) => `${cli} 시작 중: Pacenote가 모으기 규칙을 전달해요.`,
  elsewhere: (mac) => `${mac}에서 모으는 중이에요. 끝나면 할 일이 여기로 와요.`,
  collected: (added, maybe, mac, skipped) => {
    const found = [
      added && `할 일 ${added}개`,
      maybe && `후보 ${maybe}개`,
    ].filter(Boolean)
    const where = mac ? `${mac}에서 ` : ''
    const line = found.length
      ? `${where}${found.join(', ')}를 추가했어요.`
      : `${where}새로 추가할 게 없었어요.`
    return skipped ? `${line} 설정에 따라 ${skipped}개를 뺐어요.` : line
  },
  spent: (tokens, reads, cli) =>
    `Slack 조회 ${reads}번, 새 토큰 ${tokens}${cli ? ` (${cli})` : ''}.`,
  signIn: (cli) => `${cli}에 로그인`,
  tookOver: (switched, cli) =>
    `${sentence(switched)}. ${josa(cli, '이/가')} 이어받았어요.`,
  collectedInstead: (switched, cli) =>
    `${sentence(switched)}. ${josa(cli, '이/가')} 대신 모았어요.`,
  couldNotEither: (switched, cli) =>
    `${sentence(switched)}. ${cli}도 모으지 못했어요.`,

  recentSummary: (n, tokens) =>
    `지난 7일 · 모으기 ${n}번 · 신규 토큰 ${tokens}`,
  noCollections: '지난 7일 동안 모으기가 없어요.',
  newTokens: (tokens) => `신규 ${tokens}`,
  openRun: '이 모으기의 실행 열기',
  trigger: { now: '지금 모으기' },
  note: (reads, added, maybe) => {
    const found = [
      added && `할 일 ${added}개`,
      maybe && `후보 ${maybe}개`,
    ].filter(Boolean)
    return `조회 ${reads}번 · ${found.length ? found.join(', ') : '새로운 것 없음'}`
  },

  setup:
    'Pacenote는 내 AI가 자기 Slack 커넥터로 Slack을 읽게 하고, 사람들이 내게 부탁한 일과 내가 하겠다고 한 일을 여기에 짧게 정리해 둬요. 이를 위해 Pacenote가 Slack 토큰을 갖지는 않고, 어디에도 글을 올리지 않아요.',
  needsTitle: '필요한 것',
  needs:
    '이 Mac에 Claude Code나 Codex가 로그인되어 있고, claude.ai 계정이나 ChatGPT에 Slack이 연결되어 있어야 해요. 둘 다 있으면 한쪽이 사용 한도에 걸릴 때 다른 쪽이 이어받아요.',
  readTitle: '읽는 것',
  read: '지난 모으기 이후 나를 멘션한 메시지, 내가 참여한 스레드, 내가 하겠다고 한 일을 읽어요. DM은 포함하도록 설정했을 때만 읽어요. 읽기 전용이라 글을 올리거나 반응을 남기지 못해요.',
  howTitle: '모으는 방법',
  how: '이 화면에서 지금 모으기를 누르세요. Pacenote가 모으기 규칙을 전달해요. 정확성이 먼저이고, 확실하지 않은 건 후보로 둬요.',
  turnOn: '설정에서 켜기',
}

export const text: Record<Locale, typeof en> = { en, ko }
