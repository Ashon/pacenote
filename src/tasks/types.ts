/**
 * Your own tasks, gathered from your sources (src/tasks/sources.ts,
 * docs/proposals/personal-tasks.md): AI tools read them with their own
 * connectors and add tasks through Pacenote's MCP server, which writes
 * tasks.json (src/tasks/store.ts); the desktop app writes your decisions to
 * tasks-decisions.json, and records the collections it runs as runs in the run
 * history (src/tasks/collections.ts reads them for the Todo screen). Plain
 * data, so the UI and the MCP server read the same shapes.
 */

import type { TokenUsage } from '../history/usage.js'
import type { SourceId } from './sources.js'

/** asked: someone asked you; promised: you said you would */
export type TaskKind = 'asked' | 'promised'

/** maybe: a guess the reasoner is not sure about, kept out of the list */
export type TaskConfidence = 'sure' | 'maybe'

/**
 * What doing it takes, as the collection judged it: code (a change or a look
 * in a repository), reply (an answer in the thread), or other
 */
export type TaskAction = 'code' | 'reply' | 'other'

export interface TaskSource {
  /** The source it was found in; tasks from before there were sources: Slack */
  app?: SourceId
  /** Where in the source: a Slack conversation ID */
  conversation: string
  /** "#payments", "DM with mina" */
  label: string
  /** The message the task comes from: a Slack ts */
  message: string
  /** Its thread, when it is in one or has replies */
  thread?: string
  permalink?: string
}

export interface Task {
  /** From its message (Source.taskId): one task per message */
  id: string
  source: TaskSource
  /** Imperative, short: "Review the payment retry PR" */
  title: string
  /** Who asked, by display name (for a promise: you) */
  askedBy?: string
  kind: TaskKind
  /** A due hint in words: "Thursday", "before the release" */
  due?: string
  confidence: TaskConfidence
  /** Why it is a task, in one line */
  reason: string
  /** When the source message was posted (ISO) */
  postedAt: string
  /** When it was added (ISO) */
  foundAt: string
  /** The AI tool that added it ("claude-code") */
  addedBy?: string
  /** What doing it takes; older tasks have none: other */
  action?: TaskAction
  /** The repository it is about, as owner/name */
  repo?: string
  /**
   * The thread in two or three sentences, written when it was collected: who
   * wants what, and why. Pacenote keeps no messages, so this is the reminder.
   */
  summary?: string
  /**
   * What later collections changed as its thread went on (a new due date, a
   * sharper ask, the repository named), or filled in, oldest first
   */
  updates?: TaskUpdate[]
  /**
   * How it ended, written by a collection from its thread once it was done or
   * closed: what was done or decided and by whom, and anything left after it.
   * The reminder an earlier task gives the next one.
   */
  wrapUp?: { at: string; text: string; by?: string }
  /**
   * Closed by itself: you replied in its thread after it, its message got a
   * check mark, or it was resolved in Slack some other way. An AI tool that
   * closes it (a session you continued it in) can say what it did and leave
   * a reply for you to send.
   */
  closed?: {
    at: string
    why: 'replied' | 'checked' | 'resolved'
    /** The AI tool that closed it ("claude-code") */
    by?: string
    /** What was done, in a line */
    note?: string
    /** A reply drafted for you to send in the thread */
    reply?: string
  }
}

/** A field update_task can change */
export type TaskField =
  'title' | 'due' | 'summary' | 'action' | 'repo' | 'confidence'

/** One change to a task after it was added, and why */
export interface TaskUpdate {
  at: string
  /** Why, in a line: "mina moved it to Wednesday" */
  why: string
  /** The AI tool that changed it ("claude-code") */
  by?: string
  /** What changed: from (none when it was filled in) and to (none: cleared) */
  changed: { field: TaskField; from?: string; to?: string }[]
}

export interface TasksFile {
  version: 1
  /** When an AI tool last finished collecting (ISO) */
  collectedAt?: string
  tasks: Task[]
}

/** Why a task was dismissed, when you say */
export type DismissReason = 'not-mine' | 'done-already' | 'not-worth-it'

export interface TaskDecision {
  /** kept: a Maybe you moved into the list */
  status: 'done' | 'dismissed' | 'kept'
  reason?: DismissReason
  at: string
}

export type TaskDecisions = Record<string, TaskDecision>

export type TaskStatus = 'open' | 'maybe' | 'done' | 'dismissed' | 'closed'

/** A task as the screen and my_tasks show it */
export interface TaskView extends Task {
  status: TaskStatus
  /** When it was done, dismissed or closed */
  settledAt?: string
  dismissReason?: DismissReason
  /** Open for a while: shown faded */
  faded: boolean
}

