import type { Locale } from '@src/i18n/locale'
import { josa } from '@src/i18n/korean'
import type { ReactNode } from 'react'

/** Sets a name in a sentence in bold: a menu path, a button */
type Bold = (text: string) => ReactNode

const en = {
  // Choosing how Pace reaches Slack
  codeExpired: 'The code expired before it came back. Get a new one.',
  continue: 'Continue',
  cancel: 'Cancel',
  /** name: your other Mac's */
  waitingFor: (name: string) => `Waiting for ${name}`,
  setUpOwnApp: 'Set up your own app',
  waitingForSlack: 'Waiting for Slack',
  gettingCode: 'Getting a code',
  pairAgain: 'Pair again',
  /** name: a Slack handle, without the @ */
  continueAs: (name: string) => `Continue as @${name}`,
  getNewCode: 'Get a new code',
  getPairingCode: 'Get a pairing code',
  title: 'Connect Pace to Slack',
  lead: 'Pace answers when someone mentions it in a public channel of your workspace.',
  back: 'Back',
  connectionLabel: 'How Pace reaches Slack',
  hubTitle: "Join your team's hub",
  forTeams: 'For teams',
  hubWhat:
    'Someone on your team runs a Pacenote hub. You pair this Mac once, and the Slack tokens stay on the hub.',
  appCardTitle: 'Use your own Slack app',
  appWhat:
    "Create an app from the Pacenote manifest and bring back two tokens. Best when you're the only one using Pace.",
  macTitle: 'Connect to your other Mac',
  alreadySetUp: 'Already set up',
  macWhat:
    'Pacenote is set up on another of your Macs. Bring its Slack app and who you are from there; nothing to create.',
  hubAddress: 'Hub address',
  cancelledNotMe: 'Cancelled. If someone else sent your code, get a new one.',

  // Your other Mac
  connectedTo: (name: string) => `Connected to ${name}`,
  yourSlackApp: 'Your Slack app',
  /** name: who Pace answers there */
  paceAnswers: (name: string) => `Pace answers ${name}`,
  todoSettings: 'Todo settings: your names, groups and channels left out',
  followMac: "Follow the Mac you're using: on",
  stayWithEachMac:
    'AI sign-in, the sandbox, ops tools and folders stay with each Mac.',
  sameNumber: (name: string) =>
    `Check that ${name} shows the same number, then click Allow there.`,
  openAddMac: (b: Bold): ReactNode => (
    <>
      On your other Mac, open {b('Pacenote > Settings > Macs')} and click{' '}
      {b('Add a Mac')}.
    </>
  ),
  macRetrying: (name: string) =>
    `Waiting for ${name}. Check that Add a Mac is open there.`,
  macConnecting: (name: string) => `Connecting to ${name}…`,
  connect: 'Connect',
  looking: 'Looking for it on this network…',
  tryAgain: 'Try again',
  macAddressLabel: 'Address of your other Mac',
  macAddressPlaceholder: '100.68.0.12 or macbook-pro.local',
  enterAddress: 'Not on this network? Enter its address',

  // Pairing with the hub
  pairedHere: (name: string) => `This Mac is paired with this hub as @${name}.`,
  pairWhat:
    'You get a code to send to Pace in Slack. Your mentions then come to this Mac.',
  gettingCodeFromHub: 'Getting a code from the hub',
  sendThis: 'In a channel Pace is in, send this. It expires in 10 minutes.',
  waitingForMention: 'Waiting for your mention',
  /** name: a Slack handle, without the @ */
  sentTheCode: (name: string) => `@${name} sent the code`,
  notMe: 'Not me',
  yesMe: "Yes, that's me",
  isThisYou: 'Is this you?',

  // A token's shape, before Slack is asked
  botTokenHere: 'This is the bot token. It goes in the next field.',
  appTokenStart: 'App-Level Tokens start with xapp-.',
  appTokenHere: 'This is the App-Level Token. It goes in the field above.',
  userToken:
    'This is a user token. Copy the Bot User OAuth Token, which starts with xoxb-.',
  botTokenStart: 'Bot tokens start with xoxb-.',

  // What Slack said about a token
  notRecognized:
    "Slack doesn't recognize this token. Copy it again from your app.",
  appRevoked: 'This token was revoked. Generate a new App-Level Token.',
  botRevoked:
    'This token was revoked. Reinstall the app and copy the new bot token.',
  appRemoved:
    'The app was removed from the workspace. Install it again and copy the new token.',
  notAppToken: "This isn't an App-Level Token. Those start with xapp-.",
  notBotToken: "This isn't a bot token. Those start with xoxb-.",
  unreachable: "Couldn't reach Slack. Check your network.",
  /** scopes: the bot scopes the app lacks */
  missingScopes: (scopes: string) =>
    `The app is missing permissions (${scopes}). Create it from the manifest, or add them and reinstall it.`,
  turnedDown: 'Slack turned this token down.',
  valid: 'Valid',
  /** team: the workspace the bot token is for */
  validIn: (team: string) => `Valid · ${team}`,
  mismatch:
    'These tokens come from two different apps. Copy both from the same one.',

  // Your own Slack app's tokens
  ownApp: 'Your own Slack app',
  createAppTitle: 'Create your Slack app',
  appLead:
    "Pacenote fills in the app's name and permissions. You create it in your workspace and bring back two tokens.",
  connectSlack: 'Connect Slack',
  createApp: 'Create the app',
  createAppWhat:
    'Opens Slack with the Pacenote manifest filled in. Pick your workspace and choose Create.',
  opened: 'Opened in your browser',
  createSlackApp: 'Create the Slack app',
  appToken: 'App-Level Token',
  /** scope: connections:write */
  appTokenWhere: (scope: ReactNode): ReactNode => (
    <>
      In the app's Basic Information, under App-Level Tokens, choose Generate
      Token and Scopes, add {scope}, and copy the token.
    </>
  ),
  botToken: 'Bot token',
  botTokenWhere:
    'Under Install App, install it to your workspace, then copy the Bot User OAuth Token.',
  /** link: a link to your Slack apps, around its words */
  madeAlready: (link: (label: string) => ReactNode): ReactNode => (
    <>Made the app already? Its settings are in {link('your Slack apps')}.</>
  ),
  adminApproval:
    "Does your workspace ask an admin to approve apps? Slack sends them the request when you install. The tokens you enter here are kept, so you can come back once it's approved.",
  /** hint: the end of the saved token, as Settings shows it */
  saved: (hint: string) => `Saved (${hint})`,
  checking: 'Checking',
  notValid: 'Not valid',

  // "@Pace it's me"
  itsMeTitle: "Show Pace it's you",
  itsMeLead:
    'Pace answers only you. Mention it once in Slack so it knows which account is yours.',
  invite: 'Invite Pace to a public channel',
  mentionThere: 'Mention it there',
  /** What to type in Slack: any mention does */
  itsMe: "@Pace it's me",
  /** name: a Slack handle, without the @; channel: #general */
  mentionedIn: (name: string, channel: string) =>
    `@${name} mentioned Pace in ${channel} just now`,
  waitingOwnAccount: 'Waiting for your mention. Send it from your own account.',
  connectingToSlack: 'Connecting to Slack',
  itsMeHint:
    'Nothing yet? Check that Pace is in that channel, and pick Pace from the list that opens as you type @Pace, so the message mentions it.',
  whileOpen:
    'While this is open, Pace answers no one: it only notes who mentions it and tells that person alone to confirm here. After that, it answers only you.',
}

