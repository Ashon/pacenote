import type { Locale } from '@src/i18n/locale'

/** What a session made: its cards, the chip under its title and the list */
type FileKind = 'html' | 'image' | 'pdf' | 'markdown'

const en = {
  /** Where it is: on claude.ai, or a file on the Mac the session runs on */
  page: 'Page on claude.ai',
  typed: (typeName?: string) =>
    typeName ? `${typeName} on claude.ai` : 'Artifact on claude.ai',
  doc: 'Doc on claude.ai',
  file: (kind: FileKind, here: boolean) =>
    `${{ html: 'HTML page', image: 'Image', pdf: 'PDF', markdown: 'Markdown' }[kind]} on ${here ? 'this Mac' : 'your Mac'}`,
  version: (version: number) => `version ${version}`,
  updatedHere: (times: number) =>
    times === 1
      ? 'updated once here'
      : times === 2
        ? 'updated twice here'
        : `updated ${times} times here`,
  onlyYou: 'Only you',
  onlyYouHint: 'Only you can open it on claude.ai until you share it there.',
  untitled: 'Untitled',
  open: 'Open',
  openTitle: (title: string) => `Open ${title}`,
  showInFinder: 'Show in Finder',
  // The chip under a session's title, and its list
  madeHere: (count: number) => `Made here ${count}`,
  madeInSession: 'Made in this session',
  opensSignedIn:
    'Opens in your browser, signed in as you. Pacenote keeps only the link.',
  // A task's row of what its sessions made
  madeLabel: 'Made here',
  shareFirst: (who?: string) =>
    `Only you can open these. Share them on claude.ai before you send ${who ?? 'anyone'} a link.`,
}

const ko: typeof en = {
  page: 'claude.ai의 페이지',
  typed: (typeName) =>
    typeName ? `claude.ai의 ${typeName}` : 'claude.ai의 아티팩트',
  doc: 'claude.ai의 문서',
  file: (kind, here) =>
    `${here ? '이 Mac' : '내 Mac'}의 ${{ html: 'HTML 페이지', image: '이미지', pdf: 'PDF', markdown: 'Markdown' }[kind]}`,
  version: (version) => `버전 ${version}`,
  updatedHere: (times) =>
    `여기서 ${times === 1 ? '한 번' : times === 2 ? '두 번' : `${times}번`} 고침`,
  onlyYou: '나만',
  onlyYouHint: 'claude.ai에서 공유하기 전까지는 나만 열 수 있어요.',
  untitled: '제목 없음',
  open: '열기',
  openTitle: (title) => `${title} 열기`,
  showInFinder: 'Finder에서 보기',
  madeHere: (count) => `만든 것 ${count}`,
  madeInSession: '이 세션에서 만든 것',
  opensSignedIn:
    '내 브라우저에서 내 로그인으로 열려요. Pacenote는 링크만 가지고 있어요.',
  madeLabel: '만든 것',
  shareFirst: (who) =>
    `나만 열 수 있어요. ${who ? `${who}에게` : '다른 사람에게'} 링크를 보내기 전에 claude.ai에서 공유하세요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
