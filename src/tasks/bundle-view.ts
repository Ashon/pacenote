import type { TaskView } from './types.js'

/**
 * Groups of tasks as data (src/tasks/bundles.ts keeps them in a file): the
 * records, what makes sense of them, and the groups Todo shows. Nothing here
 * reads or writes a file, so a device works the groups out from what its Mac
 * sends exactly as the Mac does.
 */

/**
 * grouped: one piece of work; suggested: your AI asks whether it is;
 * notOne: you said it is not, or ungrouped it, so it is not asked again
 */
export type BundleState = 'grouped' | 'suggested' | 'notOne'

/** What your AI filled a group in with, checked against its tasks */
export interface BundleFill {
  /** Short: "Webhook retries" */
  title: string
  /** Two or three sentences: what the work is and how its tasks fit */
  summary: string
  /** Who waits and for what, by the task they asked in */
  waits: { task: string; wants: string }[]
  /** The task with the earliest due, as its tasks' own words say */
  due?: string
  /** The task that comes first, and why */
  first?: { task: string; why: string }
  /** Its tasks in the order to do them */
  order?: string[]
  at: string
  /** The AI tool that filled it ("claude-code") */
  by?: string
  /** What it was filled from (fillKey): another key means its tasks changed */
  for: string
}

export interface BundleRecord {
  state: BundleState
  /** Its tasks, by id */
  tasks: string[]
  /** When it last changed: between Macs the newer record wins */
  at: string
  /** you: grouped by hand; ai: your AI suggested it and you said yes */
  made?: 'you' | 'ai'
  /** A suggestion's name, as your AI gave it */
  name?: string
  /** The AI tool that suggested it */
  by?: string
  /** The task your AI was filling in when it saw them; none: a collection */
  after?: string
  fill?: BundleFill
  /** The fill before the latest one, for Undo */
  before?: BundleFill
  /** When you took the fill back: it is not filled again until you ask */
  tookBack?: string
  /** Tasks you moved out of it: not suggested with it again */
  out?: string[]
  /** Done all: what you did, once for all its tasks */
  wrapUp?: { text: string; at: string }
}

export type BundleRecords = Record<string, BundleRecord>

export interface BundlesFile {
  version: 1
  bundles: BundleRecords
  /**
   * When your AI last looked for groups in each repository, and the open
   * tasks it saw then: it looks again only when a new one comes. This Mac's
   * alone, not sent to the others.
   */
  looked?: Record<string, { at: string; tasks: string[] }>
}

const STATES: readonly BundleState[] = ['grouped', 'suggested', 'notOne']

export const isTime = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

export const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string'))]
    : []

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : undefined

function cleanFill(value: unknown): BundleFill | undefined {
  const fill = (value ?? {}) as Partial<Record<keyof BundleFill, unknown>>
  const title = text(fill.title, 120)
  const summary = text(fill.summary, 800)
  if (!title || summary === undefined || !isTime(fill.at)) return undefined
  if (typeof fill.for !== 'string') return undefined
  const waits = Array.isArray(fill.waits)
    ? fill.waits.flatMap((wait) => {
        const { task, wants } = (wait ?? {}) as Record<string, unknown>
        const said = text(wants, 200)
        return typeof task === 'string' && said ? [{ task, wants: said }] : []
      })
    : []
  const first = (fill.first ?? undefined) as Record<string, unknown> | undefined
  const why = text(first?.why, 200)
  return {
    title,
    summary,
    waits,
    ...(typeof fill.due === 'string' && { due: fill.due }),
    ...(typeof first?.task === 'string' &&
      why && { first: { task: first.task, why } }),
    ...(Array.isArray(fill.order) && { order: ids(fill.order) }),
    at: fill.at,
    ...(typeof fill.by === 'string' && { by: fill.by }),
    for: fill.for,
  }
}

/** The records that make sense, from the file or another Mac */
export function cleanBundles(value: unknown): BundleRecords {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const records: BundleRecords = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const record = (raw ?? {}) as Partial<Record<keyof BundleRecord, unknown>>
    const tasks = ids(record.tasks)
    if (!STATES.includes(record.state as BundleState) || !isTime(record.at))
      continue
    if (tasks.length < 2) continue
    const fill = cleanFill(record.fill)
    const before = cleanFill(record.before)
    const wrap = (record.wrapUp ?? undefined) as
      Record<string, unknown> | undefined
    const wrapText = text(wrap?.text, 2000)
    const out = ids(record.out)
    records[id] = {
      state: record.state as BundleState,
      tasks,
      at: record.at,
      ...((record.made === 'you' || record.made === 'ai') && {
        made: record.made,
      }),
      ...(text(record.name, 120) && { name: text(record.name, 120) }),
      ...(typeof record.by === 'string' && { by: record.by }),
      ...(typeof record.after === 'string' && { after: record.after }),
      ...(fill && { fill }),
      ...(before && { before }),
      ...(isTime(record.tookBack) && { tookBack: record.tookBack }),
      ...(out.length > 0 && { out }),
      ...(wrapText &&
        isTime(wrap?.at) && { wrapUp: { text: wrapText, at: wrap.at } }),
    }
  }
  return records
}

