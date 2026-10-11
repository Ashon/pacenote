/**
 * Your own tasks, gathered from Slack (docs/proposals/personal-tasks.md). The
 * bot writes tasks.json (src/tasks/store.ts); the desktop app writes your
 * decisions to tasks-decisions.json. Plain data, so the UI and the MCP server
 * read the same shapes.
 */

/** asked: someone asked you; promised: you said you would */
export type TaskKind = 'asked' | 'promised'

/** maybe: a guess the reasoner is not sure about, kept out of the list */
export type TaskConfidence = 'sure' | 'maybe'

export interface TaskSource {
  /** Slack conversation ID */
  conversation: string
  /** "#payments", "DM with mina" */
  label: string
  /** The message the task comes from (Slack ts) */
  message: string
  /** Its thread, when it is in one or has replies */
  thread?: string
  permalink?: string
}

export interface Task {
  /** "<conversation>:<message>": one task per source message */
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
  /** When a collection found it (ISO) */
  foundAt: string
  /**
   * Closed by itself: you replied in its thread after it, or its message got a
   * check mark
   */
  closed?: { at: string; why: 'replied' | 'checked' }
}

export interface TasksFile {
  version: 1
  /** When the last collection finished (ISO) */
  collectedAt?: string
  /** Per conversation, the newest message read so far (Slack ts) */
  readUpTo: Record<string, string>
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

/**
 * Collecting, as the bot status reports it (BotStatus.tasks); the screen shows
 * the progress
 */
export interface TasksStatus {
  /** off: no user token, or not available with this connection */
  state: 'off' | 'idle' | 'collecting'
  /** Why it is off, or what it is doing */
  detail?: string
  /** collecting: reading, picking */
  step?: 'reading' | 'picking'
  collectedAt?: string
  /** The last collection failed */
  error?: string
}
