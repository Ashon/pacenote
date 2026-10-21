import type { Locale } from '../i18n/locale.js'

const en = {
  hub: 'Hub',
  enterUrl: 'Enter the hub URL.',
  notReachable: (reason: string) => `Not reachable: ${reason}`,
  reachable: 'Reachable',
  pairing: 'Pairing',
  notPaired: 'Not paired yet. Connect below.',
  bot: 'Bot',
  connected: 'Connected to the hub',
  notConnected: 'Not connected to the hub (start the bot)',
}

const ko: typeof en = {
  hub: '허브',
  enterUrl: '허브 URL을 입력하세요.',
  notReachable: (reason) => `연결할 수 없어요: ${reason}`,
  reachable: '연결할 수 있어요',
  pairing: '페어링',
  notPaired: '아직 페어링하지 않았어요. 아래에서 연결하세요.',
  bot: '봇',
  connected: '허브에 연결됨',
  notConnected: '허브에 연결되지 않음 (봇을 시작하세요)',
}

export const text: Record<Locale, typeof en> = { en, ko }
