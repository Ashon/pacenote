import type { core } from 'zod'
import type { Locale } from './i18n/locale.js'

const en = {
  /** What a setting's value must be, by the rule it breaks */
  rules: {
    slackUserId: 'Must be a Slack user ID (U... or W...)',
    botTokenPrefix: 'Must be a bot token starting with xoxb-',
    appTokenPrefix: 'Must be an app token starting with xapp-',
    secureUrl: 'Must be an https URL (http only for localhost)',
    hubUrl:
      'Must be an https URL (http only on your own network: a private address or a name like hub.local)',
    hubTokenFormat: 'Must be the token pairing stored (64 hex characters)',
    timeZone: 'Must be a time zone name, such as Asia/Seoul or UTC',
    memorySize: 'Must be a size such as 2g or 1536m',
    cpuCount: 'Must be a CPU count (e.g. 2, 1.5)',
  },
  /** The heading over each setting's issue, a line apiece */
  invalid: (issues: string) => `Some settings are invalid.\n${issues}`,
  referenceDir: (dir: string) =>
    `The reference directory must be an absolute path to an existing folder: ${dir}`,
  mentionAnyone:
    'MENTION_ANYONE is gone: Pace answers only you. Remove it from the settings file.',
  whoYouAre:
    'Say who you are: add your own Slack member ID (in Slack, your profile, then ⋮, Copy member ID). Pace answers only you.',
  oneMember:
    'Add one Slack member ID, your own: Pace answers only you. Teammates each run their own Pace through the team hub.',
  hubUrl: 'Connecting through the team hub needs the hub URL.',
  notPaired:
    'This desktop is not paired with the hub yet. Connect in Settings > Messengers > Slack.',
  botToken: 'Your own Slack app needs its bot token.',
  appToken: 'Your own Slack app needs its app token.',
  opsNeedSandbox:
    'Connections in Settings > Tools need the built-in sandbox: set the run environment to the built-in sandbox.',
  /**
   * zod's own messages (a number out of range, a value not among the
   * choices): English keeps zod's, by giving none
   */
  zodIssue: ((): undefined => undefined) as core.$ZodErrorMap,
}

/** The rule a zod issue broke, in Korean */
const zodIssueKo: core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.expected === 'int') return '정수여야 해요'
      if (issue.expected === 'number') return '숫자여야 해요'
      return '값이 올바르지 않아요'
    case 'too_small': {
      const min = String(issue.minimum)
      if (issue.origin === 'string') return `${min}자 이상이어야 해요`
      return issue.inclusive ? `${min} 이상이어야 해요` : `${min}보다 커야 해요`
    }
    case 'too_big': {
      const max = String(issue.maximum)
      if (issue.origin === 'string') return `${max}자 이하여야 해요`
      return issue.inclusive ? `${max} 이하여야 해요` : `${max}보다 작아야 해요`
    }
    case 'invalid_value':
      return `${issue.values.map((value) => JSON.stringify(value)).join(', ')} 중 하나여야 해요`
    case 'invalid_format':
      if (issue.format === 'url') return '올바른 URL이 아니에요'
      if (issue.format === 'email') return '올바른 이메일 주소가 아니에요'
      return '형식이 올바르지 않아요'
    default:
      return '값이 올바르지 않아요'
  }
}

const ko: typeof en = {
  rules: {
    slackUserId: 'Slack 사용자 ID여야 해요 (U... 또는 W...)',
    botTokenPrefix: 'xoxb-로 시작하는 봇 토큰이어야 해요',
    appTokenPrefix: 'xapp-로 시작하는 앱 토큰이어야 해요',
    secureUrl: 'https URL이어야 해요 (http는 localhost만)',
    hubUrl:
      'https URL이어야 해요 (http는 사내망에서만: 사설 IP나 hub.local 같은 이름)',
    hubTokenFormat: '페어링으로 저장된 토큰이어야 해요 (16진수 64자)',
    timeZone: 'Asia/Seoul, UTC 같은 시간대 이름이어야 해요',
    memorySize: '2g, 1536m 같은 크기여야 해요',
    cpuCount: 'CPU 개수여야 해요 (예: 2, 1.5)',
  },
  invalid: (issues) => `올바르지 않은 설정이 있어요.\n${issues}`,
  referenceDir: (dir) =>
    `참고 디렉터리는 이미 있는 폴더의 절대 경로여야 해요: ${dir}`,
  mentionAnyone:
    'MENTION_ANYONE 설정은 이제 없어요. Pace는 나에게만 답해요. 설정 파일에서 지우세요.',
  whoYouAre:
    '내가 누구인지 알려 주세요. 내 Slack 멤버 ID를 추가하세요 (Slack에서 내 프로필 > ⋮ > 멤버 ID 복사). Pace는 나에게만 답해요.',
  oneMember:
    'Slack 멤버 ID는 내 것 하나만 추가하세요. Pace는 나에게만 답해요. 팀원은 각자 팀 허브를 거쳐 자기 Pace를 실행해요.',
  hubUrl: '팀 허브로 연결하려면 허브 URL이 필요해요.',
  notPaired:
    '이 데스크톱은 아직 허브와 페어링하지 않았어요. 설정 > 메신저 > Slack에서 연결하세요.',
  botToken: '내 Slack 앱에는 봇 토큰이 필요해요.',
  appToken: '내 Slack 앱에는 앱 토큰이 필요해요.',
  opsNeedSandbox:
    '설정 > 도구의 연결에는 내장 샌드박스가 필요해요. 실행 환경을 내장 샌드박스로 바꾸세요.',
  zodIssue: zodIssueKo,
}

export const text: Record<Locale, typeof en> = { en, ko }
