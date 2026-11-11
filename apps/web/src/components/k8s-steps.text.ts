import type { Locale } from '@src/i18n/locale'
import type { K8sAccountState } from '@src/sandbox/k8s-account'

const en = {
  title: 'Connect in three steps',
  lede: 'Pace reads each cluster as an account of its own that can only read, never as you.',
  guide: 'Guide',
  guideUrl: 'https://pacenote.dev/guide/kubernetes/',
  step: {
    contexts: 'Pick your clusters',
    accounts: 'Give each cluster a read-only account',
    connect: 'Connect Pace',
  },
  contexts: {
    none: 'Pick their contexts above, from your kubeconfig.',
    picked: (count: number) =>
      `${count} ${count === 1 ? 'cluster' : 'clusters'} picked`,
    noKubectl: "kubectl isn't on this Mac. Install it, then look again:",
  },
  state: {
    ready: 'Account ready',
    pending: 'Made, waiting for its token',
    missing: 'No account yet',
    forbidden: "You can't see the account here",
    signIn: 'kubectl has to sign in to this cluster',
    unreachable: "The cluster doesn't answer",
    noContext: 'Not a context in your kubeconfig',
    noKubectl: "kubectl isn't on this Mac",
    failed: "Couldn't check",
  } satisfies Record<K8sAccountState, string>,
  cannotMake: "You can't make one here, so the cluster's admin makes it.",
  signInHint: 'Sign in once in Terminal, then check again:',
  unreachableHint:
    'On a VPN or another network? Connect to it, then check again.',
  make: 'Make it here',
  makeAsk: (context: string, account: string) =>
    `Make ${account} in ${context}, with your kubeconfig's access? It adds a namespace, the account and its token, and two bindings that only read.`,
  makeYes: 'Make',
  cancel: 'Cancel',
  making: 'Making',
  forAdmin: 'For your admin',
  adminAsk: "Send this to the cluster's admin to apply, then check again.",
  adminReader: (user: string) =>
    `It also lets ${user} read the account's token, so your Pacenote can use it.`,
  adminNoReader: (secret: string) =>
    `Once it's applied, your kubectl needs to read the ${secret} secret too.`,
  checkAgain: 'Check again',
  whatItIs: "What's in the account",
  whatItIsHelp:
    'The same in every cluster. Nothing in it changes the cluster or reads secrets.',
  connect: {
    off: 'Pace connects once Tools and the built-in sandbox are on.',
    save: 'Save, and Pace starts again with these accounts.',
    next: 'Pace connects the next time it starts.',
    again: 'Connect again',
    reads: 'Reads',
    noSecrets: 'No secrets',
    noChanges: 'No changes',
    cannotRead: "Can't read",
    secrets: 'Reads secrets',
    changes: 'Can change things',
    unknown: "Didn't answer",
    leftOut: 'Left out',
    tooMuch:
      'This account can do more than read. Pace still only reads, but check the roles bound to it.',
  },
}

const ko: typeof en = {
  title: '세 단계로 연결해요',
  lede: 'Pace는 클러스터마다 읽기만 하는 전용 계정으로 읽어요. 내 권한으로 읽지 않아요.',
  guide: '가이드',
  guideUrl: 'https://pacenote.dev/ko/guide/kubernetes/',
  step: {
    contexts: '클러스터 고르기',
    accounts: '클러스터마다 읽기 전용 계정 만들기',
    connect: 'Pace에 연결',
  },
  contexts: {
    none: '위에서 kubeconfig의 컨텍스트를 골라 주세요.',
    picked: (count) => `클러스터 ${count}개 고름`,
    noKubectl: '이 Mac에 kubectl이 없어요. 설치한 뒤 다시 확인하세요:',
  },
  state: {
    ready: '계정 준비됨',
    pending: '만들었어요. 토큰을 기다리는 중',
    missing: '아직 계정 없음',
    forbidden: '여기서는 계정을 확인할 권한이 없어요',
    signIn: 'kubectl이 이 클러스터에 로그인해야 해요',
    unreachable: '클러스터가 응답하지 않아요',
    noContext: 'kubeconfig에 없는 컨텍스트예요',
    noKubectl: '이 Mac에 kubectl이 없어요',
    failed: '확인하지 못했어요',
  },
  cannotMake: '여기서 만들 권한이 없어서 클러스터 관리자가 만들어야 해요.',
  signInHint: '터미널에서 한 번 로그인한 뒤 다시 확인하세요:',
  unreachableHint:
    'VPN이나 사내망에 있는 클러스터라면 연결한 뒤 다시 확인하세요.',
  make: '여기에 만들기',
  makeAsk: (context, account) =>
    `${context}에 ${account} 계정을 내 kubeconfig 권한으로 만들까요? 네임스페이스, 계정과 토큰, 읽기만 하는 바인딩 두 개가 생겨요.`,
  makeYes: '만들기',
  cancel: '취소',
  making: '만드는 중',
  forAdmin: '관리자용 YAML',
  adminAsk:
    '클러스터 관리자에게 이 YAML 적용을 부탁하고, 적용되면 다시 확인하세요.',
  adminReader: (user) =>
    `내 Pacenote가 이 계정을 쓸 수 있도록, ${user} 사용자가 토큰을 읽는 권한도 들어 있어요.`,
  adminNoReader: (secret) =>
    `적용된 뒤에는 이 Mac의 kubectl이 ${secret} secret도 읽을 수 있어야 해요.`,
  checkAgain: '다시 확인',
  whatItIs: '계정에 들어 있는 것',
  whatItIsHelp:
    '모든 클러스터에 똑같이 만들어요. 클러스터를 바꾸거나 secret을 읽는 권한은 없어요.',
  connect: {
    off: '도구와 내장 샌드박스를 켜면 Pace가 연결해요.',
    save: '저장하면 Pace가 이 계정으로 다시 시작해요.',
    next: 'Pace가 다음에 시작할 때 연결해요.',
    again: '다시 연결',
    reads: '읽기',
    noSecrets: 'secret 못 읽음',
    noChanges: '변경 못 함',
    cannotRead: '읽지 못함',
    secrets: 'secret 읽음',
    changes: '변경 가능',
    unknown: '응답 없음',
    leftOut: '빠짐',
    tooMuch:
      '이 계정은 읽기보다 많은 걸 할 수 있어요. Pace는 그래도 읽기만 하지만, 계정에 묶인 역할을 확인해 보세요.',
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
