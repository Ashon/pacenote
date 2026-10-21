import type { ReactNode } from 'react'
import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'

const en = {
  /** code: the code the CLI printed, set apart */
  enterCode: (name: string, code: ReactNode) => (
    <>
      Open the {name} page and enter this code: {code}
    </>
  ),
  approveAndPaste:
    'Open the Claude page and approve, then paste the code it shows here.',
  openPage: (name: string) => `Open the ${name} page`,
  codePlaceholder: 'Code from the page',
  codeLabel: 'Code from the Claude page',
  signIn: 'Sign in',
  cancel: 'Cancel',
  signingIn: 'Signing in…',
  waitingApproval: 'Waiting for you to approve on the page…',
  starting: 'Starting the sign-in in the sandbox…',
  signedIn: (name: string) => `Signed in to ${name} inside the sandbox`,
  signInInside: (name: string) => `Sign in to ${name} inside the sandbox`,
  /** vendor: whose page the sign-in is on (Claude, OpenAI) */
  ownPlan: (name: string, vendor: string) =>
    `${name} signs in on ${vendor}'s own page and keeps its login in the sandbox. Pacenote never sees it. Uses your own plan.`,
  notReady: 'Once the sandbox is ready: the sign-in runs inside it.',
  tryAgain: 'Try again',
  signInAgain: 'Sign in again',
  signInTo: (name: string) => `Sign in to ${name}`,
}

const ko: typeof en = {
  enterCode: (name, code) => (
    <>
      {name} 페이지를 열고 이 코드를 입력하세요: {code}
    </>
  ),
  approveAndPaste:
    'Claude 페이지를 열어 승인한 뒤, 페이지에 나온 코드를 여기에 붙여 넣으세요.',
  openPage: (name) => `${name} 페이지 열기`,
  codePlaceholder: '페이지에 나온 코드',
  codeLabel: 'Claude 페이지에 나온 코드',
  signIn: '로그인',
  cancel: '취소',
  signingIn: '로그인하는 중…',
  waitingApproval: '페이지에서 승인하기를 기다리는 중…',
  starting: '샌드박스에서 로그인을 시작하는 중…',
  signedIn: (name) => `샌드박스 안에서 ${name}에 로그인됨`,
  signInInside: (name) => `샌드박스 안에서 ${name}에 로그인`,
  ownPlan: (name, vendor) =>
    `${josa(name, '은/는')} ${vendor}의 페이지에서 로그인하고 로그인 정보를 샌드박스에 보관해요. Pacenote는 그 정보를 보지 않아요. 내 요금제를 써요.`,
  notReady: '샌드박스가 준비되면 그 안에서 로그인해요.',
  tryAgain: '다시 시도',
  signInAgain: '다시 로그인',
  signInTo: (name) => `${name}에 로그인`,
}

export const text: Record<Locale, typeof en> = { en, ko }
