import type { WorkTool } from '../tasks/types.js'

/**
 * Sessions (the desktop app's Sessions screen): the Claude Code and Codex
 * sessions on this Mac, where each runs, whether it is working or waiting for
 * you, and the task it is for. Read on this Mac from the tools' own lists and
 * logs; nothing from them leaves it.
 */

/** Where a session runs, and so where opening it goes */
export type SessionWhere = 'claude-app' | 'terminal' | 'web' | 'codex-app'

/**
 * Working (the tool is on a turn), your turn (it stopped within the last 30
 * minutes), quiet (it stopped longer ago), or ended (closed today)
 */
export type SessionState = 'working' | 'turn' | 'quiet' | 'ended'

export interface SessionRow {
  /** tool:session, unique across the tools */
  id: string
  tool: WorkTool
  /** The tool's own id for it */
  session: string
  /** Its title: yours, else the tool's, else what you typed first */
  title: string
  where: SessionWhere
  /** The app it runs in when that is a terminal: "iTerm", "Ghostty" */
  terminal?: string
  state: SessionState
  /** When it last wrote to its log */
  lastAt: string
  startedAt: string
  cwd: string
  branch?: string
  /** owner/name, from its folder's origin remote */
  repo?: string
  /** What you typed last, newest first, a few at most */
  typed: { at?: string; text: string }[]
  /** The task it worked on, when it is linked to one */
  task?: { id: string; title: string }
  /**
   * The open task it looks like, by the words they share, until you say
   * whether it is that task's work: id is the suggestion's
   */
  looksLike?: { id: string; task: { id: string; title: string } }
}

/** Sessions of one of your areas (You), one repository, or neither */
export interface SessionGroup {
  /** area:<id>, repo:<id>, or none */
  key: string
  /** The area's or the repository's name; none: not in a project */
  name?: string
  /** owner/name, when the group is one repository */
  repo?: string
  sessions: SessionRow[]
}

export interface SessionsView {
  /** Settings > Todo > Sessions on this Mac */
  on: boolean
  /** Open now, by area or repository, those not in one last */
  open: SessionGroup[]
  /** Ended today, newest first */
  ended: SessionRow[]
  counts: { open: number; working: number; turn: number; ended: number }
  /**
   * Whether Claude Code told which of its sessions are open; when it cannot,
   * its sessions that wrote today stand in for them
   */
  listed: boolean
  /** Before it is on: how many there are, and where they run */
  found?: {
    claude: { open: number; where: SessionWhere[] }
    codex: { today: number }
  }
}
