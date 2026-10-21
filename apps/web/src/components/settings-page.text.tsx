import type { ReactNode } from 'react'
import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'

/** A setting's name inside a sentence: "App token" reads "the app token" */
const lowerFirst = (words: string) =>
  words.charAt(0).toLowerCase() + words.slice(1)

const en = {
  /** The app's own sections; Pace's come from the settings fields */
  sections: {
    general: {
      label: 'General',
      help: 'Preferences for this app, and where Pacenote keeps its settings and run history.',
    },
    macs: {
      label: 'Macs',
      help: 'Where Pace answers when you use more than one Mac.',
    },
  },
  nav: { app: 'App', pace: 'Pace' },
  navLabel: 'Settings sections',
  title: 'Settings',
  desktopOnly: 'Settings can be changed in the desktop app.',

  savedRestarted: 'Saved and restarted Pace.',
  savedStarted: 'Saved and started Pace.',
  saved: 'Saved.',
  savedRestart: 'Saved. Restart Pace to apply.',
  savedEnterNext: (saved: string, next: string) =>
    `Saved the ${lowerFirst(saved)}. Enter the ${next.toLowerCase()} next.`,
  savedAddMemberId: (saved: string, group: string) =>
    `Saved the ${lowerFirst(saved)}. Next, add your Slack member ID under ${group}.`,
  savedStartToUse: (saved: string, live: boolean) =>
    `Saved the ${lowerFirst(saved)}. ${live ? 'Restart' : 'Start'} Pace to use it.`,
  restarting: 'Restarting Pace.',
  starting: 'Starting Pace.',
  restartNow: 'Restart now',
  startPace: 'Start Pace',

  teamHub: 'Team hub',
  ownApp: 'Your own app',
  notPaired: 'Not paired',
  notConnected: 'Not connected',
  hintSetUp: 'Set up',
  hintUpdate: 'Update',
  hintOff: 'Off',
  hintNeedsSetup: 'Needs setup',
  stillNeeded: (labels: string[]) => `Still needed: ${labels.join(', ')}`,
  checkConnection: 'Check connection',
  hubDisconnected: 'Disconnected this desktop from the hub.',
  sandboxSignedIn: 'Signed in inside the sandbox. Restart Pace to use it.',

  builtInSandbox: 'The built-in sandbox',
  builtInOn:
    'Requests run in the built-in sandbox, and the broker in a VM of its own.',
  builtInOff: 'Choose the built-in sandbox as the run environment.',
  onlyYou: 'Only you can ask',
  onlyYouOn: 'Pace answers only you, so the tools act only for you.',
  onlyYouOff: 'Add your Slack member ID, since the tools use your credentials.',
  /** Opens a section: "Open Sandbox" */
  openSection: (section: string) => `Open ${section}`,
  integrations: 'Integrations',
  integrationsHelp: (opsOn: boolean) =>
    `Each one turns on once its fields are filled in. Changes apply when Pace restarts, as its broker's VM starts with it.${opsOn ? '' : ' Ops tools are off, so none are offered to the reasoner yet.'}`,
  mcpTasks:
    'To ask Claude Code or Codex about your tasks, or collect from inside them, add Pacenote to them. Collect now on the Todo screen works without this.',
  mcpHistory:
    "Claude Code and Codex read the history through Pacenote's MCP server: recent runs, a search, and one run with its steps and answer.",
  credentialsHelp: (reasoner: string) =>
    `${reasoner} signs in inside the sandbox and keeps its login there, separate from your ${reasoner} login on this Mac.`,

  app: 'App',
  appHelp: 'Stored with the run history, not in the settings file.',
  theme: 'Theme',
  themeHelp: 'System follows the macOS appearance.',
  themes: { system: 'System', light: 'Light', dark: 'Dark' },
  language: 'Language',
  languageHelp: 'System follows the macOS language.',
  languageSystem: 'System',
  openAtLogin: 'Open Pacenote when you log in',
  openAtLoginHelp:
    'It opens in the menu bar, without a window. macOS keeps this in Login Items.',
  openAtLoginInstalled: 'Only the installed Pacenote can open at login.',
  openAtLoginApproval:
    'macOS is waiting for you to allow Pacenote in System Settings > General > Login Items.',
  openLoginItems: 'Open Login Items',
  autoStart: 'Start Pace when the app opens',
  autoStartHelp: 'When off, start Pace from its screen or the menu bar.',
  files: 'Files',
  filesHelp:
    'Pace reads its settings from a file outside the repository. Runs from the app and the terminal share it.',
  settingsFile: 'Settings file',
  settingsFileHere: 'Everything under Pace is saved here.',
  settingsFileMissing:
    "Does not exist yet. Saving any of Pace's settings creates it.",
  showInFinder: 'Show in Finder',
  historyFolder: 'Run history folder',
  historyFolderHelp:
    'To move it, change it in the settings file and relaunch the app.',
  open: 'Open',

  unsavedChanges: (n: number) =>
    `${n} unsaved ${n === 1 ? 'change' : 'changes'}`,
  issuesToFix: (n: number) => `${n} ${n === 1 ? 'issue' : 'issues'} to fix`,
  revert: 'Revert',
  save: 'Save',
  saveRestart: 'Save and restart Pace',
  saveStart: 'Save and start Pace',
  cancel: 'Cancel',
  tryAgain: 'Try again',

  state: { on: 'On', partial: 'Incomplete', off: 'Off' },

  codeExpired: 'The code expired. Connect again for a new one.',
  pairedWith: (user: string, team: string, started: boolean) =>
    `Paired with the hub as ${user} @ ${team}.${started ? ' Started Pace.' : ''}`,
  hubPaired:
    'This desktop is paired with the hub. Use Check connection to see as whom.',
  disconnect: 'Disconnect',
  pairTitle: 'Pair this desktop',
  pairHelp:
    'You get a code to send to Pace in Slack. Mentions you make then come to this desktop.',
  connect: 'Connect',
  gettingCode: 'Getting a code from the hub',
  mentionWithCode:
    'In Slack, mention Pace with this code in any channel it is in:',
  /** shimmer: the part that shimmers while Pace waits */
  waitingCode: (shimmer: (words: string) => ReactNode) => (
    <>{shimmer('Waiting for the code.')} It expires in 10 minutes.</>
  ),
  /** who: the Slack member's name and id */
  sentCode: (who: ReactNode) => (
    <>{who} sent the code. Is this your Slack account?</>
  ),
  pairCancelled:
    'Cancelled. If someone else sent your code, connect again to get a new one.',
  no: 'No',
  yesPair: 'Yes, pair',

  changed: 'Changed',
  overridden:
    'Pacenote was started with its own value for this, which wins over the one saved here.',
  notSet: 'Not set',
  change: 'Change',
  enter: 'Enter',
  defaultValue: (value: string) => `Default ${value}`,
  apps: { claude: 'Claude app', codex: 'Codex app' },
  appHere: ' · on this Mac',
  appMissing: ' · not on this Mac, so your terminal opens instead',
  advanced: (n: number) => `Advanced (${n})`,

  yourMacs: 'Your Macs',
  yourMacsHelp:
    "Pace answers on the Mac you're using. Pacenote on your other Mac, set up with the same Slack app, joins in on this network by itself, and Todo is the same on both.",
  macsUnavailable:
    "Your Macs follow you only with your own Slack app (Settings > Messengers). With your team's hub, Pace answers on one Mac per person: pair a new Mac with the hub instead, and Pace moves there.",
  addressIssue: 'Enter a name or address, like 100.68.0.12.',
  follow: "Follow the Mac you're using",
  followOn:
    'Pace moves to the Mac you use when you lock, sleep or leave the other one for 5 minutes. Off, Pace answers on this Mac as on a Mac of its own.',
  followOff:
    'Turn it on here and on your other Mac. macOS asks once whether Pacenote may look on your local network.',
  addMac: 'Add a Mac',
  addMacHelp:
    'Set up Pacenote on a new Mac from this one: its Slack app and who you are come from here.',
  networkBlocked:
    "Pacenote can't look on this network. Turn on Local Network for Pacenote in System Settings > Privacy & Security.",
  openSystemSettings: 'Open System Settings',
  lookingForMac: 'Looking for your other Mac on this network…',
  removeAddress: (address: string) => `Remove ${address}`,
  addressLabel: 'Address of your other Mac',
  addressPlaceholder: '100.68.0.12 or macbook-air.local',
  add: 'Add',
  addByAddress: 'Add by address',
  addressHelp: 'For a Mac on another network, such as over Tailscale.',

  macSetUp: (name: string | undefined) =>
    `${name ?? 'Your new Mac'} is set up. Pace follows the Mac you're using.`,
  addDeclined: 'Cancelled. Nothing was sent.',
  addExpired: 'Stopped waiting. Nothing was sent.',
  done: 'Done',
  close: 'Close',
  wantsSetUp: (name: string) => `${name} wants to set up from this Mac.`,
  sameNumber: 'Do both Macs show this number?',
  allow: 'Allow',
  notThisOne: 'Not this one',
  whatIsSent:
    "Sends your Slack app, who Pace answers and Todo's collection settings. Not your AI sign-in, the sandbox, ops tools or folders.",
  stop: 'Stop',
  /** choice: the new Mac's option, set apart */
  openOnNewMac: (choice: (words: string) => ReactNode) => (
    <>
      Open Pacenote on the new Mac and choose{' '}
      {choice('Connect to your other Mac')} at the Slack step.
    </>
  ),
  waitingOnNetwork: (clock: string) =>
    `Waiting for it on this network… ${clock} left`,
  shownWhileWaiting:
    'This Mac shows itself on your network only while it waits.',

  paceNotRunning: "Pace isn't running there",
  answeringHere: 'Answering here',
  answering: 'Answering',
  moving: 'Moving…',
  asleep: 'Asleep',
  standingBy: 'Standing by',
  outOfReach: 'Out of reach',
  outOfReachSeen: (when: string) => `Out of reach · seen ${when}`,
  thisMac: 'This Mac',
  answerHere: 'Answer here',
  moreFor: (name: string) => `More for ${name}`,
  stopFollowing: 'Stop following to this Mac',

  help: 'Help',
  diagnostics: 'Diagnostics',
  diagnosticsHelp:
    "Versions, Pace's status, the settings without their secrets, and the latest logs, to paste into a bug report. The logs can name channels and people, so read it before you share it.",
  copyFailed: 'Could not copy the diagnostics.',
  copied: 'Copied',
  copyDiagnostics: 'Copy diagnostics',

  updates: 'Updates',
  updatesHelp:
    'Pacenote looks for a new release twice a day. Homebrew installs it.',
  newVersion: (version: string) => `Pacenote ${version} is out`,
  installedOnly: 'Only the installed Pacenote looks for updates.',
  howToUpdate: (current: string) =>
    `You have ${current}. Run this in Terminal; it quits Pacenote, updates it and opens it again. Pace finishes or resumes what it was answering.`,
  upToDate: (when: string) => `Up to date. Checked ${when}.`,
  notChecked: 'Not checked yet.',
  releaseNotes: 'Release notes',
}

