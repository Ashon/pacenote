import { josa } from '../i18n/korean.js'
import type { Locale } from '../i18n/locale.js'

const en = {
  // Setting this Mac up from another one, in Settings and the setup's Slack
  // step; name is the other Mac's
  enterAddress: 'Enter a name or address, like 100.68.0.12.',
  unreachable: (name: string) =>
    `Couldn't reach ${name}. Check that Add a Mac is waiting there and both Macs are on the same network. If your other Mac uses your team's hub, join the hub from this Mac instead.`,
  cancelled: (name: string) => `Cancelled on ${name}. Nothing was copied.`,
  stoppedWaiting: (name: string) =>
    `${name} stopped waiting. Click Add a Mac there again.`,
  closed: (name: string) =>
    `${name} closed the connection. Nothing was copied.`,
  /** message: why this Mac could not take them in */
  couldNotTake: (message: string) => `Couldn't take the settings: ${message}`,
}

const ko: typeof en = {
  enterAddress: '이름이나 주소를 입력하세요. 예: 100.68.0.12',
  unreachable: (name) =>
    `${name}에 연결하지 못했어요. 그 Mac에서 Mac 추가가 기다리고 있는지, 두 Mac이 같은 네트워크에 있는지 확인하세요. 다른 Mac이 팀 허브를 쓴다면 대신 이 Mac에서 허브에 참여하세요.`,
  cancelled: (name) => `${name}에서 취소했어요. 아무것도 복사하지 않았어요.`,
  stoppedWaiting: (name) =>
    `${josa(name, '이/가')} 기다리기를 멈췄어요. 그 Mac에서 Mac 추가를 다시 클릭하세요.`,
  closed: (name) =>
    `${josa(name, '이/가')} 연결을 닫았어요. 아무것도 복사하지 않았어요.`,
  couldNotTake: (message) => `설정을 가져오지 못했어요: ${message}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
