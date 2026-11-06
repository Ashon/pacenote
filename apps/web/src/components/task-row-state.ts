import type { Locale } from '@src/i18n/locale'
import { FILLED_SHOWN_MS, standingFill } from '@src/tasks/filled'
import { CLI_NAMES } from '@src/tasks/own-ai'
import { ADDED_BY_YOU, sourceOf } from '@src/tasks/sources'
import type { StageRecord, TaskStage } from '@src/tasks/stage'
import type {
  Proposal,
  TaskDecision,
  TaskUpdate,
  TaskView,
  WorkTool,
} from '@src/tasks/types'
import { lastChange } from './task-changes'
import type { text } from './task-row.text'
import { closedBy } from './task-sessions'

/**
 * What a task's row in the Todo list shows, decided from the task and where
 * it stands: its pills, its buttons and the steps under its menu. TaskRow
 * draws it as it is.
 */

/** The row's words, in the app's language */
export type RowWords = (typeof text)[Locale]

const WEEK = 7 * 24 * 60 * 60_000

/** A step under the row's menu, by its name */
export type RowStep = { label: string } & (
  | { kind: 'continue'; tool: WorkTool }
  /** Continue in a folder you choose, rather than its repository's */
  | { kind: 'elsewhere' }
  | { kind: 'draft' }
  /** In progress, no longer, or waiting on someone else */
  | { kind: 'stage'; stage: StageRecord['stage'] }
)

/** The task and what the list knows of it, as TaskRow is given them */
export interface TaskRowInput {
  task: TaskView
  /** Where code tasks continue */
  cli: WorkTool
  /** The tools a code task can continue in here */
  tools: readonly WorkTool[]
  /** Each repository's folder on this Mac */
  repos?: Record<string, string>
  open: boolean
  /** Dismiss was pressed: why is asked instead of its steps */
  dismissing: boolean
  /** Open, it may be in progress or waiting on someone */
  stage?: TaskStage
  /** Its stage can be set here */
  staging: boolean
  /** Its latest session: the tool and when it was last active */
  working?: { tool: WorkTool; at: string }
  /** An AI tool working on it now over MCP */
  live?: { by?: string; at: string }
  /** Your AI filling it in now, by the CLI's name */
  filling?: string
  /** Its quiet session says it looks done */
  proposal?: Proposal
  /** The open task your AI says it looks like, until you say */
  looksLike?: TaskView
  /** The task it carries on from, which your AI found for one you added */
  followsTask?: TaskView
  /** The user group a Maybe was asked of */
  askGroup?: string
}

export interface TaskRowState {
  /** From a session on this Mac: it has no thread, so no reply to draft */
  local: boolean
  /** Where it was asked, as its link names it: Slack, or this Mac */
  sourceLabel: string
  /** Done, dismissed or closed */
  settled: boolean
  /** How it was settled, as its pill says it */
  settledLabel?: string
  /** Open, and not being dismissed: its next steps show */
  acting: boolean
  /** When it is due, while it is not settled */
  due?: string
  /** Its latest change in the last week, said on the closed row */
  updated?: TaskUpdate
  /** What your AI filled in, standing, for the opened row */
  fill?: TaskUpdate
  /** What your AI filled in the last day, said on the closed row */
  filled?: TaskUpdate
  /** Your AI filling it in now, by the CLI's name, while it is open */
  filling?: string
  /** Its last session, while it is open */
  working?: { tool: WorkTool; at: string }
  /** The mark of an AI tool at work on it */
  atWork: boolean
  /** The mark of a quiet session that says it looks done */
  looksDone: boolean
  /** Whether its group means you, asked on the row */
  asking: boolean
  /** Its repository's folder: Continue opens there without asking */
  folder?: string
  /** The tools it continues in, the one set in Settings first */
  tools: WorkTool[]
  /** A button for each tool: an open code task */
  continues: boolean
  /** Draft a reply as a button: an open reply in a thread */
  drafts: boolean
  /** Back to open, for one waiting on someone else */
  backToOpen: boolean
  /**
   * The task's own buttons: Done, Dismiss and its menu while open; Keep as a
   * task and Dismiss for a Maybe; Reopen once settled
   */
  decide?: 'open' | 'maybe' | 'settled'
  /** What Reopen records: a closed task kept, or the decision taken back */
  reopen: Omit<TaskDecision, 'at'> | null
  /** The steps the row's own buttons do not take, under its menu */
  menu: RowStep[]
  /** Where it stands, under the menu after a line */
  stages: RowStep[]
  /** The open task it looks like, asked about while it is open */
  looksLike?: TaskView
  /** What its quiet session looked like, for the opened row */
  proposal?: Proposal
  /** The task it carries on from, for one you added */
  followsTask?: TaskView
}

