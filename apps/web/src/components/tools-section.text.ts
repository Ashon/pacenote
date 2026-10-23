import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'
import type { ConnectionId } from '@src/settings/tools'

/** "A, B and C" */
const listEn = (items: string[]) =>
  items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

const en = {
  /** Each connection inside a sentence */
  names: {
    files: 'your work folder',
    github: 'GitHub',
    jira: 'Jira',
    k8s: 'Kubernetes',
    ssh: 'your SSH hosts',
  } satisfies Record<ConnectionId, string>,
  /** What Pace can reach now, in a sentence */
  can: (reads: string[], writes: string[]) =>
    `Pace can read ${listEn(reads)}${writes.length ? `, and write to ${listEn(writes)}` : ''}.`,
  sandboxFirst:
    'Pace runs on this Mac, so its connections wait for the built-in sandbox.',
  off: 'Connections are off, so Pace reaches none of them.',
  none: 'Connections are on, but none is set up yet, so Pace has none to use.',
  reference: 'It reads your reference folder itself.',
  referenceOnly: 'Pace reads only your reference folder.',
  where: (sandbox: boolean, cli: string) =>
    sandbox
      ? `In the built-in sandbox, with ${cli}, for you only`
      : `On this Mac, with ${cli}`,
  needsSandbox: 'Connections need the built-in sandbox.',
  needsOnlyYou: 'Pace must answer only you, as the connections use your keys.',
  openSection: (section: string) => `Open ${section}`,

  read: 'Read',
  write: 'Write',
  notSetUp: 'Not set up',
  state: {
    on: 'On',
    off: 'Off',
    readOff: 'Read is off',
    waits: 'Waits for the sandbox',
    notSetUp: 'Not set up',
    missing: (n: number) => `${n} more to fill in`,
    writeNeeds: (what: string) => `Write needs the ${what.toLowerCase()}`,
  },
  stillNeeded: (labels: string[]) => `Still needed: ${labels.join(', ')}`,
  changed: 'Unsaved changes',
  never: {
    files:
      'Pace never reads .env files, keys or kubeconfig here, and never changes the folder.',
    github:
      'Pace never merges, approves, or pushes outside pacenote/* branches.',
    jira: "Pace never changes an issue's status, assigns or deletes it.",
    k8s: 'Pace never reads secrets or changes a cluster; the account refuses that too.',
    ssh: 'Pace runs only the fixed checks, never a command of its own.',
  } satisfies Record<ConnectionId, string>,

  codexInSandbox: "Codex can't read it in the sandbox",
  referenceOn: 'On',
  referenceOff: 'Off',

  web: 'Web access',
  webHere:
    'On this Mac, the CLI reaches whatever your Mac reaches. In the built-in sandbox it reaches only the domains you allow.',
}

const ko: typeof en = {
  names: {
    files: '작업 폴더',
    github: 'GitHub',
    jira: 'Jira',
    k8s: 'Kubernetes',
    ssh: 'SSH 호스트',
  },
  can: (reads, writes) =>
    `Pace는 ${josa(reads.join(', '), '을/를')} 읽을 수 있어요.${writes.length ? ` ${writes.join(', ')}에는 쓸 수도 있어요.` : ''}`,
  sandboxFirst:
    'Pace가 이 Mac에서 실행되고 있어서, 연결은 내장 샌드박스를 기다려요.',
  off: '연결이 꺼져 있어서 Pace는 어디에도 연결하지 않아요.',
  none: '연결은 켜져 있지만 설정한 연결이 아직 없어서 Pace가 쓸 수 있는 연결이 없어요.',
  reference: '참고 폴더는 직접 읽어요.',
  referenceOnly: 'Pace는 참고 폴더만 읽어요.',
  where: (sandbox, cli) =>
    sandbox
      ? `내장 샌드박스에서 ${josa(cli, '으로/로')}, 나에게만`
      : `이 Mac에서 ${josa(cli, '으로/로')}`,
  needsSandbox: '연결에는 내장 샌드박스가 필요해요.',
  needsOnlyYou: '연결은 내 키를 쓰므로 Pace가 나에게만 답해야 해요.',
  openSection: (section) => `${section} 열기`,

  read: '읽기',
  write: '쓰기',
  notSetUp: '설정 전',
  state: {
    on: '켜짐',
    off: '꺼짐',
    readOff: '읽기 꺼짐',
    waits: '샌드박스를 기다려요',
    notSetUp: '설정 전',
    missing: (n) => `${n}개 더 채워야 해요`,
    writeNeeds: (what) => `쓰기에는 ${josa(what, '이/가')} 필요해요`,
  },
  stillNeeded: (labels) => `남은 항목: ${labels.join(', ')}`,
  changed: '저장하지 않은 변경',
  never: {
    files:
      '여기서 .env 파일, 키, kubeconfig는 읽지 않고, 폴더를 바꾸지도 않아요.',
    github: '머지, 승인, pacenote/* 밖으로의 push는 하지 않아요.',
    jira: '이슈의 상태를 바꾸거나, 담당자를 정하거나, 지우지 않아요.',
    k8s: 'secret을 읽거나 클러스터를 바꾸지 않아요. 계정도 이를 막아요.',
    ssh: '정해진 점검만 하고, 다른 명령은 실행하지 않아요.',
  },

  codexInSandbox: '샌드박스의 Codex는 읽지 못해요',
  referenceOn: '켜짐',
  referenceOff: '꺼짐',

  web: '웹 접근',
  webHere:
    '이 Mac에서는 CLI가 이 Mac이 닿는 곳 어디든 닿아요. 내장 샌드박스에서는 허용한 도메인에만 닿아요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
