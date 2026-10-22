import type { SettingGroup, SettingSection } from './fields.js'

/**
 * The settings screen in Korean, beside the English in fields.ts: sections
 * and groups by id, fields by key (their options by value). A field or option
 * missing here stays English (tests/settings-ko.test.ts asks for every field).
 */
interface FieldWords {
  label?: string
  help?: string
  placeholder?: string
  options?: Record<string, { label?: string; help?: string }>
}

export const SECTIONS_KO: Record<
  SettingSection,
  { label: string; help: string }
> = {
  messengers: {
    label: '메신저',
    help: 'Pace가 답하는 채팅 앱과 그곳에서 물어볼 수 있는 사람이에요. 바꾼 내용은 Pace를 다시 시작하면 적용돼요.',
  },
  answers: {
    label: '답변',
    help: '답변을 쓰는 CLI와 요청을 처리하는 방식이에요. 바꾼 내용은 Pace를 다시 시작하면 적용돼요.',
  },
  sandbox: {
    label: '샌드박스',
    help: '요청마다 답변 CLI가 실행되는 곳이에요. 허용 도메인은 바로 적용되고, 나머지는 Pace를 다시 시작하면 적용돼요.',
  },
  ops: {
    label: '운영 도구',
    help: '답변 CLI가 ops-broker를 거쳐 부를 수 있는 도구예요. SSH 키, kubeconfig, 토큰은 답변 CLI의 VM이 아니라 브로커의 VM에만 있어요. 바꾼 내용은 Pace를 다시 시작하면 적용돼요.',
  },
  tasks: {
    label: '할 일',
    help: 'AI 도구가 Slack에서 모아 온 내 할 일이에요. 바꾼 내용은 바로 적용돼요.',
  },
  logs: {
    label: '기록 및 로그',
    help: 'Pace가 답한 뒤 남기는 것들이에요. 바꾼 내용은 Pace를 다시 시작하면 적용돼요.',
  },
}

export const GROUPS_KO: Record<SettingGroup, { label: string; help: string }> =
  {
    slack: {
      label: '연결',
      help: '이 데스크톱이 Slack에 닿는 방법이에요. 팀 허브를 거치거나 직접 만든 Slack 앱을 써요.',
    },
    access: {
      label: '물어볼 수 있는 사람',
      help: '나만 물어볼 수 있어요. Pace는 이 Mac에서 내 로그인으로 실행되기 때문에, 다른 사람이 멘션하면 그 사람에게만 보이는 안내를 받아요. 팀 허브에서는 팀원마다 자기 Pace를 페어링해요.',
    },
    reasoner: {
      label: '답변 CLI',
      help: '답변을 쓰는 로컬 CLI예요.',
    },
    requests: {
      label: '요청',
      help: '한 번에 답하는 멘션 수와 각 요청이 받는 맥락이에요.',
    },
    diagrams: {
      label: '다이어그램과 이미지',
      help: '답변 속 다이어그램과 생성한 이미지를 올리는 방식이에요.',
    },
    environment: {
      label: '실행 환경',
      help: '요청마다 답변 CLI가 실행되는 곳이에요.',
    },
    credentials: {
      label: '답변 CLI 로그인',
      help: '선택한 답변 CLI를 위해 샌드박스에 넘겨요. 이 Mac에 있는 내 CLI 로그인은 그곳에서 쓰이지 않아요.',
    },
    ops: {
      label: '운영 도구',
      help: '켜고 끈 내용은 Pace를 다시 시작하면 적용돼요.',
    },
    files: {
      label: '파일',
      help: '파일 도구는 작업 디렉터리를 읽고, 풀 리퀘스트는 그 안의 저장소에서 만들어요.',
    },
    github: {
      label: 'GitHub와 풀 리퀘스트',
      help: '아래 조직으로 한정한 GitHub 조회와 풀 리퀘스트예요. 풀 리퀘스트에는 작업 디렉터리도 필요해요.',
    },
    jira: {
      label: 'Jira',
      help: '허용한 프로젝트의 이슈 조회, 새 이슈, 댓글이에요.',
    },
    k8s: {
      label: 'Kubernetes',
      help: '읽기 전용 ServiceAccount용으로 만든 kubeconfig로 읽기만 해요.',
    },
    ssh: {
      label: 'SSH 호스트',
      help: '허용한 범위의 호스트를 읽기 전용으로 확인해요.',
    },
    ownWork: {
      label: 'Pacenote 자체 작업',
      help: '지금 모으기, 답장 초안, 끝난 것 같음, 회고의 정리하기는 이 Mac에서 내 로그인으로 화면 없이 실행돼요.',
    },
    tasks: {
      label: '할 일 모으기',
      help: '할 일 화면의 지금 모으기는 내 AI가 자기 Slack 커넥터로 Slack을 읽기 전용으로 읽고, 사람들이 내게 부탁한 일과 내가 하겠다고 한 일을 남겨요. 이를 위해 Pacenote가 Slack 토큰을 갖지는 않아요.',
    },
    work: {
      label: '이어서 작업하기',
      help: '코드 작업은 Claude Code나 Codex에서 이어가요. 할 일과 그 앞의 맥락을 담아 해당 저장소에서 터미널이나 데스크톱 앱으로 열려요. 세션은 내 계정과 권한으로 실행돼요.',
    },
    history: {
      label: '실행 기록',
      help: '요청마다 도구 호출, 답변, 출력을 기록해요.',
    },
    logs: {
      label: '로그',
      help: 'Pace가 로그에 남기는 내용이에요.',
    },
  }

