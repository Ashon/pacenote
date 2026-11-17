import type { SessionItem, WorkTool } from '../tasks/types.js'

/**
 * Sessions (the desktop app's Sessions screen): the Claude Code and Codex
 * sessions on this Mac, where each runs, whether it is working or waiting for
 * you, and the task it is for. Read on this Mac from the tools' own lists and
 * logs; nothing from them leaves it.
 */

/**
 * Where a session runs, and so where opening it goes; pacenote: Pacenote runs
 * it, from its page (session-host.ts)
 */
export type SessionWhere =
  'claude-app' | 'terminal' | 'web' | 'codex-app' | 'pacenote'

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
  /** It waits for you to answer what it asks (Pacenote runs it) */
  asks?: SessionAskKind
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

/**
 * What a session Pacenote runs asks before it acts: to run a command, to
 * change a file, to go online, to go ahead with its plan, or another tool
 */
export type SessionAskKind = 'command' | 'edit' | 'web' | 'plan' | 'tool'

export interface SessionAsk {
  /** Claude Code's id for the ask, to answer it */
  id: string
  kind: SessionAskKind
  /** The tool's name as Claude Code shows it: Bash, Edit, mcp__… */
  tool: string
  /** What it would do: the command, the file, the address, the plan */
  what: string
  /**
   * What "allow in this session" lets it do from then on without asking,
   * when Claude Code offers that: "pnpm vitest"
   */
  rule?: string
  at: string
}

/** How Claude Code asks before it acts, as Claude Code names the modes */
export type SessionMode = 'default' | 'acceptEdits' | 'plan' | 'auto'

/** A session as Pacenote runs it, from what Claude Code tells it */
export interface SessionLive {
  /** On a turn */
  busy: boolean
  /** What it waits for you to answer, the first of them */
  ask?: SessionAsk
  /** Its mode now: one of SessionMode, or another Claude Code has */
  mode?: string
  /** The step it is on, while on a turn */
  step?: { name: string; text: string }
  /**
   * What it does this moment, while on a turn: thinks, writes its answer, or
   * runs a step; none while it starts or between them
   */
  doing?: 'thinking' | 'writing' | 'tool'
  /** When its turn began */
  since?: string
  /** What it has written of the answer it is writing, as it comes */
  draft?: string
  /** Why its last turn, or its run, stopped short */
  error?: string
}

/**
 * A session's page: the row, its conversation from its tool's own log, and
 * where you type to it: here (Pacenote runs it, or will once you send it
 * something), where it is open now (elsewhere), or in Codex
 */
export interface SessionTalk {
  row: SessionRow
  /** The group it is in, for the way back */
  group?: string
  items: SessionItem[]
  /** Pacenote runs it */
  live?: SessionLive
  typeIn: 'here' | 'elsewhere' | 'codex'
  /** Why its log could not be read */
  error?: string
}