const ko: typeof en = {
  sections: {
    general: {
      label: '일반',
      help: '이 앱의 환경설정, 그리고 Pacenote가 설정과 실행 기록을 보관하는 곳이에요.',
    },
    macs: {
      label: '내 Mac',
      help: 'Mac을 여러 대 쓸 때 Pace가 답하는 곳이에요.',
    },
  },
  nav: { app: '앱', pace: 'Pace' },
  navLabel: '설정 섹션',
  title: '설정',
  desktopOnly: '설정은 데스크톱 앱에서 바꿀 수 있어요.',

  savedRestarted: '저장하고 Pace를 다시 시작했어요.',
  savedStarted: '저장하고 Pace를 시작했어요.',
  saved: '저장했어요.',
  savedRestart: '저장했어요. 적용하려면 Pace를 다시 시작하세요.',
  savedEnterNext: (saved, next) =>
    `${josa(saved, '을/를')} 저장했어요. 이제 ${josa(next, '을/를')} 입력하세요.`,
  savedAddMemberId: (saved, group) =>
    `${josa(saved, '을/를')} 저장했어요. 이제 ${group} 항목에 내 Slack 멤버 ID를 추가하세요.`,
  savedStartToUse: (saved, live) =>
    `${josa(saved, '을/를')} 저장했어요. 쓰려면 Pace를 ${live ? '다시 시작' : '시작'}하세요.`,
  restarting: 'Pace를 다시 시작하는 중이에요.',
  starting: 'Pace를 시작하는 중이에요.',
  restartNow: '지금 다시 시작',
  startPace: 'Pace 시작',

  teamHub: '팀 허브',
  ownApp: '내 Slack 앱',
  notPaired: '페어링 안 됨',
  notConnected: '연결 안 됨',
  hintSetUp: '설정 필요',
  hintUpdate: '업데이트',
  hintOff: '꺼짐',
  hintNeedsSetup: '설정 필요',
  stillNeeded: (labels) => `아직 필요한 항목: ${labels.join(', ')}`,
  checkConnection: '연결 확인',
  hubDisconnected: '이 데스크톱과 허브의 연결을 해제했어요.',
  sandboxSignedIn:
    '샌드박스 안에서 로그인했어요. 쓰려면 Pace를 다시 시작하세요.',

  builtInSandbox: '내장 샌드박스',
  builtInOn: '요청은 내장 샌드박스에서, 브로커는 자체 VM에서 실행돼요.',
  builtInOff: '실행 환경으로 내장 샌드박스를 선택하세요.',
  onlyYou: '나만 물어보기',
  onlyYouOn: 'Pace가 나에게만 답하므로 도구도 나를 위해서만 동작해요.',
  onlyYouOff: '도구가 내 자격 증명을 쓰므로 내 Slack 멤버 ID를 추가하세요.',
  openSection: (section) => `${section} 열기`,
  integrations: '연동',
  integrationsHelp: (opsOn) =>
    `항목을 모두 채우면 켜져요. 브로커의 VM이 Pace와 함께 시작되므로 바꾼 내용은 Pace를 다시 시작하면 적용돼요.${opsOn ? '' : ' 운영 도구가 꺼져 있어서 아직 답변 CLI에 제공되는 도구는 없어요.'}`,
  mcpTasks:
    'Claude Code나 Codex에서 내 할 일을 묻거나 그 안에서 모으려면 Pacenote를 추가하세요. 할 일 화면의 지금 모으기는 이것 없이도 돼요.',
  mcpHistory:
    'Claude Code와 Codex는 Pacenote의 MCP 서버로 실행 기록을 읽어요. 최근 실행, 검색, 실행 하나의 단계와 답변을 볼 수 있어요.',
  credentialsHelp: (reasoner) =>
    `${josa(reasoner, '은/는')} 샌드박스 안에서 로그인하고 로그인 정보를 그곳에 보관해요. 이 Mac에 있는 내 ${reasoner} 로그인과는 별개예요.`,

  app: '앱',
  appHelp: '설정 파일이 아니라 실행 기록과 함께 저장돼요.',
  theme: '테마',
  themeHelp: '시스템은 macOS 화면 모드를 따라요.',
  themes: { system: '시스템', light: '라이트', dark: '다크' },
  language: '언어',
  languageHelp: '시스템은 macOS 언어를 따라요.',
  languageSystem: '시스템',
  openAtLogin: '로그인할 때 Pacenote 열기',
  openAtLoginHelp:
    '윈도우 없이 메뉴 막대에서 열려요. macOS는 이 설정을 로그인 항목에 보관해요.',
  openAtLoginInstalled: '설치된 Pacenote만 로그인할 때 열 수 있어요.',
  openAtLoginApproval:
    'macOS가 시스템 설정 > 일반 > 로그인 항목에서 Pacenote를 허용하기를 기다리고 있어요.',
  openLoginItems: '로그인 항목 열기',
  autoStart: '앱을 열 때 Pace 시작',
  autoStartHelp: '끄면 Pace 화면이나 메뉴 막대에서 Pace를 시작하세요.',
  files: '파일',
  filesHelp:
    'Pace는 저장소 밖의 파일에서 설정을 읽어요. 앱과 터미널에서 실행한 Pace가 이 파일을 함께 써요.',
  settingsFile: '설정 파일',
  settingsFileHere: 'Pace 아래의 설정은 모두 여기에 저장돼요.',
  settingsFileMissing: '아직 없어요. Pace 설정을 하나라도 저장하면 만들어져요.',
  showInFinder: 'Finder에서 보기',
  historyFolder: '실행 기록 폴더',
  historyFolderHelp: '옮기려면 설정 파일에서 바꾸고 앱을 다시 실행하세요.',
  open: '열기',

  unsavedChanges: (n) => `저장 안 한 변경 ${n}개`,
  issuesToFix: (n) => `고칠 문제 ${n}개`,
  revert: '되돌리기',
  save: '저장',
  saveRestart: '저장하고 Pace 다시 시작',
  saveStart: '저장하고 Pace 시작',
  cancel: '취소',
  tryAgain: '다시 시도',

  state: { on: '켜짐', partial: '미완료', off: '꺼짐' },

  codeExpired: '코드가 만료됐어요. 새 코드를 받으려면 다시 연결하세요.',
  pairedWith: (user, team, started) =>
    `${user} @ ${josa(team, '으로/로')} 허브와 페어링했어요.${started ? ' Pace를 시작했어요.' : ''}`,
  hubPaired:
    '이 데스크톱은 허브와 페어링되어 있어요. 어느 계정인지는 연결 확인으로 볼 수 있어요.',
  disconnect: '연결 해제',
  pairTitle: '이 데스크톱 페어링',
  pairHelp:
    'Slack에서 Pace에게 보낼 코드를 받아요. 그 뒤로 내가 한 멘션은 이 데스크톱으로 와요.',
  connect: '연결',
  gettingCode: '허브에서 코드를 받는 중',
  mentionWithCode:
    'Slack에서 Pace가 있는 채널 어디서든 이 코드로 Pace를 멘션하세요:',
  waitingCode: (shimmer) => (
    <>{shimmer('코드를 기다리는 중이에요.')} 10분 뒤에 만료돼요.</>
  ),
  sentCode: (who) => <>{who} 계정이 코드를 보냈어요. 내 Slack 계정인가요?</>,
  pairCancelled:
    '취소했어요. 다른 사람이 내 코드를 보냈다면 다시 연결해서 새 코드를 받으세요.',
  no: '아니요',
  yesPair: '네, 페어링',

  changed: '변경됨',
  overridden:
    'Pacenote가 이 항목에 다른 값을 받아 시작되어서, 여기 저장한 값 대신 그 값을 써요.',
  notSet: '설정 안 됨',
  change: '변경',
  enter: '입력',
  defaultValue: (value) => `기본값 ${value}`,
  apps: { claude: 'Claude 앱', codex: 'Codex 앱' },
  appHere: ' · 이 Mac에 있음',
  appMissing: ' · 이 Mac에 없어서 대신 터미널이 열려요',
  advanced: (n) => `고급 (${n})`,

  yourMacs: '내 Mac',
  yourMacsHelp:
    'Pace는 지금 쓰는 Mac에서 답해요. 같은 Slack 앱으로 설정한 다른 Mac의 Pacenote는 이 네트워크에서 알아서 합류하고, 할 일은 두 Mac에서 같아요.',
  macsUnavailable:
    'Mac 따라가기는 직접 만든 Slack 앱에서만 돼요(설정 > 메신저). 팀 허브에서는 Pace가 한 사람당 Mac 한 대에서 답해요. 대신 새 Mac을 허브와 페어링하면 Pace가 그곳으로 옮겨가요.',
  addressIssue: '100.68.0.12처럼 이름이나 주소를 입력하세요.',
  follow: '쓰는 Mac 따라가기',
  followOn:
    '다른 Mac을 잠그거나 잠자기 상태로 두거나 5분 동안 쓰지 않으면 Pace가 지금 쓰는 Mac으로 옮겨가요. 끄면 Pace는 Mac이 한 대일 때처럼 이 Mac에서 답해요.',
  followOff:
    '여기와 다른 Mac에서 모두 켜세요. macOS가 Pacenote의 로컬 네트워크 접근을 허용할지 한 번 물어봐요.',
  addMac: 'Mac 추가',
  addMacHelp:
    '이 Mac에서 새 Mac의 Pacenote를 설정해요. Slack 앱과 내 정보를 여기서 가져가요.',
  networkBlocked:
    'Pacenote가 이 네트워크를 살펴볼 수 없어요. 시스템 설정 > 개인정보 보호 및 보안에서 Pacenote의 로컬 네트워크를 켜세요.',
  openSystemSettings: '시스템 설정 열기',
  lookingForMac: '이 네트워크에서 다른 Mac을 찾는 중…',
  removeAddress: (address) => `${address} 제거`,
  addressLabel: '다른 Mac의 주소',
  addressPlaceholder: '100.68.0.12 또는 macbook-air.local',
  add: '추가',
  addByAddress: '주소로 추가',
  addressHelp: 'Tailscale처럼 다른 네트워크에 있는 Mac을 추가할 때 써요.',

  macSetUp: (name) =>
    `${name ? josa(name, '이/가') : '새 Mac이'} 설정됐어요. Pace는 지금 쓰는 Mac을 따라가요.`,
  addDeclined: '취소했어요. 아무것도 보내지 않았어요.',
  addExpired: '기다리기를 멈췄어요. 아무것도 보내지 않았어요.',
  done: '완료',
  close: '닫기',
  wantsSetUp: (name) =>
    `${josa(name, '이/가')} 이 Mac에서 설정을 가져가려고 해요.`,
  sameNumber: '두 Mac에 같은 숫자가 보이나요?',
  allow: '허용',
  notThisOne: '이 Mac 아님',
  whatIsSent:
    'Slack 앱, Pace가 답하는 사람, 할 일 모으기 설정을 보내요. AI 로그인, 샌드박스, 운영 도구, 폴더는 보내지 않아요.',
  stop: '중지',
  openOnNewMac: (choice) => (
    <>
      새 Mac에서 Pacenote를 열고 Slack 단계에서 {choice('내 다른 Mac에 연결')}을
      선택하세요.
    </>
  ),
  waitingOnNetwork: (clock) => `이 네트워크에서 기다리는 중… ${clock} 남음`,
  shownWhileWaiting: '이 Mac은 기다리는 동안에만 네트워크에 표시돼요.',

  paceNotRunning: 'Pace 실행 안 됨',
  answeringHere: '여기서 답변 중',
  answering: '답변 중',
  moving: '옮기는 중…',
  asleep: '잠자기',
  standingBy: '대기 중',
  outOfReach: '연결할 수 없음',
  outOfReachSeen: (when) => `연결할 수 없음 · 마지막 확인 ${when}`,
  thisMac: '이 Mac',
  answerHere: '여기서 답변',
  moreFor: (name) => `${name} 더 보기`,
  stopFollowing: '이 Mac으로 따라가지 않기',

  help: '도움말',
  diagnostics: '진단 정보',
  diagnosticsHelp:
    '버그 리포트에 붙여 넣을 버전, Pace 상태, 비밀 값을 뺀 설정, 최근 로그예요. 로그에 채널과 사람 이름이 나올 수 있으니 공유하기 전에 읽어 보세요.',
  copyFailed: '진단 정보를 복사하지 못했어요.',
  copied: '복사됨',
  copyDiagnostics: '진단 정보 복사',

  updates: '업데이트',
  updatesHelp:
    'Pacenote는 하루에 두 번 새 릴리스를 확인해요. 설치는 Homebrew가 해요.',
  newVersion: (version) => `Pacenote ${version} 출시`,
  installedOnly: '설치된 Pacenote만 업데이트를 확인해요.',
  howToUpdate: (current) =>
    `지금 버전은 ${josa(current, '이에요/예요')}. 터미널에서 이 명령을 실행하세요. Pacenote를 종료하고 업데이트한 뒤 다시 열어요. Pace는 답하던 요청을 마치거나 이어서 답해요.`,
  upToDate: (when) => `최신 버전이에요. ${when} 확인했어요.`,
  notChecked: '아직 확인하지 않았어요.',
  releaseNotes: '릴리스 노트',
}

export const text: Record<Locale, typeof en> = { en, ko }
