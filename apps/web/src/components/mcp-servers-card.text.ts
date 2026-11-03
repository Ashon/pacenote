import type { Locale } from '@src/i18n/locale'
import type { McpServerIssue, McpServerPlace } from '@src/settings/mcp-servers'

const en = {
  title: 'MCP servers',
  help: 'HTTP MCP servers of yours that Pace may use when it answers. Pace reaches them from this Mac, so their headers and tokens never enter the sandbox.',
  waits:
    'Your servers work in the built-in sandbox; on this Mac, Pace uses none of them.',
  openSandbox: (section: string) => `Open ${section}`,
  none: 'No servers yet. Add one, or take one from Claude Code or Codex below.',
  add: 'Add server',
  addFound: 'Add',
  read: 'Read',
  write: 'Write',
  readHelp: 'Tools the server marks read-only.',
  writeHelp:
    'All its other tools: those that create, change, delete or send. Pace uses them only when asked.',
  place: {
    mac: 'On this Mac',
    network: 'Your network',
    internet: 'Internet',
  } satisfies Record<McpServerPlace, string>,
  outside:
    'Pace reaches this server from this Mac, outside the sandbox. Add only servers you trust.',
  from: (cli: 'claude' | 'codex', project?: string) =>
    `From ${cli === 'claude' ? 'Claude Code' : 'Codex'}${project ? ` · ${project}` : ''}`,
  name: 'Name',
  nameHelp: 'How Pace knows it: lowercase letters, digits, - and _.',
  url: 'URL',
  urlHelp: 'Streamable HTTP, or SSE for older servers.',
  headers: 'Headers',
  headersHelp:
    'Sent with each request, such as Authorization: Bearer <token>. Kept in a file only you read.',
  headerName: 'Header',
  headerValue: 'Value',
  kept: 'Saved',
  replace: 'Replace',
  addHeader: 'Add header',
  removeHeader: (name: string) => `Remove ${name}`,
  check: 'Check tools',
  checking: 'Checking…',
  tools: (n: number) => (n === 1 ? '1 tool' : `${n} tools`),
  notUsed: 'Not used',
  save: 'Save',
  cancel: 'Cancel',
  remove: 'Remove',
  found: 'Found in your AI tools',
  foundHelp:
    'HTTP servers in Claude Code and Codex on this Mac. Adding one copies it here, with Read on and Write off.',
  needs: (headers: string[]) =>
    `Its ${headers.join(', ')} ${headers.length === 1 ? 'is' : 'are'} kept elsewhere: fill in to add it.`,
  issue: {
    name: 'Use lowercase letters, digits, - and _ (up to 40).',
    nameTaken: 'Another server has this name.',
    nameReserved: 'Pace uses this name for its own tools.',
    url: 'Give an http:// or https:// URL.',
    header: 'A header name has a character HTTP does not allow.',
    notFound: 'This server is not here any more.',
  } satisfies Record<McpServerIssue, string>,
  changed: 'Unsaved changes',
}

const ko: typeof en = {
  title: 'MCP 서버',
  help: 'Pace가 답할 때 쓸 수 있는 내 HTTP MCP 서버예요. Pace가 이 Mac에서 연결하므로 헤더와 토큰은 샌드박스에 들어가지 않아요.',
  waits:
    '내 서버는 내장 샌드박스에서 쓰여요. 이 Mac에서 실행될 때 Pace는 어느 서버도 쓰지 않아요.',
  openSandbox: (section) => `${section} 열기`,
  none: '아직 서버가 없어요. 직접 추가하거나 아래에서 Claude Code나 Codex의 서버를 가져오세요.',
  add: '서버 추가',
  addFound: '추가',
  read: '읽기',
  write: '쓰기',
  readHelp: '서버가 읽기 전용으로 표시한 도구예요.',
  writeHelp:
    '그 밖의 모든 도구예요. 만들고, 바꾸고, 지우고, 보내는 도구로, Pace는 요청받았을 때만 써요.',
  place: {
    mac: '이 Mac',
    network: '내 네트워크',
    internet: '인터넷',
  },
  outside:
    'Pace는 이 서버에 샌드박스 밖, 이 Mac에서 연결해요. 믿을 수 있는 서버만 추가하세요.',
  from: (cli, project) =>
    `${cli === 'claude' ? 'Claude Code' : 'Codex'}에서${project ? ` · ${project}` : ''}`,
  name: '이름',
  nameHelp: 'Pace가 부르는 이름이에요. 영문 소문자, 숫자, -와 _를 써요.',
  url: 'URL',
  urlHelp: 'Streamable HTTP, 오래된 서버는 SSE예요.',
  headers: '헤더',
  headersHelp:
    'Authorization: Bearer <토큰>처럼 요청마다 보내는 값이에요. 나만 읽는 파일에 보관해요.',
  headerName: '헤더',
  headerValue: '값',
  kept: '저장됨',
  replace: '바꾸기',
  addHeader: '헤더 추가',
  removeHeader: (name) => `${name} 지우기`,
  check: '도구 확인',
  checking: '확인하는 중…',
  tools: (n) => `도구 ${n}개`,
  notUsed: '사용 안 함',
  save: '저장',
  cancel: '취소',
  remove: '삭제',
  found: 'AI 도구에서 찾은 서버',
  foundHelp:
    '이 Mac의 Claude Code와 Codex에 있는 HTTP 서버예요. 추가하면 여기로 복사되고, 읽기는 켜지고 쓰기는 꺼진 채로 시작해요.',
  needs: (headers) =>
    `${headers.join(', ')} 값은 다른 곳에 있어요. 채우면 추가할 수 있어요.`,
  issue: {
    name: '영문 소문자, 숫자, -와 _로 40자까지 쓸 수 있어요.',
    nameTaken: '같은 이름의 서버가 있어요.',
    nameReserved: 'Pace가 자기 도구에 쓰는 이름이에요.',
    url: 'http:// 또는 https:// URL을 넣어 주세요.',
    header: '헤더 이름에 HTTP가 허용하지 않는 문자가 있어요.',
    notFound: '이 서버는 이제 없어요.',
  },
  changed: '저장하지 않은 변경',
}

export const text: Record<Locale, typeof en> = { en, ko }
