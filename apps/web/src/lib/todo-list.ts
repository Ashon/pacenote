// Relative imports, so the tests (and the root's typecheck) can load it
import type { TodoListView } from '../../../../src/desktop-bridge.js'
import { looksLikeOf } from '../../../../src/tasks/filled.js'
import { CLI_NAMES } from '../../../../src/tasks/own-ai.js'
import { stagesOf, type TaskStage } from '../../../../src/tasks/stage.js'
import { sortForTab, tabOf, type TodoTab } from '../../../../src/tasks/tabs.js'
import type { TaskView } from '../../../../src/tasks/types.js'

/**
 * What Todo lists (tasks-page.tsx), worked out from the desktop app's list
 * and where you are on the page: the tab, the task open, the tasks you have
 * seen. Plain data in and out, so the page only draws it.
 */

/** Todo's tabs, and the collections that found the tasks */
export type Tab = TodoTab | 'collections'

/** How many rows a long list shows at first, and Show more adds each time */
export const ROWS_AT_ONCE = 10

/** What of the desktop app's list Todo's tabs and rows come from */
export type ListData = Pick<
  TodoListView,
  'tasks' | 'stages' | 'working' | 'collectedAt' | 'dismissRate' | 'aiSet'
>

/** Where you are on the page */
export interface TodoPlace {
  tab: Tab
  /** The task open in its row */
  openId?: string
  /**
   * The open task and the tab it was opened in: settled meanwhile (in its
   * session, say), it stays where it was until it is closed
   */
  held?: { id: string; tab: Tab }
  /** The tasks you have seen listed; none until the list first came */
  seen?: ReadonlySet<string>
  /** How many settled tasks Done lists, the latest first */
  doneRows: number
  /** What AI tools are working on now, over MCP, by task */
  live?: Record<string, unknown>
  /** Now, for the stages a recent session gives */
  now?: number
}

/** What the tab says when it lists nothing, by its words' names */
export type EmptyLine =
  | 'nothingOpen'
  | 'nothingYet'
  | 'nothingYetNoAi'
  | 'noWaiting'
  | 'noMaybes'
  | 'nothingSettled'

/** A tab's list, as the page shows it */
export interface TodoList {
  /** Each open task's stage: started, waiting (src/tasks/stage.ts) */
  stages: Record<string, TaskStage>
  /** The tabs' counts: open, waiting on someone else, and Maybes */
  counts: { open: number; waiting: number; maybe: number }
  /** The tab's tasks in its order, less those that wait behind the notice */
  shown: TaskView[]
  /** How many of them are listed: Done lists as many as you asked for */
  rows: number
  /**
   * Tasks that came into the tab while you looked: they wait behind a notice
   * so the rows you are reading stay put
   */
  arrived: TaskView[]
  /** The tasks you have seen once these rows are listed, when that adds any */
  seenNow?: ReadonlySet<string>
  /**
   * The line over the rows, by its words' names: what Maybes are, what
   * waits, or the share of the tasks you settled that you dismissed
   */
  note?:
    | { says: 'maybeNote' | 'waitingNote' }
    | { says: 'dismissRate'; percent: number }
  /** Why the tab lists nothing, when it does not */
  empty?: EmptyLine
}

export function todoList(data: ListData, place: TodoPlace): TodoList {
  const { tab, openId, held, seen } = place
  const stages = stagesOf(data, place.live, place.now)
  const tabIn = (task: TaskView) => tabOf(task, stages[task.id])
  const open = data.tasks.filter((task) => tabIn(task) === 'open')
  // Open, but waiting on someone else
  const onOthers = data.tasks.filter((task) => tabIn(task) === 'waiting')
  const maybe = data.tasks.filter((task) => task.status === 'maybe')
  const kept = (task: TaskView) =>
    task.id === openId && held?.id === openId && held.tab === tab
  const listed = data.tasks.filter((task) => tabIn(task) === tab || kept(task))
  // In progress first; waiting, the longest first; the latest settled first
  if (tab !== 'collections') sortForTab(listed, tab, stages)
  // New tasks wait unless there is nothing in the list for them to move
  const isNew = (task: TaskView) =>
    seen !== undefined && !seen.has(task.id) && task.id !== openId
  const arrived = listed.some((task) => !isNew(task))
    ? listed.filter(isNew)
    : []
  const shown = listed.filter((task) => !arrived.includes(task))
  // Done lists as many as you asked for, down to the task open in it
  const rows =
    tab === 'done'
      ? Math.max(
          place.doneRows,
          shown.findIndex((task) => task.id === openId) + 1
        )
      : shown.length
  return {
    stages,
    counts: {
      open: open.length,
      waiting: onOthers.length,
      maybe: maybe.length,
    },
    shown,
    rows,
    arrived,
    seenNow:
      seen && shown.some((task) => !seen.has(task.id))
        ? new Set([...seen, ...shown.map((task) => task.id)])
        : undefined,
    note:
      tab === 'maybe'
        ? { says: 'maybeNote' }
        : tab === 'waiting'
          ? { says: 'waitingNote' }
          : tab === 'done' && data.dismissRate !== undefined
            ? {
                says: 'dismissRate',
                percent: Math.round(data.dismissRate * 100),
              }
            : undefined,
    empty:
      shown.length > 0 || tab === 'collections'
        ? undefined
        : tab === 'open'
          ? data.collectedAt
            ? 'nothingOpen'
            : // No AI set up for Pacenote's own work: it says what would help
              data.aiSet === false
              ? 'nothingYetNoAi'
              : 'nothingYet'
          : tab === 'waiting'
            ? 'noWaiting'
            : tab === 'maybe'
              ? 'noMaybes'
              : 'nothingSettled',
  }
}

/** What a task's row says of the rest of the list */
export interface RowFacts {
  /** The task it carries on from */
  follows?: TaskView
  /** The open task your AI says one you added looks like, until you say */
  looksLike?: TaskView
  /** The user group a Maybe was asked of, while you have not said */
  askGroup?: string
  /** The AI filling it in now, by name */
  filling?: string
}

export function rowFacts(
  data: Pick<TodoListView, 'tasks' | 'groups' | 'filling' | 'ai'>,
  task: TaskView
): RowFacts {
  const like = looksLikeOf(task)
  return {
    follows: task.follows
      ? data.tasks.find((each) => each.id === task.follows)
      : undefined,
    looksLike: like
      ? data.tasks.find((each) => each.id === like && each.status === 'open')
      : undefined,
    askGroup:
      task.status === 'maybe' &&
      task.group &&
      !data.groups?.yours.includes(task.group) &&
      !data.groups?.notYours.includes(task.group)
        ? task.group
        : undefined,
    filling: data.filling?.includes(task.id)
      ? CLI_NAMES[data.ai.chosen]
      : undefined,
  }
}

/** The channel to offer leaving out, unless you turned that offer down */
export const leaveOutOffer = (
  leaveOut: TodoListView['leaveOut'],
  declined: readonly string[]
) =>
  leaveOut && !declined.includes(leaveOut.conversation) ? leaveOut : undefined

/** The leave-out offers you turned down, as this browser kept them */
export function declinedFrom(stored: string | null): string[] {
  try {
    return JSON.parse(stored ?? '[]') as string[]
  } catch {
    return []
  }
}

/**
 * How many rows the skeleton shows while the tasks come: as many open tasks
 * as there were last time, up to 8, or 3
 */
export function skeletonRows(stored: string | null): number {
  const rows = Number(stored)
  return rows > 0 ? Math.min(rows, 8) : 3
}
