import type { Locale } from '@src/i18n/locale'

const en = {
  open: 'No hub yet? Install one on a Linux server',
  lead: "Pacenote writes one command for the server. It asks for the Slack app's two tokens there, so they never leave the server, and starts the hub with Docker.",
  address: 'Address members will use',
  addressHelp:
    "http://<the server's address>:8790 on your own network, or the https address you will serve it at.",
  allow: 'Who can use it',
  allowHelp:
    'Slack member IDs, comma-separated. Empty: everyone in the workspace.',
  notes: 'Its notes in Slack',
  copy: 'Copy install command',
  copied: "Copied. Paste it in the server's shell.",
  readFirst: 'Read the script first',
  waiting: (url: string) => `Waiting for the hub at ${url}`,
  switchesHere:
    'When it answers, Pace switches to it on its own: no code to send in Slack.',
  pairsHere: 'When it answers, this Mac pairs with it with a code, as usual.',
  stopWaiting: 'Stop waiting',
  gaveUp: (url: string) =>
    `No answer from ${url} in 30 minutes. Run the command on the server, or check the address.`,
  waitAgain: 'Wait again',
  up: (url: string) => `The hub at ${url} is running. Connecting this Mac.`,
  switched: (url: string, name: string) =>
    `Pace answers you through the hub at ${url} now, as @${name}.`,
}

const ko: typeof en = {
  open: '허브가 없나요? Linux 서버에 설치하기',
  lead: 'Pacenote가 서버에서 실행할 명령 한 줄을 만들어요. Slack 앱 토큰 두 개는 서버에서 입력받아 서버 밖으로 나가지 않고, 허브는 Docker로 실행돼요.',
  address: '멤버가 접속할 주소',
  addressHelp:
    '사내망에서는 http://<서버 주소>:8790, 아니면 HTTPS로 내보낼 주소예요.',
  allow: '쓸 수 있는 사람',
  allowHelp:
    'Slack 멤버 ID를 쉼표로 구분해요. 비워 두면 워크스페이스의 모두예요.',
  notes: 'Slack 알림 언어',
  copy: '설치 명령 복사',
  copied: '복사했어요. 서버의 셸에 붙여 넣으세요.',
  readFirst: '스크립트 먼저 보기',
  waiting: (url) => `${url}에서 허브를 기다리는 중`,
  switchesHere:
    '허브가 응답하면 Pace가 알아서 허브로 전환돼요. Slack에 코드를 보낼 필요가 없어요.',
  pairsHere: '허브가 응답하면 평소처럼 코드로 이 Mac을 페어링해요.',
  stopWaiting: '그만 기다리기',
  gaveUp: (url) =>
    `30분 동안 ${url}에서 응답이 없었어요. 서버에서 명령을 실행했는지, 주소가 맞는지 확인하세요.`,
  waitAgain: '다시 기다리기',
  up: (url) => `${url}의 허브가 실행 중이에요. 이 Mac을 연결하는 중이에요.`,
  switched: (url, name) =>
    `이제 Pace가 ${url} 허브를 거쳐 @${name}에게 답해요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
