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
  /**
   * Closed by itself: you replied in its thread after it, its message got a
   * check mark, or it was resolved in Slack some other way
   */
  closed?: { at: string; why: 'replied' | 'checked' | 'resolved' }
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
