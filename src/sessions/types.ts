import type { SessionItem, WorkTool } from '../tasks/types.js'

/**
 * Sessions (the desktop app's Sessions screen): the Claude Code and Codex
 * sessions on this Mac, where each runs, whether it is working or waiting for
 * you, and the task it is for. Read on this Mac from the tools' own lists and
 * logs; nothing from them leaves it but for your own devices and your other
 * Macs that ask, over their sealed channel (src/macs/asks.ts).
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
  /**
   * The background tasks it runs where it is open (the Claude app, a
   * terminal): moving it here would stop them, so it stays there for now
   */
  background?: number
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
 * Another of your Macs and its sessions, as it showed them to this one
 * (src/macs/asks.ts MAC_ASKS), read there each time you look
 */
export interface MacSessions {
  mac: { id: string; name: string }
  /** Its sessions, while Sessions is on there */
  view?: SessionsView
  /**
   * Why it shows none: Sessions is off there (off), Pacenote there is older
   * than 0.6.38 (update), or it did not answer (unreachable)
   */
  missing?: 'off' | 'update' | 'unreachable'
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
  /**
   * What you sent that Claude Code has not read yet, oldest first: it reads
   * each once the step it is on is done
   */
  queued?: { text: string; at: string }[]
  /** The model it runs on, as Claude Code names it: claude-opus-5-5 */
  model?: string
  /**
   * How much of the model's context the conversation took at its last turn,
   * in tokens: Claude Code compacts it as it fills
   */
  context?: { used: number; window: number }
  /** Why its last turn, or its run, stopped short */
  error?: string
}

/**
 * A step of the plan Claude Code keeps while it works (its task list): to do,
 * under way, with what it does then, or done
 */
export interface SessionPlanStep {
  text: string
  state: 'todo' | 'doing' | 'done'
  /** What it says while on it: "Running the tests" */
  doing?: string
}

/**
 * What a session made (A1, A2): a page, an artifact made from a type or a doc
 * it put on claude.ai, or a file in its folder a Codex answer linked. One
 * each, as last published; read from the session's log alone, never from
 * claude.ai.
 */
export interface MadeThing {
  /** Its claude.ai link, or the file's path: what its turns name it by */
  key: string
  kind: 'page' | 'typed' | 'doc' | 'file'
  /** As the log names it; empty when it does not */
  title: string
  /** On claude.ai: opens in your browser, signed in as you */
  url?: string
  /** A file, on the Mac the session runs on */
  path?: string
  /** A file's kind */
  file?: 'html' | 'image' | 'pdf' | 'markdown'
  /** The type it is made from, when the log names it: "Design" */
  typeName?: string
  /** Its version on claude.ai, as published last */
  version?: number
  /** How many times this session published it */
  times: number
  /** Only you can open it on claude.ai, as published last */
  onlyYou?: boolean
  /** When it was published last, or linked */
  at?: string
}

/**
 * A session's page: the row, its conversation from its tool's own log, and
 * where you type to it: here (Pacenote runs it, or will once you send it
 * something); here too for one resting in the Claude app or a terminal,
 * which moves here as you send (move); where it is open now (elsewhere), or
 * in Codex
 */
export interface SessionTalk {
  row: SessionRow
  /** The group it is in, for the way back */
  group?: string
  items: SessionItem[]
  /** Its plan, from its log, while a step of it is left */
  plan?: SessionPlanStep[]
  /**
   * What it made, in the order it first made them; its turns name each by
   * its key. A Mac before 0.6.40 leaves it out.
   */
  made?: MadeThing[]
  /** Pacenote runs it */
  live?: SessionLive
  typeIn: 'here' | 'move' | 'elsewhere' | 'codex'
  /** Why its log could not be read */
  error?: string
  /**
   * Another of your Macs has it: its page is read from there (MacSessions),
   * and you type to it there
   */
  mac?: { id: string; name: string }
}

/**
 * A new session Pacenote runs for a task, before you start it (V5): its first
 * message, which you may change, and the folder it runs in
 */
export interface NewSessionDraft {
  /** The task, what came before it, and how to go about it */
  prompt: string
  /** The marker in the prompt: the id its work entry takes */
  marker: string
  /** The folder its repository opened in last */
  folder?: string
}

/** What starts a new session Pacenote runs (V5) */
export interface NewSessionStart {
  /** The open task it is the work of, from Todo's Continue */
  task?: string
  folder: string
  /** Its first message */
  message: string
  mode?: SessionMode
  /** The marker in the message, from its draft */
  marker?: string
}