/** A repository's folder, by its name in any case */
export const repoFolderOf = (
  repos: Record<string, string> | undefined,
  repo: string | undefined
) =>
  repo
    ? Object.entries(repos ?? {}).find(
        ([name]) => name.toLowerCase() === repo.toLowerCase()
      )?.[1]
    : undefined

/** What the row shows of a task, now */
export function taskRowState(
  input: TaskRowInput,
  t: RowWords,
  now = Date.now()
): TaskRowState {
  const { task, cli, open, dismissing, stage, filling } = input
  // From a session on this Mac, it has no thread: no reply to draft.
  const local = task.source.app === 'local'
  // This Mac is kept in English in the task, as AI tools read it too
  const sourceLabel = local ? t.thisMac : sourceOf(task).label
  const by = closedBy(task.closed?.by)
  const settledLabel =
    task.status === 'closed'
      ? by
        ? t.closedIn(by)
        : task.closed?.why === 'resolved'
          ? t.settledIn(sourceLabel)
          : t.settled[task.closed?.why ?? '']
      : task.status === 'dismissed'
        ? t.settled[task.dismissReason ?? 'dismissed']
        : t.settled[task.status]
  const settled = !['open', 'maybe'].includes(task.status)
  const acting = task.status === 'open' && !dismissing
  const change = settled ? undefined : lastChange(task)
  const recent =
    change && now - Date.parse(change.at) < WEEK ? change : undefined
  // What your AI filled in, said on the row for a day
  const fill = settled ? undefined : standingFill(task)
  const justFilled =
    fill && now - Date.parse(fill.at) < FILLED_SHOWN_MS ? fill : undefined
  const tools = [cli, ...input.tools.filter((tool) => tool !== cli)]
  const folder = repoFolderOf(input.repos, task.repo)
  // A code task has a button for each tool, so they are not in the menu
  const menu: RowStep[] = [
    ...(task.action === 'code'
      ? []
      : tools.map((tool): RowStep => ({
          kind: 'continue',
          tool,
          label: t.continueIn(CLI_NAMES[tool]),
        }))),
    ...(folder
      ? [{ kind: 'elsewhere', label: t.continueElsewhere } as const]
      : []),
    ...(task.action === 'reply' || local
      ? []
      : [{ kind: 'draft', label: t.draftReply } as const]),
  ]
  // Where it stands: in progress, or waiting on someone else
  const stages: RowStep[] = input.staging
    ? [
        stage?.stage === 'started'
          ? { kind: 'stage', stage: 'open', label: t.notInProgress }
          : { kind: 'stage', stage: 'started', label: t.markInProgress },
        ...(stage?.stage === 'waiting'
          ? []
          : [
              {
                kind: 'stage',
                stage: 'waiting',
                label: t.waitingOnSomeone,
              } as const,
            ]),
      ]
    : []

  return {
    local,
    sourceLabel,
    settled,
    settledLabel,
    acting,
    due: settled ? undefined : task.due,
    updated: open ? undefined : recent,
    fill,
    filled: justFilled && !filling && !open ? justFilled : undefined,
    filling: acting ? filling : undefined,
    working: task.status === 'open' ? input.working : undefined,
    atWork: Boolean(input.live) && task.status === 'open',
    looksDone: Boolean(input.proposal) && task.status === 'open' && !open,
    asking: Boolean(input.askGroup) && !dismissing,
    folder,
    tools,
    continues: acting && task.action === 'code',
    drafts: acting && task.action === 'reply' && !local,
    backToOpen: acting && stage?.stage === 'waiting' && input.staging,
    decide: acting
      ? 'open'
      : task.status === 'maybe' && !dismissing
        ? 'maybe'
        : settled
          ? 'settled'
          : undefined,
    reopen: task.status === 'closed' ? { status: 'kept' } : null,
    menu,
    stages,
    looksLike: acting ? input.looksLike : undefined,
    proposal: task.status === 'open' ? input.proposal : undefined,
    followsTask:
      task.addedBy === ADDED_BY_YOU && task.follows
        ? input.followsTask
        : undefined,
  }
}
