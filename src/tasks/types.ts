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
import type { OwnCli, Switch, Unable } from './own-ai.js'
import type { TaskOrigin } from './sources.js'

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
  /**
   * The source it was found in, or local for one from a session on this Mac;
   * tasks from before there were sources: Slack
   */
  app?: TaskOrigin
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
  /** The task it carries on from: work a session left after that one */
  follows?: string
  /**
   * The user group it was asked of, as @handle, when that group is all that
   * made it maybe yours: Todo asks whether the group means you
   */
  group?: string
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

/** Who you are in Slack, as a collection's Slack connector sees you */
export interface SlackYou {
  /** Your member id: "U0123ABCD" */
  id: string
  /** Display name: "ashon" */
  name?: string
  /** Full name, when Slack has one */
  realName?: string
  /** The workspace's name */
  team?: string
  /** When a collection looked you up */
  seenAt: string
}

export interface TasksFile {
  version: 1
  /** When an AI tool last finished collecting (ISO) */
  collectedAt?: string
  tasks: Task[]
  /** Who you are in Slack, looked up by a collection (you.ts) */
  you?: SlackYou
  /** User groups you said do not mean you, as @handle; not asked again */
  notYourGroups?: { group: string; at: string }[]
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
 * How a handled task ended, as the Overview counts it: in Claude Code or
 * Codex (a session for it, or closed by one), closed in Slack (a reply, a
 * check mark), or marked done by you
 */
export type HandledHow = 'tool' | 'slack' | 'you'

/** Your tasks over the last 14 days, for the Overview (src/tasks/trend.ts) */
export interface TaskTrend {
  /** Tasks handled each day, oldest first, today last */
  daily: { day: string; handled: number }[]
  /** The days' handled tasks, by how they ended */
  how: Record<HandledHow, number>
  /** Open now, as Todo lists them */
  open: number
  /** The median time from a task's message to its handling, over the days */
  medianMs?: number
}

/** Which task tool an AI tool called */
export type ActivityKind =
  'collect' | 'add' | 'look' | 'update' | 'close' | 'wrap-up' | 'follow-up'

/**
 * One call of an AI tool to Pacenote's task tools, as tasks-activity.jsonl
 * keeps it (src/tasks/activity.ts)
 */
export interface TaskActivity {
  at: string
  kind: ActivityKind
  /** The AI tool, by its MCP client name ("claude-code") */
  by?: string
  /** From a collection or draft the app ran, which shows its own progress */
  app?: boolean
  /** The task it was about */
  task?: string
  /** add: how many tasks and Maybes it added */
  added?: number
  /** add: the collection is done */
  finished?: boolean
  /** update: what changed */
  fields?: TaskField[]
}

/** What AI tools are doing with your tasks now, for the Todo screen */
export interface TasksLive {
  /**
   * A collection an AI tool is running (not one from Collect now): when it
   * started and how many tasks and Maybes it has added so far
   */
  collecting?: { by?: string; since: string; added: number }
  /** Tasks an AI tool looked at or changed in the last two minutes */
  working: Record<string, { by?: string; at: string }>
  /** The last thing an AI tool did, in the last two minutes */
  latest?: TaskActivity
}

/** How a collection from the app ended, and what it spent */
export type CollectOutcome = (
  | { at: string; ok: true; added: number; maybe: number; skipped: number }
  | {
      at: string
      ok: false
      error: string
      /** The CLI that ran (by) needs signing in again on this Mac */
      signedOut?: boolean
      /** Why the CLI could not collect at all, so the other one may */
      unable?: Unable
    }
) & {
  /** Slack lookups it made */
  reads?: number
  /** Tokens the CLI reported for it */
  usage?: TokenUsage
  /** The CLI that collected (or tried last) */
  by?: OwnCli
  /** The CLI chosen could not, so the other one did */
  switched?: Switch
  /**
   * Another of your Macs ran it, by id (Settings > Macs): its run is in that
   * Mac's history
   */
  mac?: string
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
  running?: {
    startedAt: string
    reads: number
    /** The CLI collecting now */
    by?: OwnCli
    /** The CLI chosen could not, so this one took over */
    switched?: Switch
  }
  last?: CollectOutcome
  /** Another of your Macs is collecting now: Collect now waits for it */
  elsewhere?: { name: string; since: string }
}

/** Where a task's work went on: Claude Code or Codex on this Mac */
export type WorkTool = 'claude' | 'codex'

/**
 * How a session you started yourself was known as a task's work: it used
 * Pacenote's task tools for the task (tools), your prompt had the task's
 * Slack message (link), it worked on the branch the task's work is on
 * (branch), or you said so when Pacenote asked (you)
 */
export type FoundBy = 'tools' | 'link' | 'branch' | 'you'

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
      /**
       * The tool's session id; Codex's, and one opened in a desktop app, is
       * found after it starts
       */
      session?: string
      cwd: string
      startedAt: string
      /**
       * Opened in the tool's desktop app (Open sessions in: Desktop app),
       * with the task written in for you to send there
       */
      app?: boolean
      /** When it was opened again to continue */
      resumedAt?: string[]
      /** Found in the tool's log (a session you started yourself) */
      found?: boolean
      /** How it was found; older entries say only found: tools */
      foundBy?: FoundBy
      /** The git branch it worked on, when it was found by it */
      branch?: string
      /**
       * Another of your Macs it runs on, by id (Settings > Macs): it
       * continues there, not here
       */
      mac?: string
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
      /** The CLI that drafted it */
      by?: OwnCli
      /** The CLI chosen could not, so the other one drafted it */
      switched?: Switch
    }