/**
 * Fields by key. Filled in for every field shown on the screen; placeholders
 * only where they are words, not example values.
 */
export const FIELDS_KO: Record<string, FieldWords> = {
  SLACK_CONNECTION: {
    label: '연결',
    options: {
      hub: {
        label: '팀 허브',
        help: '팀의 허브 서버가 Slack 앱을 맡아요. 이 데스크톱은 허브를 거쳐 내 멘션에 답하고, Slack 토큰은 갖지 않아요.',
      },
      app: {
        label: '내 Slack 앱',
        help: '직접 만든 Slack 앱의 앱 토큰과 봇 토큰으로 Socket Mode에 연결해요. Pacenote를 혼자 쓸 때 골라요.',
      },
    },
  },
  HUB_URL: {
    label: '허브 URL',
    help: '팀 허브 관리자가 알려 준 주소예요.',
  },
  HUB_TOKEN: {
    label: '허브 토큰',
    help: '허브와 페어링하면 저장돼요. 허브에는 해시만 남아요.',
  },
  SLACK_APP_TOKEN: {
    label: '앱 토큰',
    help: 'Basic Information > App-Level Tokens(connections:write)에서 만들어요. Socket Mode 연결에 써요.',
  },
  SLACK_BOT_TOKEN: {
    label: '봇 토큰',
    help: 'OAuth & Permissions > Bot User OAuth Token에서 복사해요.',
  },
  SOCKET_CLIENT_PING_TIMEOUT_MS: {
    label: '클라이언트 핑 제한 시간(ms)',
    help: 'Pace가 보낸 핑에 이 시간 안에 응답이 없으면 다시 연결해요. (1000~60000)',
  },
  SOCKET_SERVER_PING_TIMEOUT_MS: {
    label: '서버 핑 제한 시간(ms)',
    help: 'Slack에서 이 시간 안에 핑이 오지 않으면 다시 연결해요. (5000~300000)',
  },
  MENTION_ALLOWED_USERS: {
    label: '내 Slack 멤버 ID',
    help: 'Pace는 이 Mac에서 내 로그인으로 실행되기 때문에 나에게만 답해요. Slack에서 내 프로필을 열고 ⋮를 누른 다음 멤버 ID 복사를 고르세요. 초기 설정에서 "@Pace 저예요"처럼 Pace를 멘션하면 자동으로 채워져요. 팀원은 각자 팀 허브를 거쳐 자기 Pace를 실행해요.',
  },
  REASONER: {
    label: '답변 CLI',
  },
  REASONER_MODEL: {
    label: '모델',
    help: '비워 두면 claude는 claude-opus-5-5를, codex는 ~/.codex/config.toml에 있는 모델을 써요.',
  },
  REASONER_TIMEOUT_SEC: {
    label: '제한 시간(초)',
  },
  MENTION_CONCURRENCY: {
    label: '동시 요청 수',
  },
  TIMEZONE: {
    label: '시간대',
    help: '스레드 맥락에 시각을 보여 줄 때 써요. 비워 두면 이 Mac의 시간대를 따라요.',
  },
  NOTES_LANGUAGE: {
    label: 'Pace가 직접 쓰는 글',
    help: 'Pace가 직접 쓰는 글의 언어예요. 답변 아래의 한 줄, 요청한 사람에게만 보이는 안내, 답변하지 못했을 때 남기는 글이 여기에 해당해요. 앱과 같게를 고르면 앱 언어를 따라요. 답변은 요청한 언어를 따라요.',
    options: { app: { label: '앱과 같게' } },
  },
  MENTION_WORKSPACE: {
    label: '참고 디렉터리',
    help: '답변할 때 읽기 전용으로 참고하는 절대 경로예요. 파일을 읽을 수 있는 실행 환경에서만 써요.',
  },
  RENDER_DIAGRAMS: {
    label: '다이어그램 렌더링',
    help: '답변 속 mermaid, dot, vega-lite, svg 블록을 내장 샌드박스의 VM에서 PNG로 그려 올려요. Pace가 이 Mac에서 실행되더라도 설정 > 샌드박스에서 내장 샌드박스를 준비해야 해요. 준비하기 전까지는 텍스트로 남아요.',
  },
  GENERATED_IMAGE_MAX_PX: {
    label: '생성한 이미지 최대 크기(px)',
    help: '올리기 전에 긴 변을 이 크기로 줄여요. 0이면 원래 크기를 유지해요.',
  },
  REASONER_SANDBOX: {
    label: '실행 환경',
    options: {
      none: {
        label: '이 Mac에서',
        help: 'CLI가 내 로그인으로 바로 실행돼요. 설정은 빠르지만 이 Mac과 격리되지 않아요.',
      },
      vm: {
        label: '내장 샌드박스',
        help: '요청마다 Pacenote에 내장된 가벼운 Linux VM에서 실행돼요. 따로 설치할 것은 없어요. 아래에서 설정한 로그인만 갖고, 밖으로는 허용 도메인으로만 나갈 수 있어요. Apple silicon과 macOS 15 이상이 필요해요.',
      },
    },
  },
  SANDBOX_MEMORY: {
    label: '메모리 한도',
    help: '요청마다 적용돼요. 예: 2g, 1536m',
  },
  SANDBOX_CPUS: {
    label: 'CPU 한도',
  },
  SANDBOX_CLAUDE_OAUTH_TOKEN: {
    label: 'claude 토큰',
    help: '샌드박스에서 Claude에 로그인하는 대신 쓰는 claude setup-token의 토큰이에요. 보통은 로그인을 써요.',
  },
  SANDBOX_ANTHROPIC_API_KEY: {
    label: 'Anthropic API 키',
    help: '샌드박스에서 Claude에 로그인하는 대신 쓰는 API 키예요.',
  },
  OPS_TOOLS: {
    label: '운영 도구 켜기',
    help: '아래 연동을 답변 CLI에 제공해요. 각 연동은 항목을 모두 채울 때까지 꺼져 있어요.',
  },
  OPS_FS_ROOT: {
    label: '작업 디렉터리',
    help: '읽기 전용으로 마운트할 작업 디렉터리의 절대 경로예요. 비워 두면 파일 도구와 PR 도구가 꺼져요.',
  },
  OPS_GIT_ALLOWED_OWNERS: {
    label: '허용 GitHub 조직',
    help: 'PR 생성과 GitHub 조회를 이 조직(또는 사용자)의 저장소로 한정해요. 쉼표로 구분해요. 비워 두면 GitHub 도구가 꺼져요.',
  },
  OPS_GIT_AUTHOR_NAME: {
    label: 'PR 커밋 작성자 이름',
    help: '샌드박스가 만드는 커밋의 작성자예요. 비워 두면 전역 git 설정(git config --global user.name)을 써요. 이 저장소의 git 설정과는 별개예요.',
  },
  OPS_GIT_AUTHOR_EMAIL: {
    label: 'PR 커밋 작성자 이메일',
    help: '비워 두면 전역 git 설정(git config --global user.email)을 써요.',
  },
  OPS_JIRA_URL: {
    label: 'Jira URL',
    help: 'Jira Cloud 사이트 URL이에요. URL, 이메일, 토큰, 프로젝트를 모두 설정해야 Jira 도구가 켜져요.',
  },
  OPS_JIRA_EMAIL: {
    label: 'Jira 계정 이메일',
    help: 'API 토큰을 가진 Atlassian 계정이에요. 이슈와 댓글은 이 계정으로 올라가요.',
  },
  OPS_JIRA_TOKEN: {
    label: 'Jira API 토큰',
    help: 'id.atlassian.com의 Security > API tokens에서 만들어요. 브로커의 VM에만 전달돼요.',
  },
  OPS_JIRA_PROJECTS: {
    label: '허용 Jira 프로젝트',
    help: '조회, 생성, 댓글을 이 프로젝트로 한정해요. 프로젝트 키를 쉼표로 구분해요.',
  },
  OPS_K8S_CONTEXTS: {
    label: 'k8s 컨텍스트',
    help: '읽기 전용 kubeconfig를 만들 로컬 kubeconfig 컨텍스트예요. 쉼표로 구분해요. 바꾼 뒤에는 kubeconfig를 다시 만드세요.',
  },
  OPS_K8S_SA: {
    label: 'k8s 읽기 전용 계정',
    help: '각 클러스터의 읽기 전용 ServiceAccount예요. (sandbox/k8s/pacenote-ro.yaml)',
  },
  OPS_K8S_SA_NAMESPACE: {
    label: 'k8s 읽기 전용 계정 네임스페이스',
  },
  OPS_SSH_USER: {
    label: 'SSH 사용자',
    help: '호스트 확인에 쓰는 계정이에요. 사용자, 허용 범위, 키를 모두 설정해야 호스트 확인이 켜져요.',
  },
  OPS_SSH_ALLOWED_CIDR: {
    label: '허용 SSH 범위',
    help: '이 범위에 있는 호스트만 SSH로 확인해요.',
  },
  OPS_SSH_KEY: {
    label: 'SSH 키 경로',
    help: '절대 경로예요. 키는 브로커의 VM에만 공유돼요.',
  },
  OPS_SSH_KNOWN_HOSTS: {
    label: 'SSH known_hosts 경로',
    help: '절대 경로예요. 비워 두면 첫 연결에서 받은 호스트 키를 브로커 안에서만 기억해요.',
  },
  OPS_SSH_INVENTORY_DIR: {
    label: '인벤토리 디렉터리',
    help: '호스트 목록을 만들 때 쓰는 ansible 프로젝트의 위치예요. 상대 경로는 이 저장소를 기준으로 해요. 비워 두면 ~/.pacenote/ops-broker/hosts.json을 직접 작성해요.',
  },
  OPS_SSH_INVENTORY: {
    label: '인벤토리 파일',
    help: '인벤토리 디렉터리 안의 상대 경로예요.',
  },
  HISTORY: {
    label: '실행 기록 남기기',
  },
  HISTORY_RETENTION_DAYS: {
    label: '기록 보관 기간(일)',
    help: '0이면 지우지 않아요.',
  },
  HISTORY_SHARE: {
    label: 'AI 도구와 공유',
    help: 'Claude Code나 Codex 같은 이 Mac의 AI 도구가 Pacenote의 MCP 서버로 실행 기록을 읽기 전용으로 읽을 수 있어요. 바로 적용돼요.',
  },
  TASKS_AI: {
    label: '실행할 AI',
    help: 'Claude Code는 claude.ai의 Slack 커넥터로, Codex는 ChatGPT의 Slack 앱으로 Slack을 읽어요. opencode는 로컬 모델이나 직접 호스팅하는 모델처럼 opencode에 설정한 모델로 실행되고, 아직 Slack은 읽지 않아요.',
  },
  TASKS_AI_OPENCODE_MODEL: {
    label: 'opencode 모델',
    help: 'opencode 설정에 있는 provider/model이에요. 비워 두면 opencode의 기본 모델을 써요.',
  },
  TASKS_AI_FALLBACK: {
    label: '안 될 때 전환하기',
    help: '사용 한도에 닿았거나, 쓸 수 없거나, 로그아웃됐거나, Slack 커넥터가 없으면 Claude Code나 Codex가 대신 작업해요. 한도에 닿은 쪽은 한도가 초기화될 때까지 기다려요.',
  },
  TASKS: {
    label: 'Slack에서 내 할 일 모으기',
    help: '처음에는 꺼져 있어요. 켜면 할 일 화면의 지금 모으기와, 아래에서 추가한 AI 도구가 쓰는 Pacenote MCP 서버의 할 일 도구가 켜져요. 실행 기록 공유 여부와는 상관없어요.',
  },
  TASKS_DMS: {
    label: 'DM과 그룹 DM 포함',
    help: '끄면 AI 도구에 DM을 빼라고 알리고, DM에서 나온 할 일은 추가하지 않아요.',
  },
  TASKS_EXCLUDE_CHANNELS: {
    label: '제외할 채널',
    help: '채널 이름이나 ID를 쉼표로 구분해요.',
  },
  TASKS_NAMES: {
    label: '나를 부르는 다른 이름',
    help: 'Slack 이름 말고 별명이나 다른 언어로 된 이름이에요. 이 이름으로 부른 요청은 멘션이 없어도 내 요청으로 봐요.',
  },
  TASKS_GROUPS: {
    label: '나를 뜻하는 그룹',
    help: '온콜 그룹처럼, 멘션되면 나에게 묻는 것으로 볼 Slack 사용자 그룹이에요. 다른 그룹 때문에 확실하지 않은 할 일이 처음 생기면, 할 일 화면에서 그 그룹이 나를 뜻하는지 물어요.',
  },
  TASKS_CLI: {
    label: '코드 작업을 열 곳',
    help: '코드 작업의 버튼을 누르면 할 일을 담아 여기서 세션을 열어요. Pacenote 자체 작업은 위에서 고른 AI로 실행돼요.',
  },
  TASKS_OPEN_IN: {
    label: '세션을 열 곳',
    help: '데스크톱 앱은 Claude 앱의 Code 탭이나 Codex 앱을 할 일이 입력된 채로 열고, 보내기는 내가 해요. 터미널은 내 터미널에서 claude나 codex를 실행해요.',
    options: {
      terminal: { label: '터미널' },
      app: { label: '데스크톱 앱' },
    },
  },
  TASKS_TERMINAL: {
    label: '터미널',
    help: '세션이 열리는 곳이에요. 데스크톱 앱을 골라도 Claude Code 세션을 이어갈 때와 이 Mac에 그 앱이 없을 때는 여기서 열어요. 자동은 열려 있는 터미널을, 없으면 마지막으로 쓴 터미널을 골라요.',
    options: {
      auto: { label: '자동' },
      terminal: { label: '터미널' },
    },
  },
  TASKS_PLAN_FIRST: {
    label: '계획부터 세우기',
    help: '세션이 할 일과 계획을 정리한 다음, 무엇이든 바꾸기 전에 내 확인을 기다려요.',
  },
  TASKS_LINK_SESSIONS: {
    label: '직접 시작한 세션 보이기',
    help: '직접 시작한 Claude Code와 Codex 세션을 할 일의 작업 기록에 더해요. 그 할 일에 Pacenote의 할 일 도구를 썼거나, 입력한 내용에 그 Slack 링크가 있었거나, 그 브랜치에서 작업한 세션이에요. 관련 있어 보이기만 하는 세션은 연결하도록 제안해요. 세션 로그는 이 Mac에서 읽고, 그 내용은 이 Mac 밖으로 나가지 않아요.',
  },
  TASKS_SUGGEST_DONE: {
    label: '끝난 것 같으면 알려 주기',
    help: '할 일의 최근 세션이 10분 동안 조용하면, 위에서 고른 AI가 도구 없이 마지막 대화와 풀 리퀘스트 상태를 읽고 끝난 것 같은지, 어떻게 끝났는지, 남은 일은 무엇인지 할 일에 적어요. 닫을지는 내가 정해요.',
  },
  LOG_LEVEL: {
    label: '로그 수준',
    help: 'debug에서는 Socket Mode 클라이언트의 자세한 로그도 남겨요.',
  },
  SOCKET_PING_PONG_LOG: {
    label: '핑/퐁 로그',
    help: '연결 유지 신호를 로그에 남겨요. 로그 수준이 debug일 때 보여요.',
  },
}
