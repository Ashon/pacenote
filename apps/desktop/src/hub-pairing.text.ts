import type { Locale } from '../../../src/i18n/locale.js'

/** What pairing with the team hub says when it cannot go on */
const en = {
  useHttps:
    "Use the hub's https:// address. Plain http works only on your own network: a private address such as http://10.0.0.5:8790, or a name like hub.local.",
  enterAddress:
    "Enter the hub's address, starting with https://, or http:// on your own network.",
  noPairing: 'No pairing in progress. Connect again.',
  unreachable: (url: string) =>
    `Couldn't reach a hub at ${url}. Check the address and your network.`,
  noHub: (url: string) =>
    `No Pacenote hub answers at ${url}. Check the address with whoever runs it.`,
  hubProblem: (url: string, error: string) =>
    `The hub at ${url} had a problem (${error}). Try again in a moment, or tell whoever runs it.`,
  turnedDown: (url: string, error: string) =>
    `The hub at ${url} turned the pairing down: ${error}`,
  memberIds: 'Who can use it takes Slack member IDs, such as U012AB3CD.',
}

const ko: typeof en = {
  useHttps:
    '허브의 https:// 주소를 쓰세요. 일반 http는 사내망 주소에서만 돼요: http://10.0.0.5:8790 같은 사설 IP나 hub.local 같은 이름.',
  enterAddress:
    '허브 주소를 https://로 시작해 입력하세요. 사내망에서는 http://도 돼요.',
  noPairing: '진행 중인 페어링이 없어요. 다시 연결하세요.',
  unreachable: (url) =>
    `${url}의 허브에 연결할 수 없어요. 주소와 네트워크를 확인하세요.`,
  noHub: (url) =>
    `${url}에서 응답하는 Pacenote 허브가 없어요. 허브를 운영하는 사람에게 주소를 확인하세요.`,
  hubProblem: (url, error) =>
    `${url}의 허브에 문제가 생겼어요(${error}). 잠시 후 다시 시도하거나 허브를 운영하는 사람에게 알려 주세요.`,
  turnedDown: (url, error) => `${url}의 허브가 페어링을 거절했어요: ${error}`,
  memberIds: '쓸 수 있는 사람에는 U012AB3CD처럼 Slack 멤버 ID를 넣어요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