export interface TasksView {
  tasks: TaskView[]
  collectedAt?: string
  /** Of the tasks you settled by hand, the share you dismissed (0 to 1) */
  dismissRate?: number
  /**
   * A channel you kept dismissing as not for you, to offer leaving it out
   */
  leaveOut?: { conversation: string; label: string; count: number }
}

/** How a collection from the app ended, and what it spent */
export type CollectOutcome = (
  | { at: string; ok: true; added: number; maybe: number; skipped: number }
  | { at: string; ok: false; error: string }
) & {
  /** Slack lookups it made */
  reads?: number
  /** Tokens Claude Code reported for it */
  usage?: TokenUsage
}

/**
 * A collection the app ran, as Recent collections lists it: from its run in
 * the history, or from the log the app kept before (tasks-collections.json).
 * Collect now is the only way the app starts one.
 */
export type CollectionRecord = CollectOutcome & {
  startedAt: string
  trigger: 'now'
  /** Its run in the history (none for the old log's) */
  runId?: string
}

/**
 * Collect now on the Todo screen: the collection running (how many Slack
 * reads so far), and how the last one ended
 */
export interface TasksCollect {
  running?: { startedAt: string; reads: number }
  last?: CollectOutcome
}

/** Where a task's work went on: Claude Code or Codex on this Mac */
export type WorkTool = 'claude' | 'codex'

/**
 * A task's work log, kept by the desktop app (tasks-work.json): the sessions it
 * opened or found for the task and the replies it drafted. Sessions keep their
 * id and folder only; their content stays in the tool's own log.
 */
export type WorkEntry =
  | {
      kind: 'session'
      /** This entry's id, also the marker in the session's first prompt */
      id: string
      task: string
      tool: WorkTool
      /** The tool's session id; Codex's is found after it starts */
      session?: string
      cwd: string
      startedAt: string
      /** When it was opened again to continue */
      resumedAt?: string[]
      /** Found in the tool's log (a session you started yourself) */
      found?: boolean
    }
  | {
      kind: 'draft'
      id: string
      task: string
      at: string
      /** The reply as drafted, then as you copied it */
      text: string
      /** When you copied it and opened the thread */
      copiedAt?: string
    }

export interface WorkFile {
  version: 1
  entries: WorkEntry[]
}

/** A run of Pace's in the task's thread, as its detail lists it */
export interface RelatedRun {
  id: string
  request: string
  at: string
  status: 'running' | 'succeeded' | 'failed' | 'interrupted'
}

/** An earlier task, with how it ended */
export interface RelatedTask {
  id: string
  title: string
  askedBy?: string
  where: string
  postedAt: string
  status: TaskStatus
  /** How it ended, in words: "Done in Claude Code · 2 comments" */
  outcome?: string
  /** Its wrap-up, from its thread (Task.wrapUp) */
  wrapUp?: string
  /** Its last session, to continue it */
  session?: Extract<WorkEntry, { kind: 'session' }>
}

/**
 * What came before a task: its thread, its repository, and the person who
 * asked, each with the earlier tasks and runs that share it
 */
export interface TaskContext {
  thread: { runs: RelatedRun[]; tasks: RelatedTask[] }
  repo?: { name: string; tasks: RelatedTask[] }
  person?: { name: string; tasks: RelatedTask[] }
}

/** A folder checked as a repository's checkout */
export interface FolderCheck {
  path: string
  /** The origin remote, when it has one */
  remote?: string
  /** Its remote is the task's repository */
  matches: boolean
  /** Changes not committed */
  changes?: number
  error?: string
}

/** One turn or step of a Claude Code or Codex session, as its log shows it */
export interface SessionItem {
  role: 'user' | 'assistant' | 'tool'
  text: string
  at?: string
  /** A tool step's name */
  name?: string
}

/** A task as its detail shows it, from the desktop app */
export interface TaskDetail {
  task: TaskView
  context: TaskContext
  /** Its work log, newest first; a session with when it was last active */
  work: (
    | (Extract<WorkEntry, { kind: 'session' }> & {
        lastActiveAt?: string
        /** The command that continues it, to copy */
        resume?: string
      })
    | Extract<WorkEntry, { kind: 'draft' }>
  )[]
  /** How it ended, once settled: "Done in Claude Code · 3 comments" */
  outcome?: string
  /** The task's repository's folder on this Mac, when known */
  folder?: string
  /** Where code tasks continue (Settings > Todo) */
  cli: WorkTool
}