/**
 * A session you started yourself that looks like a task's work, by the
 * words they share, kept apart from the work log until you say it is
 */
export type SessionSuggestion = Omit<
  Extract<WorkEntry, { kind: 'session' }>,
  'resumedAt' | 'found' | 'foundBy'
> & {
  /** What it has of the task's, a few at most: "#482", "retry" */
  shares: string[]
}

/**
 * What Pacenote made of a task's session once it went quiet: whether the task
 * looks done, how it ended and what is left after it. A session is judged
 * again only once it was active after; a proposal waits for you to answer it.
 */
export interface Proposal {
  task: string
  /** The session judged, by its tool's own id */
  tool: WorkTool
  session: string
  /** When the session was last active, as judged */
  activeAt: string
  /** When it was judged */
  at: string
  done: boolean
  /** How it ended, in two or three sentences */
  summary?: string
  /** What is left after it, each a task you may keep */
  left?: string[]
  /** The pull request of the session's branch, when it has one */
  pr?: { number: number; state: string; url: string }
  /** What you said: closed it, or not yet */
  answer?: 'closed' | 'not-yet'
}

export interface WorkFile {
  version: 1
  entries: WorkEntry[]
  /** Sessions that look like a task's work, waiting for you to say */
  suggested?: SessionSuggestion[]
  /** Sessions you said were not a task's work, not asked about again */
  notIt?: { task: string; session: string; at: string }[]
  /** What quiet sessions looked like, done or not (done-watch.ts) */
  proposals?: Proposal[]
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
  /** When you last worked in it with Claude Code or Codex */
  usedAt?: string
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
  /**
   * Its work log, newest first; a session with when it was last active and
   * the branch it was on last
   */
  work: (
    | (Extract<WorkEntry, { kind: 'session' }> & {
        lastActiveAt?: string
        /** The command that continues it, to copy */
        resume?: string
      })
    | Extract<WorkEntry, { kind: 'draft' }>
  )[]
  /** Sessions that look like its work, for you to say whether they are */
  suggested?: (SessionSuggestion & { lastActiveAt?: string })[]
  /** How it ended, once settled: "Done in Claude Code · 3 comments" */
  outcome?: string
  /** The task's repository's folder on this Mac, when known */
  folder?: string
  /** Where code tasks continue (Settings > Todo) */
  cli: WorkTool
}
