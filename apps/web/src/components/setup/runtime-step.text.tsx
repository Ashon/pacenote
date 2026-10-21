import type { Locale } from '@src/i18n/locale'
import type { SetupPart } from '@src/sandbox/vm-progress'
import type { ReactNode } from 'react'

/** Sets the lead-in of a line in bold */
type Bold = (text: string) => ReactNode

const en = {
  /** message: why, as the sandbox said */
  couldNotStart: (message: string) => `Preparing couldn't start. ${message}`,
  /** part: the part it stopped at, if known */
  stopped: (part?: string) =>
    `Preparing stopped${part ? ` at "${part}"` : ''}. Check your network and that the disk has about 1.5 GB free, then try again.`,
  title: 'Where should Pace work out answers?',
  lead: 'Pace answers messages other people write. Choose how much of this Mac it can see while it works.',
  back: 'Back',
  useSandbox: 'Use the built-in sandbox',
  runDirectly: 'Run directly on this Mac',
  /** reason: why this Mac cannot run the sandbox */
  unsupported: (reason: string) =>
    `${reason} For now Pace can only run directly on this Mac.`,
  runtimeLabel: 'Where Pace runs',
  sandbox: 'Built-in sandbox',
  notOnThisMac: 'Not on this Mac',
  recommended: 'Recommended',
  vmPerRequest: 'A small Linux VM per request, removed after',
  noFilesCodex: "Can't see your files, only your codex login",
  noFiles: "Can't see your files or your logins",
  /** service: Claude or ChatGPT */
  reachesOnly: (service: string) =>
    `Reaches only ${service} and the sites you allow`,
  directly: 'Directly on this Mac',
  nothingToInstall: 'Nothing to install or prepare',
  ownLogin: 'Uses your own login and can read the files you point it to',
  noIsolation: 'No isolation, so diagrams and tools stay off',
  tryAgain: 'Try again',
  ready: (b: Bold): ReactNode => (
    <>{b('Ready:')} it was prepared on this Mac already.</>
  ),
  alreadyPreparing: (b: Bold, percent: number): ReactNode => (
    <>
      {b(`Already preparing, ${percent}%:`)} it started when setup opened, and
      carries on while you connect Slack. About 300 MB to download, 1.5 GB of
      disk.
    </>
  ),
  firstTime: (b: Bold): ReactNode => (
    <>
      {b('First time only:')} downloads about 300 MB and uses about 1.5 GB of
      disk. It prepares in the background while you connect Slack.
    </>
  ),
  /** name: Claude or Codex */
  ownSignIn: (name: string) => `The sandbox needs its own ${name} sign-in`,
  required: 'Required',
  signedIn: 'Signed in',
  signInLater:
    'Pace needs it to answer from the sandbox. Sign in now, or before Pace starts.',
  /** Each part of preparing, by its state */
  parts: {
    done: 'Ready',
    working: 'Working',
    failed: 'Failed',
    waiting: 'Next',
  } satisfies Record<SetupPart['state'], string>,
  preparingTitle: 'Preparing the built-in sandbox',
  preparingLead:
    "The first time takes a few minutes. You don't have to wait here: keep going with setup, and this carries on in the background.",
  continueSetup: 'Continue setup',
  preparingStopped: 'Preparing stopped',
  isReady: 'The built-in sandbox is ready',
  starting: 'Starting…',
  doneOnce:
    'Done once. After this, each request starts its sandbox in about a second.',
  quitPauses:
    'Quitting Pacenote pauses this, and it picks up where it stopped next time.',
}

const ko: typeof en = {
  couldNotStart: (message) => `준비를 시작하지 못했어요. ${message}`,
  stopped: (part) =>
    `${part ? `"${part}" 단계에서 ` : ''}준비가 멈췄어요. 네트워크와 디스크 여유 공간(약 1.5GB)을 확인한 뒤 다시 시도하세요.`,
  title: 'Pace는 어디서 답변을 만들까요?',
  lead: 'Pace는 다른 사람이 쓴 메시지에 답변해요. 일하는 동안 이 Mac을 얼마나 볼 수 있게 할지 고르세요.',
  back: '뒤로',
  useSandbox: '내장 샌드박스 사용',
  runDirectly: '이 Mac에서 바로 실행',
  unsupported: (reason) =>
    `${reason} 지금은 Pace를 이 Mac에서 바로 실행하는 방법만 쓸 수 있어요.`,
  runtimeLabel: 'Pace 실행 환경',
  sandbox: '내장 샌드박스',
  notOnThisMac: '이 Mac에서 쓸 수 없음',
  recommended: '추천',
  vmPerRequest: '요청마다 작은 Linux VM을 쓰고, 끝나면 지워요',
  noFilesCodex: '내 파일은 못 보고, codex 로그인만 써요',
  noFiles: '내 파일도 로그인 정보도 못 봐요',
  reachesOnly: (service) => `허용한 사이트와 ${service}에만 접속해요`,
  directly: '이 Mac에서 바로',
  nothingToInstall: '설치하거나 준비할 것이 없어요',
  ownLogin: '내 로그인을 쓰고, 알려 준 파일을 읽을 수 있어요',
  noIsolation: '격리되지 않아서 다이어그램과 도구는 꺼져 있어요',
  tryAgain: '다시 시도',
  ready: (b) => <>{b('준비됨:')} 이 Mac에서 이미 준비했어요.</>,
  alreadyPreparing: (b, percent) => (
    <>
      {b(`이미 준비 중, ${percent}%:`)} 초기 설정을 열 때 시작했고, Slack을
      연결하는 동안에도 계속돼요. 약 300MB를 내려받고 디스크를 1.5GB 써요.
    </>
  ),
  firstTime: (b) => (
    <>
      {b('처음 한 번만:')} 약 300MB를 내려받고 디스크를 약 1.5GB 써요. Slack을
      연결하는 동안 백그라운드에서 준비해요.
    </>
  ),
  ownSignIn: (name) => `샌드박스에는 따로 ${name} 로그인이 필요해요`,
  required: '필수',
  signedIn: '로그인됨',
  signInLater:
    'Pace가 샌드박스에서 답변하려면 필요해요. 지금 로그인하거나 Pace를 시작하기 전에 로그인하세요.',
  parts: {
    done: '준비됨',
    working: '진행 중',
    failed: '실패',
    waiting: '대기',
  },
  preparingTitle: '내장 샌드박스 준비 중',
  preparingLead:
    '처음에는 몇 분 걸려요. 여기서 기다리지 않아도 돼요. 초기 설정을 계속하면 이 작업은 백그라운드에서 이어져요.',
  continueSetup: '초기 설정 계속',
  preparingStopped: '준비가 멈췄어요',
  isReady: '내장 샌드박스가 준비됐어요',
  starting: '시작하는 중…',
  doneOnce:
    '한 번만 하면 돼요. 그다음부터는 요청마다 약 1초 만에 샌드박스가 시작돼요.',
  quitPauses:
    'Pacenote를 종료하면 잠시 멈추고, 다음에 멈춘 곳부터 이어서 해요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
