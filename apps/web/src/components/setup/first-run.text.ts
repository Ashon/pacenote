import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'

const en = {
  title: 'Set up Pacenote',
  stepsLabel: 'Setup steps',
  steps: {
    ai: 'Your AI',
    sources: 'Where your work is',
    look: 'A first look',
  },
  aiLead:
    "Pacenote gathers your tasks and writes your recaps with your own subscription, through that service's command-line tool. It doesn't bill you or manage the account.",
  sourcesTitle: 'Where your work is',
  sourcesLead:
    'Pacenote reads these, read only, and keeps what it finds on this Mac.',
  slack: 'Slack',
  slackHow: (cli: string) =>
    `Read through ${cli}'s own Slack connector: mentions, DMs and the channels you are in. Pacenote holds no Slack token.`,
  slackConnect: (where: string) =>
    `Connect Slack in ${where} first, if it is not yet.`,
  thisMac: 'This Mac',
  thisMacHow:
    'Your Claude Code, Codex and opencode sessions and your commits, to find the projects you work on.',
  continue: 'Continue',
  fromMac: 'From your other Mac',
  fromMacLead:
    'Pacenote on another of your Macs sends how Todo collects, and the two keep your Todo the same.',
  cancel: 'Cancel',
  fromMacTook:
    'How Todo collects comes from there, and your Todo follows as the two Macs keep it the same. AI sign-in, sessions and folders stay with each Mac.',
  lookTitle: 'A first look',
  lookLead: (cli: string) =>
    `${cli} reads your last 7 days in Slack, read only, for what is asked of you. It takes a minute or two.`,
  collect: 'Collect now',
  reading: (reads: number) =>
    `Reading Slack, read only: ${reads} ${reads === 1 ? 'lookup' : 'lookups'} so far.`,
  found: (added: number, maybe: number) =>
    added + maybe === 0
      ? 'Nothing asked of you in the last 7 days. New asks come with each collection.'
      : `Added ${added} ${added === 1 ? 'task' : 'tasks'}${
          maybe ? ` and ${maybe} ${maybe === 1 ? 'Maybe' : 'Maybes'}` : ''
        }.`,
  noConnector: (cli: string, where: string) =>
    `${cli} has no Slack connector yet, so this look is from this Mac alone. Connect Slack in ${where} when you like; Collect now on Todo reads it from then on.`,
  projects: 'Your projects',
  projectsHow:
    'What your work keeps together: repositories, channels and groups. Fix them later on You.',
  noProjects: 'None yet: they come as Pacenote sees you work.',
  tryAgain: 'Try again',
  openTodo: 'Open Todo',
  looksRight: 'Looks right, open Todo',
  pace: 'Pace in Slack',
  paceHow: 'Optional: Pace answers when you mention it in Slack.',
  setUpPace: 'Set up Pace instead',
}

const ko: typeof en = {
  title: 'Pacenote 초기 설정',
  stepsLabel: '초기 설정 단계',
  steps: {
    ai: '내 AI',
    sources: '일이 있는 곳',
    look: '첫 모으기',
  },
  aiLead:
    'Pacenote는 그 서비스의 명령줄 도구를 거쳐 내 구독으로 할 일을 모으고 회고를 써요. Pacenote는 요금을 청구하거나 계정을 관리하지 않아요.',
  sourcesTitle: '일이 있는 곳',
  sourcesLead: 'Pacenote는 이곳들을 읽기만 하고, 찾은 것은 이 Mac에 둬요.',
  slack: 'Slack',
  slackHow: (cli) =>
    `${cli}의 Slack 커넥터로 읽어요. 멘션, DM, 내가 있는 채널이에요. Pacenote는 Slack 토큰을 갖지 않아요.`,
  slackConnect: (where) => `아직이라면 먼저 ${where}에서 Slack을 연결하세요.`,
  thisMac: '이 Mac',
  thisMacHow:
    '내 Claude Code, Codex, opencode 세션과 커밋이에요. 내가 일하는 프로젝트를 찾는 데 써요.',
  continue: '계속',
  fromMac: '다른 Mac에서 가져오기',
  fromMacLead:
    '다른 Mac의 Pacenote가 할 일 모으기 설정을 보내고, 두 Mac이 할 일을 같게 맞춰요.',
  cancel: '취소',
  fromMacTook:
    '할 일 모으기 설정을 그 Mac에서 가져오고, 두 Mac이 할 일을 맞추면서 할 일이 따라와요. AI 로그인, 세션, 폴더는 Mac마다 따로 있어요.',
  lookTitle: '첫 모으기',
  lookLead: (cli) =>
    `${josa(cli, '이/가')} 지난 7일의 Slack을 읽기만 하며 나에게 온 일을 찾아요. 1~2분 걸려요.`,
  collect: '지금 모으기',
  reading: (reads) => `Slack을 읽기만 하는 중: 지금까지 ${reads}번 찾아봤어요.`,
  found: (added, maybe) =>
    added + maybe === 0
      ? '지난 7일 동안 나에게 온 일이 없어요. 새로 온 일은 모을 때마다 더해져요.'
      : `할 일 ${added}개${maybe ? `와 후보 ${maybe}개` : ''}를 더했어요.`,
  noConnector: (cli, where) =>
    `${josa(cli, '은/는')} 아직 Slack 커넥터가 없어서 이번에는 이 Mac만 봤어요. 원할 때 ${where}에서 Slack을 연결하면, 그때부터 할 일 화면의 지금 모으기가 함께 읽어요.`,
  projects: '내 프로젝트',
  projectsHow:
    '일이 함께 묶이는 곳이에요. 저장소, 채널, 그룹이요. 나중에 나에서 고칠 수 있어요.',
  noProjects: '아직 없어요. 일하는 모습을 보며 생겨요.',
  tryAgain: '다시 시도',
  openTodo: '할 일 열기',
  looksRight: '좋아요, 할 일 열기',
  pace: 'Slack의 Pace',
  paceHow: '선택이에요. Slack에서 Pace를 멘션하면 답해요.',
  setUpPace: '대신 Pace 설정',
}

export const text: Record<Locale, typeof en> = { en, ko }