// ---------------------------------------------------------------------------
// The groups as Todo shows them

/** A group as the screen shows it */
export interface TaskBundle {
  id: string
  /** Its tasks there are, in the order to do them: two or more */
  tasks: string[]
  made?: 'you' | 'ai'
  /** What your AI suggested calling it */
  name?: string
  fill?: BundleFill
  /** Its tasks changed since it was filled in */
  stale: boolean
  /** Undo would take the fill back */
  canUndo: boolean
  /** You took the fill back */
  tookBack: boolean
  wrapUp?: { text: string; at: string }
  at: string
}

/** Your AI's suggestion, as the card above the list shows it */
export interface BundleSuggestion {
  id: string
  tasks: string[]
  name?: string
  by?: string
  after?: string
}

export interface BundlesView {
  groups: TaskBundle[]
  suggestion?: BundleSuggestion
}

/** The newest record first */
export const newestFirst = (
  [, a]: [string, BundleRecord],
  [, b]: [string, BundleRecord]
) => Date.parse(b.at) - Date.parse(a.at)

/**
 * What a group was filled from: its tasks and what each says. When one comes
 * or goes, or says something new, the fill is out of date.
 */
export function fillKey(tasks: readonly TaskView[]): string {
  const parts = [...tasks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((task) =>
      [
        task.id,
        task.status,
        task.title,
        task.askedBy ?? '',
        task.due ?? '',
        task.summary ?? '',
        task.updates?.at(-1)?.at ?? '',
      ].join('\u0001')
    )
  return shortHash(parts.join('\u0002'))
}

const hex = (value: number) => (value >>> 0).toString(16).padStart(8, '0')

/**
 * A short hash of text (cyrb53's two halves), the same on the Mac and on a
 * device, which has no node:crypto
 */
function shortHash(value: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return hex(h2) + hex(h1)
}

/**
 * A group's tasks in the order to do them: as your AI said, the rest after
 * them as found, a task after the one it carries on from
 */
export function orderTasks(
  members: readonly TaskView[],
  order: readonly string[] = []
): TaskView[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  const found = [...members].sort(
    (a, b) =>
      (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) ||
      Date.parse(a.foundAt) - Date.parse(b.foundAt) ||
      a.id.localeCompare(b.id)
  )
  if (order.length) return found
  // A task after the one it carries on from, when both are in the group
  const placed: TaskView[] = []
  const pending = [...found]
  while (pending.length) {
    const index = pending.findIndex(
      (task) =>
        !task.follows || !pending.some((other) => other.id === task.follows)
    )
    placed.push(...pending.splice(index < 0 ? 0 : index, 1))
  }
  return placed
}

/**
 * The groups among the tasks given, and the suggestion to show: a task is
 * in the newest group that has it, a group with fewer than two of the tasks
 * is not shown, and a suggestion is of open tasks in no group
 */
export function bundlesOf(
  tasks: readonly TaskView[],
  records: BundleRecords
): BundlesView {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const claimed = new Set<string>()
  const entries = Object.entries(records).sort(newestFirst)
  const groups: TaskBundle[] = []
  for (const [id, record] of entries) {
    if (record.state !== 'grouped') continue
    const members = record.tasks.flatMap((taskId) => {
      const task = byId.get(taskId)
      return task && !claimed.has(taskId) ? [task] : []
    })
    if (members.length < 2) continue
    for (const task of members) claimed.add(task.id)
    groups.push({
      id,
      tasks: orderTasks(members, record.fill?.order).map((task) => task.id),
      ...(record.made && { made: record.made }),
      ...(record.name && { name: record.name }),
      ...(record.fill && { fill: record.fill }),
      stale: !!record.fill && record.fill.for !== fillKey(members),
      canUndo: !!record.fill && !record.tookBack,
      tookBack: !!record.tookBack,
      ...(record.wrapUp && { wrapUp: record.wrapUp }),
      at: record.at,
    })
  }
  let suggestion: BundleSuggestion | undefined
  for (const [id, record] of entries) {
    if (record.state !== 'suggested') continue
    const open = record.tasks.filter(
      (taskId) => byId.get(taskId)?.status === 'open' && !claimed.has(taskId)
    )
    if (open.length < 2) continue
    suggestion = {
      id,
      tasks: orderTasks(open.map((taskId) => byId.get(taskId)!)).map(
        (task) => task.id
      ),
      ...(record.name && { name: record.name }),
      ...(record.by && { by: record.by }),
      ...(record.after && { after: record.after }),
    }
    break
  }
  return { groups, ...(suggestion && { suggestion }) }
}

/** The group a task is in, among those shown */
export const bundleOf = (
  view: BundlesView,
  taskId: string
): TaskBundle | undefined =>
  view.groups.find((group) => group.tasks.includes(taskId))
