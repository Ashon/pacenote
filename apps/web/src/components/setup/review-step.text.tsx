import type { Locale } from '@src/i18n/locale'
import type { ReactNode } from 'react'

const en = {
  elsewhere:
    'Pace is already running elsewhere, such as a terminal. Stop it there, then start it here.',
  didNotStart: 'Pace did not start. Try again.',
  /** message: why, as the sandbox said */
  sandboxCouldNotStart: (message: string) =>
    `The built-in sandbox couldn't start preparing. ${message}`,
  sandboxStopped:
    'Preparing the built-in sandbox stopped, so Pace has nothing to answer in yet.',
  /** name: Claude or Codex */
  signInFirst: (name: string) => `Sign the sandbox in to ${name} first`,
  sayWhoFirst: 'Say who you are first',
  title: 'Review and start Pace',
  lead: 'Check who can ask and what Pace can use. Everything here can be changed later in Settings.',
  back: 'Back',
  waitingForSandbox: (percent: number) =>
    `Waiting for the sandbox, ${percent}%`,
  startingPace: 'Starting Pace',
  tryAgain: 'Try again',
  startOnceReady: 'Start once the sandbox is ready',
  start: 'Start Pace',
  /** step: the step's name, "AI service" */
  changeStep: (step: string) => `Change ${step}`,
  /** mac: your other Mac's name */
  fromMac: (mac: string) => `From ${mac}`,
  fromMacWhat:
    "Your Slack app, who Pace answers and how Todo collects. The AI and where it runs are this Mac's own, chosen in the steps before.",
  fromMacFollows:
    "Your Macs: Pace follows the Mac you're using. When you start Pace here, it moves to this Mac.",
  whoCanAsk: 'Who can ask Pace',
  moreThanOne:
    'Pace answers only you now, and the settings name more than one person.',
  unknown: "Pace doesn't know who you are yet.",
  showItsYou: "Show Pace it's you",
  onlyYou:
    "Only you. Teammates each pair a Pace of their own through your team's hub.",
  publicOnly:
    'Pace answers only in public channels. Private channels and direct messages are refused.',
  aiService: 'AI service',
  /** service: Claude or ChatGPT; signedIn: undefined when not known */
  serviceState: (service: string, signedIn?: boolean) =>
    `${service}${signedIn === undefined ? '' : signedIn ? ', signed in' : ', not signed in'}`,
  runsIn: 'Runs in',
  sandbox: 'Built-in sandbox',
  ready: 'Ready',
  preparing: (percent: number) => `Preparing, ${percent}%`,
  stopped: 'Stopped',
  thisMac: 'This Mac',
  noIsolation: 'No isolation',
  throughHub: (url: string) => `Through the hub at ${url}`,
  ownApp: 'Your own Slack app',
  diagrams: 'Diagrams',
  diagramsWhat:
    'Mermaid and chart blocks in answers become images, made in the sandbox',
  opsTools: 'Tools',
  opsOff:
    'No connections yet. GitHub, Jira, Kubernetes and SSH are in Settings > Tools when you need them.',
  runHistory: 'Run history',
  /** path: the data folder */
  keptIn: (path: ReactNode): ReactNode => <>Kept on this Mac, in {path}</>,
  you: 'You',
  change: 'Change',
}

const ko: typeof en = {
  elsewhere:
    '터미널 같은 다른 곳에서 Pace가 이미 실행 중이에요. 그곳에서 중지한 뒤 여기서 시작하세요.',
  didNotStart: 'Pace가 시작되지 않았어요. 다시 시도하세요.',
  sandboxCouldNotStart: (message) =>
    `내장 샌드박스 준비를 시작하지 못했어요. ${message}`,
  sandboxStopped: '내장 샌드박스 준비가 멈춰서 Pace가 아직 답변할 곳이 없어요.',
  signInFirst: (name) => `먼저 샌드박스에서 ${name}에 로그인하세요`,
  sayWhoFirst: '먼저 내가 누구인지 알려 주세요',
  title: '확인하고 Pace 시작하기',
  lead: '누가 물어볼 수 있는지, Pace가 무엇을 쓸 수 있는지 확인하세요. 여기 있는 건 모두 나중에 설정에서 바꿀 수 있어요.',
  back: '뒤로',
  waitingForSandbox: (percent) => `샌드박스 기다리는 중, ${percent}%`,
  startingPace: 'Pace 시작하는 중',
  tryAgain: '다시 시도',
  startOnceReady: '샌드박스가 준비되면 시작',
  start: 'Pace 시작',
  changeStep: (step) => `${step} 변경`,
  fromMac: (mac) => `${mac}에서 가져옴`,
  fromMacWhat:
    '내 Slack 앱, Pace가 답변할 사람, 할 일을 모으는 방식이에요. AI와 실행 환경은 앞 단계에서 고른 이 Mac의 것을 써요.',
  fromMacFollows:
    '내 Mac: Pace는 지금 쓰는 Mac을 따라가요. 여기서 Pace를 시작하면 이 Mac으로 옮겨 와요.',
  whoCanAsk: 'Pace에게 물어볼 수 있는 사람',
  moreThanOne:
    '이제 Pace는 나에게만 답변하는데, 설정에는 여러 사람이 들어 있어요.',
  unknown: 'Pace가 아직 내가 누구인지 몰라요.',
  showItsYou: 'Pace에게 나라고 알려 주기',
  onlyYou:
    '나만 물어볼 수 있어요. 팀원은 팀 허브를 통해 각자 자기 Pace를 페어링해요.',
  publicOnly: 'Pace는 공개 채널에서만 답변해요. 비공개 채널과 DM은 거절해요.',
  aiService: 'AI 서비스',
  serviceState: (service, signedIn) =>
    `${service}${signedIn === undefined ? '' : signedIn ? ', 로그인됨' : ', 로그인 안 됨'}`,
  runsIn: '실행 환경',
  sandbox: '내장 샌드박스',
  ready: '준비됨',
  preparing: (percent) => `준비 중, ${percent}%`,
  stopped: '중지됨',
  thisMac: '이 Mac',
  noIsolation: '격리 없음',
  throughHub: (url) => `${url} 허브를 통해 연결`,
  ownApp: '내 Slack 앱',
  diagrams: '다이어그램',
  diagramsWhat:
    '답변에 있는 Mermaid와 차트 블록을 샌드박스에서 이미지로 만들어요',
  opsTools: '도구',
  opsOff:
    '아직 연결이 없어요. GitHub, Jira, Kubernetes, SSH는 필요할 때 설정 > 도구에서 연결하세요.',
  runHistory: '실행 기록',
  keptIn: (path) => <>이 Mac의 {path}에 보관해요</>,
  you: '나',
  change: '변경',
}

export const text: Record<Locale, typeof en> = { en, ko }
