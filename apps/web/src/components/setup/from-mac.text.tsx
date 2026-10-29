import type { Locale } from '@src/i18n/locale'
import type { ReactNode } from 'react'

/** Sets a name in a sentence in bold: a menu path, a button */
type Bold = (text: string) => ReactNode

const en = {
  connectedTo: (name: string) => `Connected to ${name}`,
  sameNumber: (name: string) =>
    `Check that ${name} shows the same number, then click Allow there.`,
  openAddMac: (b: Bold): ReactNode => (
    <>
      On your other Mac, open {b('Pacenote > Settings > Devices')} and click{' '}
      {b('Add a device')}.
    </>
  ),
  macRetrying: (name: string) =>
    `Waiting for ${name}. Check that Add a device is open there.`,
  macConnecting: (name: string) => `Connecting to ${name}…`,
  connect: 'Connect',
  looking: 'Looking for it on this network…',
  tryAgain: 'Try again',
  macAddressLabel: 'Address of your other Mac',
  macAddressPlaceholder: '100.68.0.12 or macbook-pro.local',
  enterAddress: 'Not on this network? Enter its address',
}

const ko: typeof en = {
  connectedTo: (name) => `${name}에 연결됨`,
  sameNumber: (name) =>
    `${name}에 같은 숫자가 보이는지 확인한 뒤 그곳에서 허용을 클릭하세요.`,
  openAddMac: (b) => (
    <>
      다른 Mac에서 {b('Pacenote > 설정 > 내 기기')}를 열고 {b('기기 추가')}를
      클릭하세요.
    </>
  ),
  macRetrying: (name) =>
    `${name} 기다리는 중이에요. 그곳에서 기기 추가가 열려 있는지 확인하세요.`,
  macConnecting: (name) => `${name}에 연결하는 중…`,
  connect: '연결',
  looking: '이 네트워크에서 찾는 중…',
  tryAgain: '다시 시도',
  macAddressLabel: '다른 Mac의 주소',
  macAddressPlaceholder: '100.68.0.12 또는 macbook-pro.local',
  enterAddress: '이 네트워크에 없나요? 주소 입력',
}

export const text: Record<Locale, typeof en> = { en, ko }
