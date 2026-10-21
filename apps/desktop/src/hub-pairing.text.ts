import type { Locale } from '../../../src/i18n/locale.js'

/** What pairing with the team hub says when it cannot go on */
const en = {
  useHttps:
    "Use the hub's https:// address. Plain http works only for a hub on this Mac.",
  enterAddress: "Enter the hub's address, starting with https://.",
  noPairing: 'No pairing in progress. Connect again.',
  unreachable: (url: string) =>
    `Couldn't reach a hub at ${url}. Check the address and your network.`,
  noHub: (url: string) =>
    `No Pacenote hub answers at ${url}. Check the address with whoever runs it.`,
  hubProblem: (url: string, error: string) =>
    `The hub at ${url} had a problem (${error}). Try again in a moment, or tell whoever runs it.`,
  turnedDown: (url: string, error: string) =>
    `The hub at ${url} turned the pairing down: ${error}`,
}

const ko: typeof en = {
  useHttps:
    '허브의 https:// 주소를 쓰세요. 일반 http는 이 Mac에 있는 허브에만 쓸 수 있어요.',
  enterAddress: 'https://로 시작하는 허브 주소를 입력하세요.',
  noPairing: '진행 중인 페어링이 없어요. 다시 연결하세요.',
  unreachable: (url) =>
    `${url}의 허브에 연결할 수 없어요. 주소와 네트워크를 확인하세요.`,
  noHub: (url) =>
    `${url}에서 응답하는 Pacenote 허브가 없어요. 허브를 운영하는 사람에게 주소를 확인하세요.`,
  hubProblem: (url, error) =>
    `${url}의 허브에 문제가 생겼어요(${error}). 잠시 후 다시 시도하거나 허브를 운영하는 사람에게 알려 주세요.`,
  turnedDown: (url, error) => `${url}의 허브가 페어링을 거절했어요: ${error}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
