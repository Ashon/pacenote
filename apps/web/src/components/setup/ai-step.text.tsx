import type { Locale } from '@src/i18n/locale'
import { josa } from '@src/i18n/korean'
import type { ReactNode } from 'react'

const en = {
  /** Each service's plans that come with its CLI */
  plans: {
    claude: 'Pro, Max, Team or Enterprise',
    codex: 'Plus, Pro or Business, through Codex',
  },
  title: 'Which AI service do you already use?',
  lead: "Pace answers with your own subscription, through that service's command-line tool. Pacenote doesn't bill you or manage the account.",
  checkAgain: 'Check again',
  signInFirst: 'Sign in to one of them first',
  use: (service: string) => `Use ${service}`,
  continue: 'Continue',
  looking: 'Looking for Claude Code and Codex on this Mac',
  serviceLabel: 'AI service',
  /**
   * Where connectors stay (service: the one chosen, if any), and, when the
   * other is signed in too (other), that it takes over at a limit
   */
  note: (service: string | undefined, other?: string) =>
    `Connectors and account settings stay in ${service ?? 'your AI service'}. Pacenote doesn't set them up or change them.${other ? ` With both here, ${other} takes over Todo and Recap when ${service} is at its limit.` : ''}`,
  modelAndLimit: 'Model and time limit',
  model: 'Model',
  modelPlaceholder: 'Leave empty for the default',
  timeLimit: 'Time limit (seconds)',
  signedIn: 'Signed in',
  notOnThisMac: 'Not on this Mac',
  tooOldChip: 'Too old',
  notSignedIn: 'Not signed in',
  /** code: the command and its version */
  found: (code: ReactNode): ReactNode => <>Found {code} on this Mac</>,
  installThen: 'Install it, then check again.',
  howToInstall: (command: string) => `How to install ${command}`,
  tooOld: (command: string, version: string) =>
    `${command} ${version} is too old for Pace. Update it, then check again.`,
  signInHint:
    'Sign in from Terminal with this, and Pacenote sees it when you come back.',
}

const ko: typeof en = {
  plans: {
    claude: 'Pro, Max, Team, Enterprise',
    codex: 'Codex로 쓰는 Plus, Pro, Business',
  },
  title: '이미 쓰고 있는 AI 서비스는 무엇인가요?',
  lead: 'Pace는 그 서비스의 명령줄 도구를 거쳐 내 구독으로 답변해요. Pacenote는 요금을 청구하거나 계정을 관리하지 않아요.',
  checkAgain: '다시 확인',
  signInFirst: '먼저 둘 중 하나에 로그인하세요',
  use: (service) => `${service} 사용`,
  continue: '계속',
  looking: '이 Mac에서 Claude Code와 Codex를 찾는 중',
  serviceLabel: 'AI 서비스',
  note: (service, other) =>
    `커넥터와 계정 설정은 ${service ?? '쓰고 있는 AI 서비스'}에 그대로 있어요. Pacenote는 이를 설정하거나 바꾸지 않아요.${other && service ? ` 둘 다 있으니 ${service} 사용 한도에 이르면 할 일과 회고는 ${other}에서 이어서 해요.` : ''}`,
  modelAndLimit: '모델과 시간 제한',
  model: '모델',
  modelPlaceholder: '비워 두면 기본값',
  timeLimit: '시간 제한(초)',
  signedIn: '로그인됨',
  notOnThisMac: '이 Mac에 없음',
  tooOldChip: '버전이 낮음',
  notSignedIn: '로그인 안 됨',
  found: (code) => <>이 Mac에서 찾았어요: {code}</>,
  installThen: '설치한 뒤 다시 확인하세요.',
  howToInstall: (command) => `${command} 설치 방법`,
  tooOld: (command, version) =>
    `${josa(`${command} ${version}`.trim(), '은/는')} Pace에 쓰기에는 오래된 버전이에요. 업데이트한 뒤 다시 확인하세요.`,
  signInHint:
    '터미널에서 이 명령으로 로그인하세요. 돌아오면 Pacenote가 알아차려요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
