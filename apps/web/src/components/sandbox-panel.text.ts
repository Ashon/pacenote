import type { Locale } from '@src/i18n/locale'

const en = {
  /** A job button's tooltip: what it does, and its pnpm script */
  jobTip: (help: string, script: string) =>
    `${help} From the repository: pnpm ${script}`,
  ready: 'Ready',
  checking: 'Checking',
  unsupported: 'Not available on this Mac',
  helperDown: 'pacenote-vm did not answer',
  settingUp: 'Setting up',
  updateNeeded: 'Update needed',
  needsSetup: 'Needs setup',
  /** When: 3m ago */
  checked: (when: string) => `Built-in sandbox on this Mac, checked ${when}`,
  checkAgain: 'Check again',
  thisMac: 'This Mac',
  kernel: 'Linux kernel',
  kernelMissing: 'Not downloaded yet (about 14 MB, once)',
  initfs: 'Init filesystem',
  initfsMissing: 'Not prepared yet',
  reasonerImage: 'Reasoner image',
  /** An image built when, on what, and whether for another Pacenote */
  builtOn: (when: string, base: string, another: boolean) =>
    `Built ${when} on ${base}${another ? ', for another version of Pacenote: set up again to update it' : ''}`,
  built: (when: string, another: boolean) =>
    `Built ${when}${another ? ', for another version of Pacenote: set up again to update it' : ''}`,
  notBuilt: 'Not built yet',
  diagramImage: 'Diagram image',
  diagramNotBuilt: 'Not built yet (with diagrams on, setup builds it)',
  brokerImage: 'Broker image',
  broker: 'Broker',
  brokerHelp:
    'Runs the tools with your credentials, in a VM of its own that starts with Pace. Its settings and files apply when Pace restarts.',
  refresh: 'Refresh',
  restartNeeded: 'Restart Pace needed',
  restartInTerminal: 'Restart Pace in the terminal yourself',
  restart: 'Restart Pace',
  saved: 'Saved. The next request uses it.',
  allowlist: 'Allowed outbound domains',
  allowlistHelp:
    'Domains the reasoner sandbox can reach directly through the proxy. Only HTTPS (443) and only exact name matches are allowed. The next request uses the saved list.',
  allowlistWarning:
    'Opening a domain lets the reasoner sandbox send data there directly. For internal systems that need tokens (GitHub etc.), connect them as ops-broker tools instead of opening the domain. (The tokens stay out of the sandbox)',
  required: 'Needed by reasoner CLI',
  added: 'Added',
  remove: (domain: string) => `Remove ${domain}`,
  add: 'Add',
  revert: 'Revert',
  save: 'Save',
  /** A job's state and how long it took: failed (code 1), 2m 3s */
  jobState: (
    state: 'running' | 'succeeded' | 'failed',
    code: string,
    elapsed: string
  ) => `${state === 'failed' ? `failed (code ${code})` : state}, ${elapsed}`,
}

const ko: typeof en = {
  jobTip: (help, script) => `${help} 저장소에서 실행: pnpm ${script}`,
  ready: '준비됨',
  checking: '확인 중',
  unsupported: '이 Mac에서는 쓸 수 없어요',
  helperDown: 'pacenote-vm이 응답하지 않았어요',
  settingUp: '설정 중',
  updateNeeded: '업데이트 필요',
  needsSetup: '설정 필요',
  checked: (when) => `이 Mac의 내장 샌드박스, ${when} 확인`,
  checkAgain: '다시 확인',
  thisMac: '이 Mac',
  kernel: 'Linux 커널',
  kernelMissing: '아직 받지 않음 (약 14 MB, 한 번만)',
  initfs: 'Init 파일 시스템',
  initfsMissing: '아직 준비하지 않음',
  reasonerImage: '답변 CLI 이미지',
  builtOn: (when, base, another) =>
    `${when} ${base} 기반으로 빌드함${another ? ', 다른 버전의 Pacenote용: 다시 설정하면 업데이트돼요' : ''}`,
  built: (when, another) =>
    `${when} 빌드함${another ? ', 다른 버전의 Pacenote용: 다시 설정하면 업데이트돼요' : ''}`,
  notBuilt: '아직 빌드하지 않음',
  diagramImage: '다이어그램 이미지',
  diagramNotBuilt: '아직 빌드하지 않음 (다이어그램을 켜면 설정할 때 빌드해요)',
  brokerImage: '브로커 이미지',
  broker: '브로커',
  brokerHelp:
    '내 자격 증명으로 도구를 실행해요. Pace와 함께 시작하는 별도 VM에서 돌아가요. 설정과 파일은 Pace를 다시 시작하면 적용돼요.',
  refresh: '새로고침',
  restartNeeded: 'Pace 다시 시작 필요',
  restartInTerminal: '터미널에서 직접 Pace를 다시 시작하세요',
  restart: 'Pace 다시 시작',
  saved: '저장했어요. 다음 요청부터 적용돼요.',
  allowlist: '외부 연결 허용 도메인',
  allowlistHelp:
    '답변 CLI 샌드박스가 프록시를 거쳐 바로 접속할 수 있는 도메인이에요. HTTPS(443)만, 이름이 정확히 같을 때만 허용해요. 저장한 목록은 다음 요청부터 적용돼요.',
  allowlistWarning:
    '도메인을 열면 답변 CLI 샌드박스가 그곳으로 데이터를 바로 보낼 수 있어요. 토큰이 필요한 내부 시스템(GitHub 등)은 도메인을 열지 말고 ops-broker 도구로 연결하세요. (토큰은 샌드박스 밖에 있어요)',
  required: '답변 CLI에 필요',
  added: '추가됨',
  remove: (domain) => `${domain} 삭제`,
  add: '추가',
  revert: '되돌리기',
  save: '저장',
  jobState: (state, code, elapsed) =>
    `${state === 'running' ? '실행 중' : state === 'succeeded' ? '성공' : `실패 (코드 ${code})`}, ${elapsed}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
