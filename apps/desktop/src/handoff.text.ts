import type { Locale } from '../../../src/i18n/locale.js'
import { josa } from '../../../src/i18n/korean.js'
import type { WorkTool } from '../../../src/tasks/types.js'

/** Opening a task's session, and signing a CLI in, as the screen hears it */
const en = {
  /** macOS's own Terminal, as macOS names it */
  terminal: 'Terminal',
  didNotOpen: (terminal: string, error: string) =>
    `${terminal} did not open (${error}). Choose another terminal in Settings > Todo.`,
  noApp: (tool: WorkTool) =>
    tool === 'opencode'
      ? 'opencode opens in your terminal: it has no desktop app to write the task into.'
      : `The ${tool === 'codex' ? 'Codex app' : 'Claude app'} isn't on this Mac, so the session opened in your terminal.`,
  openedInClaude:
    'Opened in the Claude app with the task written in. Confirm the folder there, then send it.',
  openedInCodex:
    'Opened in the Codex app with the task written in. Send it there to start.',
  notFoundYet: 'Its session has not been found yet.',
  /** What the sign-in script says once the CLI is signed in */
  signedIn: 'Signed in. Collect again in Pacenote.',
}

const ko: typeof en = {
  terminal: '터미널',
  didNotOpen: (terminal, error) =>
    `${josa(terminal, '이/가')} 열리지 않았어요(${error}). 설정 > 할 일에서 다른 터미널을 선택하세요.`,
  noApp: (tool) =>
    tool === 'opencode'
      ? 'opencode는 할 일을 적어 둘 데스크톱 앱이 없어서 터미널에서 열었어요.'
      : `이 Mac에 ${tool === 'codex' ? 'Codex 앱이' : 'Claude 앱이'} 없어서 터미널에서 세션을 열었어요.`,
  openedInClaude:
    'Claude 앱에 할 일을 적어 열었어요. 그곳에서 폴더를 확인한 뒤 보내세요.',
  openedInCodex: 'Codex 앱에 할 일을 적어 열었어요. 그곳에서 보내면 시작돼요.',
  notFoundYet: '아직 세션을 찾지 못했어요.',
  signedIn: '로그인했어요. Pacenote에서 다시 모으세요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
