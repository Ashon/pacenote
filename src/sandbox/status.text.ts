import { josa } from '../i18n/korean.js'
import type { Locale } from '../i18n/locale.js'

const en = {
  settingsChanged: 'Settings changed after Pace started.',
  missingFile: (file: string) => `Missing: ${file}`,
  sshKey: 'SSH key',
  knownHosts: 'SSH known_hosts',
  login: (reasoner: string) => `Sandbox ${reasoner} login`,
  signedIn: 'Signed in inside the sandbox',
  /** name: Claude or Codex */
  notSignedIn: (name: string) => `Not signed in: Sign in to ${name} below`,
  usesToken:
    'Uses the claude token set by hand: signing in to Claude below replaces it',
  keyRejected:
    'The Anthropic API key is rejected: sign in to Claude below, or set another key',
  usesKey: 'Uses the Anthropic API key',
  hostList: 'Host list',
  hosts: (n: number, fromInventory: boolean) =>
    `${n} host${n === 1 ? '' : 's'} (${fromInventory ? 'rebuilt from the inventory when Pace starts' : 'hosts.json managed by hand'})`,
  noHostsYet: 'None (built when Pace starts)',
  /** setting: the inventory file setting's name on the screen */
  noHosts: (setting: string) =>
    `None (set ${setting} in Settings, or write hosts.json by hand)`,
  kubeconfig: 'k8s kubeconfig',
  present: 'Present',
  kubeconfigEmpty: 'Empty (k8s tools off, rebuild kubeconfig needed)',
  jira: 'Jira',
  /** settings: the names on the screen of those still empty */
  required: (settings: string[]) => `${settings.join(', ')} required`,
  github: 'GitHub login (gh)',
  /** account: the GitHub account gh is signed in as, when it said */
  ghSignedIn: (account: string | undefined) =>
    `${account ?? 'Logged in'} (the token is passed when Pace starts)`,
  ghSignedOut: 'gh auth login required',
  author: 'PR commit author',
  /** Where the author came from */
  authorFrom: { settings: 'Settings', global: 'global git config' },
  noAuthor:
    'The commit author name and email in Settings, or git config --global, required',
}

const ko: typeof en = {
  settingsChanged: 'Pace가 시작된 뒤에 설정이 바뀌었어요.',
  missingFile: (file) => `없음: ${file}`,
  sshKey: 'SSH 키',
  knownHosts: 'SSH known_hosts',
  // Under the sandbox's own heading, so it need not say sandbox again
  login: (reasoner) => `${reasoner} 로그인`,
  signedIn: '샌드박스 안에서 로그인됨',
  notSignedIn: (name) => `로그인 안 됨: 아래에서 ${name}에 로그인하세요`,
  usesToken:
    '직접 설정한 claude 토큰을 써요. 아래에서 Claude에 로그인하면 로그인으로 바뀌어요',
  keyRejected:
    'Anthropic API 키가 거부됐어요. 아래에서 Claude에 로그인하거나 다른 키를 설정하세요',
  usesKey: 'Anthropic API 키를 써요',
  hostList: '호스트 목록',
  hosts: (n, fromInventory) =>
    `호스트 ${n}개 (${fromInventory ? 'Pace가 시작할 때 인벤토리에서 다시 만들어요' : 'hosts.json을 직접 관리해요'})`,
  noHostsYet: '없음 (Pace가 시작할 때 만들어요)',
  noHosts: (setting) =>
    `없음 (설정에서 ${josa(setting, '을/를')} 정하거나 hosts.json을 직접 작성하세요)`,
  kubeconfig: 'k8s kubeconfig',
  present: '있음',
  kubeconfigEmpty: '비어 있음 (k8s 도구 꺼짐, kubeconfig를 다시 만들어야 해요)',
  jira: 'Jira',
  required: (settings) => `${josa(settings.join(', '), '이/가')} 필요해요`,
  github: 'GitHub 로그인 (gh)',
  ghSignedIn: (account) =>
    `${account ?? '로그인됨'} (Pace가 시작할 때 토큰을 넘겨요)`,
  ghSignedOut: 'gh auth login이 필요해요',
  author: 'PR 커밋 작성자',
  authorFrom: { settings: '설정', global: '전역 git 설정' },
  noAuthor:
    '설정의 커밋 작성자 이름과 이메일, 또는 git config --global이 필요해요',
}

export const text: Record<Locale, typeof en> = { en, ko }