const ko: typeof en = {
  codeExpired: '코드가 돌아오기 전에 만료됐어요. 새 코드를 받으세요.',
  continue: '계속',
  cancel: '취소',
  waitingFor: (name) => `${name} 기다리는 중`,
  setUpOwnApp: '내 앱 설정',
  waitingForSlack: 'Slack 기다리는 중',
  gettingCode: '코드 받는 중',
  pairAgain: '다시 페어링',
  continueAs: (name) => `${josa(`@${name}`, '으로/로')} 계속`,
  getNewCode: '새 코드 받기',
  getPairingCode: '페어링 코드 받기',
  title: 'Pace를 Slack에 연결하세요',
  lead: '워크스페이스의 공개 채널에서 누군가 Pace를 멘션하면 Pace가 답변해요.',
  back: '뒤로',
  connectionLabel: 'Pace가 Slack에 연결하는 방식',
  hubTitle: '팀 허브에 참여',
  forTeams: '팀용',
  hubWhat:
    '팀의 누군가가 Pacenote 허브를 운영해요. 이 Mac을 한 번만 페어링하면 되고, Slack 토큰은 허브에 그대로 있어요.',
  appCardTitle: '내 Slack 앱 사용',
  appWhat:
    'Pacenote 매니페스트로 앱을 만들고 토큰 두 개를 가져와요. Pace를 나 혼자 쓸 때 가장 좋아요.',
  macTitle: '내 다른 Mac에 연결',
  alreadySetUp: '이미 설정됨',
  macWhat:
    '다른 Mac에 Pacenote가 설정돼 있어요. 그 Mac에서 Slack 앱과 내 정보를 가져와요. 새로 만들 건 없어요.',
  hubAddress: '허브 주소',
  cancelledNotMe:
    '취소했어요. 다른 사람이 내 코드를 보냈다면 새 코드를 받으세요.',

  connectedTo: (name) => `${name}에 연결됨`,
  yourSlackApp: '내 Slack 앱',
  paceAnswers: (name) => `Pace가 답변할 사람: ${name}`,
  todoSettings: '할 일 설정: 내 이름, 그룹, 채널은 빼고',
  followMac: '지금 쓰는 Mac 따라가기: 켬',
  stayWithEachMac:
    'AI 로그인, 샌드박스, 운영 도구, 폴더는 Mac마다 따로 있어요.',
  sameNumber: (name) =>
    `${name}에 같은 숫자가 보이는지 확인한 뒤 그곳에서 허용을 클릭하세요.`,
  openAddMac: (b) => (
    <>
      다른 Mac에서 {b('Pacenote > 설정 > 내 Mac')}을 열고 {b('Mac 추가')}를
      클릭하세요.
    </>
  ),
  macRetrying: (name) =>
    `${name} 기다리는 중이에요. 그곳에서 Mac 추가가 열려 있는지 확인하세요.`,
  macConnecting: (name) => `${name}에 연결하는 중…`,
  connect: '연결',
  looking: '이 네트워크에서 찾는 중…',
  tryAgain: '다시 시도',
  macAddressLabel: '다른 Mac의 주소',
  macAddressPlaceholder: '100.68.0.12 또는 macbook-pro.local',
  enterAddress: '이 네트워크에 없나요? 주소 입력',

  pairedHere: (name) =>
    `이 Mac은 ${josa(`@${name}`, '으로/로')} 이 허브와 페어링돼 있어요.`,
  pairWhat:
    'Slack에서 Pace에게 보낼 코드를 받아요. 그러면 내 멘션이 이 Mac으로 와요.',
  gettingCodeFromHub: '허브에서 코드를 받는 중',
  sendThis:
    'Pace가 들어 있는 채널에서 이 메시지를 보내세요. 10분 뒤에 만료돼요.',
  waitingForMention: '내 멘션을 기다리는 중',
  sentTheCode: (name) => `${josa(`@${name}`, '이/가')} 코드를 보냈어요`,
  notMe: '내가 아니에요',
  yesMe: '네, 저예요',
  isThisYou: '본인인가요?',

  botTokenHere: '봇 토큰이에요. 다음 칸에 넣으세요.',
  appTokenStart: 'App-Level Token은 xapp-으로 시작해요.',
  appTokenHere: 'App-Level Token이에요. 위 칸에 넣으세요.',
  userToken:
    '사용자 토큰이에요. xoxb-로 시작하는 Bot User OAuth Token을 복사하세요.',
  botTokenStart: '봇 토큰은 xoxb-로 시작해요.',

  notRecognized: 'Slack이 이 토큰을 알아보지 못해요. 앱에서 다시 복사하세요.',
  appRevoked: '취소된 토큰이에요. 새 App-Level Token을 생성하세요.',
  botRevoked: '취소된 토큰이에요. 앱을 다시 설치하고 새 봇 토큰을 복사하세요.',
  appRemoved:
    '앱이 워크스페이스에서 제거됐어요. 다시 설치하고 새 토큰을 복사하세요.',
  notAppToken:
    'App-Level Token이 아니에요. App-Level Token은 xapp-으로 시작해요.',
  notBotToken: '봇 토큰이 아니에요. 봇 토큰은 xoxb-로 시작해요.',
  unreachable: 'Slack에 연결하지 못했어요. 네트워크를 확인하세요.',
  missingScopes: (scopes) =>
    `앱에 권한(${scopes})이 없어요. 매니페스트로 앱을 만들거나, 권한을 추가하고 다시 설치하세요.`,
  turnedDown: 'Slack이 이 토큰을 거부했어요.',
  valid: '유효함',
  validIn: (team) => `유효함 · ${team}`,
  mismatch: '두 토큰이 서로 다른 앱에서 왔어요. 같은 앱에서 둘 다 복사하세요.',

  ownApp: '내 Slack 앱',
  createAppTitle: 'Slack 앱 만들기',
  appLead:
    'Pacenote가 앱 이름과 권한을 채워 둬요. 워크스페이스에서 앱을 만들고 토큰 두 개를 가져오세요.',
  connectSlack: 'Slack 연결',
  createApp: '앱 만들기',
  createAppWhat:
    'Pacenote 매니페스트가 채워진 Slack이 열려요. 워크스페이스를 고르고 Create를 누르세요.',
  opened: '브라우저에서 열림',
  createSlackApp: 'Slack 앱 만들기',
  appToken: 'App-Level Token',
  appTokenWhere: (scope) => (
    <>
      앱의 Basic Information에서 App-Level Tokens 아래 Generate Token and
      Scopes를 누르고, {scope}를 추가한 뒤 토큰을 복사하세요.
    </>
  ),
  botToken: '봇 토큰',
  botTokenWhere:
    'Install App에서 워크스페이스에 설치한 뒤 Bot User OAuth Token을 복사하세요.',
  madeAlready: (link) => (
    <>앱을 이미 만들었나요? 앱 설정은 {link('내 Slack 앱')}에 있어요.</>
  ),
  adminApproval:
    '워크스페이스에서 앱을 설치하려면 관리자 승인이 필요한가요? 설치할 때 Slack이 관리자에게 요청을 보내요. 여기 입력한 토큰은 저장되니 승인된 뒤에 다시 오면 돼요.',
  saved: (hint) => `저장됨 (${hint})`,
  checking: '확인 중',
  notValid: '유효하지 않음',

  itsMeTitle: 'Pace에게 나라고 알려 주세요',
  itsMeLead:
    'Pace는 나에게만 답변해요. Slack에서 한 번 멘션해서 어느 계정이 내 것인지 알려 주세요.',
  invite: 'Pace를 공개 채널에 초대',
  mentionThere: '그 채널에서 멘션',
  itsMe: '@Pace 저예요',
  mentionedIn: (name, channel) =>
    `${josa(`@${name}`, '이/가')} 방금 ${channel}에서 Pace를 멘션했어요`,
  waitingOwnAccount: '내 멘션을 기다리는 중이에요. 내 계정으로 보내세요.',
  connectingToSlack: 'Slack에 연결하는 중',
  itsMeHint:
    '아직 소식이 없나요? Pace가 그 채널에 있는지 확인하세요. 그리고 @Pace를 입력할 때 열리는 목록에서 Pace를 골라야 메시지가 Pace를 멘션해요.',
  whileOpen:
    '이 화면이 열려 있는 동안 Pace는 누구에게도 답변하지 않아요. 누가 멘션했는지만 기록하고, 그 사람에게만 여기서 확인하라고 알려요. 그 뒤로는 나에게만 답변해요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
