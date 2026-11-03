import type { Locale } from '@src/i18n/locale'
import type { FoundGap } from '@src/settings/found'

const en = {
  onThisMac: 'On this Mac',
  lookAgain: 'Look again',
  more: (n: number) => `${n} more`,
  picked: 'Picked; click to take it out',
  /** Where a name came from, as its title */
  from: {
    home: (n: number) =>
      `${n} ${n === 1 ? 'repository' : 'repositories'} in it`,
    gh: 'Your gh login, or an org it belongs to',
    repositories: (n: number) =>
      `Owns ${n} of the work folder's ${n === 1 ? 'repository' : 'repositories'}`,
    kubeconfig: 'A context in your kubeconfig',
    sshConfig: (n: number) =>
      `Used by ${n} ${n === 1 ? 'host' : 'hosts'} in your SSH config`,
    sshFolder: 'A key in ~/.ssh',
    range: (hosts: string[]) => `Your SSH hosts in it: ${hosts.join(', ')}`,
  },
  gaps: {
    noGh: "gh isn't on this Mac, so your orgs can't be listed, and GitHub needs it. Install it with brew install gh, then sign in.",
    ghSignedOut:
      "gh isn't signed in, so your orgs can't be listed, and GitHub needs it. Run gh auth login in Terminal, then look again.",
    noKubectl:
      "kubectl isn't on this Mac, so your contexts can't be listed, and Kubernetes needs it.",
  } satisfies Record<FoundGap, string>,
}

const ko: typeof en = {
  onThisMac: '이 Mac에서 찾음',
  lookAgain: '다시 찾기',
  more: (n) => `${n}개 더`,
  picked: '골랐어요. 누르면 빼요',
  from: {
    home: (n) => `저장소 ${n}개`,
    gh: 'gh 로그인 계정이나 그 계정이 속한 조직',
    repositories: (n) => `작업 폴더 저장소 ${n}개의 주인`,
    kubeconfig: 'kubeconfig의 컨텍스트',
    sshConfig: (n) => `SSH 설정의 호스트 ${n}개가 써요`,
    sshFolder: '~/.ssh의 키',
    range: (hosts) => `이 범위의 SSH 호스트: ${hosts.join(', ')}`,
  },
  gaps: {
    noGh: '이 Mac에 gh가 없어서 조직 목록을 가져올 수 없어요. GitHub 연결에도 gh가 필요해요. brew install gh로 설치한 뒤 로그인하세요.',
    ghSignedOut:
      'gh에 로그인되어 있지 않아서 조직 목록을 가져올 수 없어요. GitHub 연결에도 로그인이 필요해요. 터미널에서 gh auth login을 실행한 뒤 다시 찾으세요.',
    noKubectl:
      '이 Mac에 kubectl이 없어서 컨텍스트 목록을 가져올 수 없어요. Kubernetes 연결에도 kubectl이 필요해요.',
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
