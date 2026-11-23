import { createHash } from 'node:crypto'
import path from 'node:path'
import { readJson, writeJson } from '../json-file.js'
import {
  bundleOf,
  bundlesOf,
  cleanBundles,
  ids,
  isTime,
  newestFirst,
  type BundleFill,
  type BundleRecord,
  type BundleRecords,
  type BundlesFile,
} from './bundle-view.js'
import type { TaskView } from './types.js'

export * from './bundle-view.js'

/**
 * Groups of tasks that are one piece of work (Todo shows them as a group):
 * your AI suggests one when similar open tasks pile up in a project, you say
 * Group them or Not one piece, and you can group tasks by hand. Your AI fills
 * a group in (a name, a summary, who waits for what, what comes first) from
 * its tasks alone (src/tasks/bundle-ai.ts). A task is in one group at most,
 * and stays a task of its own: counts, Recap and AI tools still go by task.
 *
 * In code a group is a bundle: "group" already names the Slack user groups a
 * task may be asked of (Task.group). The records are kept apart from
 * tasks.json, in tasks-bundles.json, written by the desktop app alone, so an
 * earlier Pacenote, here or on another Mac, never sees them and shows each
 * task as before. What a device needs to work the groups out the same way is
 * in src/tasks/bundle-view.ts, plain data with no file.
 */

export const BUNDLES_FILE = 'tasks-bundles.json'

export function readBundlesFile(dataDir: string): BundlesFile {
  const file = readJson<Partial<BundlesFile>>(
    path.join(dataDir, BUNDLES_FILE),
    {}
  )
  const looked: BundlesFile['looked'] = {}
  for (const [repo, look] of Object.entries(file.looked ?? {})) {
    if (isTime(look?.at)) looked[repo] = { at: look.at, tasks: ids(look.tasks) }
  }
  return { version: 1, bundles: cleanBundles(file.bundles), looked }
}

export const readBundles = (dataDir: string): BundleRecords =>
  readBundlesFile(dataDir).bundles

/** Changes the file, written only when the change changed something */
export function changeBundles<T = void>(
  dataDir: string,
  change: (file: BundlesFile) => T
): T {
  const file = readBundlesFile(dataDir)
  const was = JSON.stringify(file)
  const result = change(file)
  // In the order another Mac merges them into, so the two settle
  file.bundles = Object.fromEntries(
    Object.entries(file.bundles).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    )
  )
  if (JSON.stringify(file) !== was)
    writeJson(path.join(dataDir, BUNDLES_FILE), file)
  return result
}

// ---------------------------------------------------------------------------
// Changing them: each a change to the records, newest wins between Macs

const newId = (tasks: readonly string[], at: string) =>
  `b-${createHash('sha1')
    .update(`${[...tasks].sort().join(',')}@${at}`)
    .digest('hex')
    .slice(0, 12)}`

/** Takes tasks out of the groups that have them; a group left with one ends */
function takeOut(
  records: BundleRecords,
  taskIds: readonly string[],
  at: string,
  keep?: string
): void {
  const taken = new Set(taskIds)
  for (const [id, record] of Object.entries(records)) {
    if (id === keep || record.state !== 'grouped') continue
    if (!record.tasks.some((task) => taken.has(task))) continue
    const tasks = record.tasks.filter((task) => !taken.has(task))
    records[id] =
      tasks.length >= 2
        ? { ...record, tasks, at }
        : // One task left: no group, and the pair is not suggested again
          { ...record, state: 'notOne', at }
  }
}

/**
 * Groups tasks by hand: into the group one of them is in already (or the
 * one given), else a new group. Returns the group's id.
 */
export function bundleTasks(
  dataDir: string,
  taskIds: readonly string[],
  options: { into?: string; now?: Date } = {}
): string | { refused: string } {
  const at = (options.now ?? new Date()).toISOString()
  const wanted = [...new Set(taskIds)]
  return changeBundles(dataDir, (file) => {
    const records = file.bundles
    const into =
      options.into ??
      Object.entries(records)
        .sort(newestFirst)
        .find(
          ([, record]) =>
            record.state === 'grouped' &&
            record.tasks.some((task) => wanted.includes(task))
        )?.[0]
    const target = into ? records[into] : undefined
    if (into && target?.state !== 'grouped')
      return { refused: 'That group is not there any more.' }
    const tasks = [...new Set([...(target?.tasks ?? []), ...wanted])]
    if (tasks.length < 2) return { refused: 'A group needs two tasks.' }
    const id = into ?? newId(tasks, at)
    takeOut(records, wanted, at, id)
    records[id] = {
      ...(target ?? { state: 'grouped', made: 'you' }),
      state: 'grouped',
      tasks,
      at,
      out: target?.out?.filter((task) => !wanted.includes(task)),
    }
    if (!records[id]!.out?.length) delete records[id]!.out
    return id
  })
}

/** Moves a task out of its group; a group left with one task ends */
export function moveOutOfBundle(
  dataDir: string,
  bundleId: string,
  taskId: string,
  now = new Date()
): void {
  const at = now.toISOString()
  changeBundles(dataDir, (file) => {
    const record = file.bundles[bundleId]
    if (record?.state !== 'grouped' || !record.tasks.includes(taskId)) return
    const tasks = record.tasks.filter((task) => task !== taskId)
    const out = [...new Set([...(record.out ?? []), taskId])]
    file.bundles[bundleId] =
      tasks.length >= 2
        ? { ...record, tasks, out, at }
        : { ...record, state: 'notOne', out, at }
  })
}

/** Ungroups: its tasks stand alone again, and are not suggested together */
export function ungroupBundle(
  dataDir: string,
  bundleId: string,
  now = new Date()
) {
  changeBundles(dataDir, (file) => {
    const record = file.bundles[bundleId]
    if (record?.state === 'grouped')
      file.bundles[bundleId] = {
        ...record,
        state: 'notOne',
        at: now.toISOString(),
      }
  })
}

/** Your answer to a suggestion: Group them, or Not one piece */
export function answerBundleSuggestion(
  dataDir: string,
  bundleId: string,
  yes: boolean,
  now = new Date()
): void {
  const at = now.toISOString()
  changeBundles(dataDir, (file) => {
    const record = file.bundles[bundleId]
    if (record?.state !== 'suggested') return
    if (!yes) {
      file.bundles[bundleId] = { ...record, state: 'notOne', at }
      return
    }
    takeOut(file.bundles, record.tasks, at, bundleId)
    file.bundles[bundleId] = { ...record, state: 'grouped', made: 'ai', at }
  })
}

/** Keeps a suggestion your AI made, unless it is one already decided */
export function suggestBundle(
  dataDir: string,
  suggestion: { tasks: string[]; name?: string; by?: string; after?: string },
  now = new Date()
): string | undefined {
  const at = now.toISOString()
  return changeBundles(dataDir, (file) => {
    if (!suggestable(file.bundles, suggestion.tasks)) return undefined
    const id = newId(suggestion.tasks, at)
    file.bundles[id] = {
      state: 'suggested',
      tasks: [...new Set(suggestion.tasks)],
      at,
      ...(suggestion.name && { name: suggestion.name }),
      ...(suggestion.by && { by: suggestion.by }),
      ...(suggestion.after && { after: suggestion.after }),
    }
    return id
  })
}

/**
 * Whether tasks may be suggested as a group: none is in a group, they are
 * not all of a suggestion already made, nor of one you said is not one
 * piece, nor a task you moved out with the tasks of its group
 */
export function suggestable(
  records: BundleRecords,
  taskIds: readonly string[]
): boolean {
  if (new Set(taskIds).size < 2) return false
  for (const record of Object.values(records)) {
    const has = new Set(record.tasks)
    if (record.state === 'grouped' && taskIds.some((id) => has.has(id)))
      return false
    if (record.state !== 'grouped' && taskIds.every((id) => has.has(id)))
      return false
    const out = new Set(record.out ?? [])
    if (
      taskIds.some((id) => out.has(id)) &&
      taskIds.some((id) => has.has(id) && !out.has(id))
    )
      return false
  }
  return true
}

/** Keeps your AI's fill of a group: the one before it stays, for Undo */
export function setBundleFill(
  dataDir: string,
  bundleId: string,
  fill: BundleFill
): boolean {
  return changeBundles(dataDir, (file) => {
    const record = file.bundles[bundleId]
    if (record?.state !== 'grouped') return false
    const rest: BundleRecord = { ...record }
    delete rest.tookBack
    file.bundles[bundleId] = {
      ...rest,
      fill,
      ...(record.fill && { before: record.fill }),
      at: fill.at,
    }
    return true
  })
}

/** Undo: back to the fill before, and no fill again until you ask */
export function takeBackBundleFill(
  dataDir: string,
  bundleId: string,
  now = new Date()
): void {
  const at = now.toISOString()
  changeBundles(dataDir, (file) => {
    const record = file.bundles[bundleId]
    if (record?.state !== 'grouped' || !record.fill) return
    const { before } = record
    const rest: BundleRecord = { ...record }
    delete rest.fill
    delete rest.before
    file.bundles[bundleId] = {
      ...rest,
      ...(before && { fill: before }),
      tookBack: at,
      at,
    }
  })
}

/** Fill again: your AI may fill it in once more */
export function allowBundleFill(dataDir: string, bundleId: string): void {
  changeBundles(dataDir, (file) => {
    const record = file.bundles[bundleId]
    if (record?.state !== 'grouped' || !record.tookBack) return
    const rest: BundleRecord = { ...record, at: new Date().toISOString() }
    delete rest.tookBack
    file.bundles[bundleId] = rest
  })
}

/** Done all: what you did, kept once on the group */
export function wrapUpBundle(
  dataDir: string,
  bundleId: string,
  wrap: string,
  now = new Date()
): void {
  const at = now.toISOString()
  const said = wrap.trim().slice(0, 2000)
  changeBundles(dataDir, (file) => {
    const record = file.bundles[bundleId]
    if (record?.state !== 'grouped') return
    file.bundles[bundleId] = {
      ...record,
      ...(said ? { wrapUp: { text: said, at } } : {}),
      at,
    }
  })
}

/**
 * Notes what your AI looked at in a repository, so it looks again only
 * when a new task comes
 */
export function noteLooked(
  dataDir: string,
  repo: string,
  tasks: readonly string[],
  now = new Date()
): void {
  changeBundles(dataDir, (file) => {
    file.looked = {
      ...file.looked,
      [repo.toLowerCase()]: { at: now.toISOString(), tasks: [...tasks] },
    }
  })
}

/** The fewest similar open tasks in one project your AI looks at */
export const LOOK_AT_LEAST = 3
/** The most tasks of one project your AI is given at once */
const LOOK_AT_MOST = 24

/**
 * Where your AI should look for groups: per repository, its open tasks in
 * no group, when there are enough of them and one came since it last looked
 */
export function looksDue(
  tasks: readonly TaskView[],
  file: BundlesFile
): { repo: string; tasks: TaskView[] }[] {
  const view = bundlesOf(tasks, file.bundles)
  const grouped = new Set(view.groups.flatMap((group) => group.tasks))
  const byRepo = new Map<string, { repo: string; tasks: TaskView[] }>()
  for (const task of tasks) {
    if (task.status !== 'open' || !task.repo || grouped.has(task.id)) continue
    const key = task.repo.toLowerCase()
    const entry = byRepo.get(key) ?? { repo: task.repo, tasks: [] }
    entry.tasks.push(task)
    byRepo.set(key, entry)
  }
  return [...byRepo.entries()].flatMap(([key, entry]) => {
    if (entry.tasks.length < LOOK_AT_LEAST) return []
    const seen = new Set(file.looked?.[key]?.tasks ?? [])
    if (entry.tasks.every((task) => seen.has(task.id))) return []
    const newest = [...entry.tasks]
      .sort((a, b) => Date.parse(b.foundAt) - Date.parse(a.foundAt))
      .slice(0, LOOK_AT_MOST)
    return [{ repo: entry.repo, tasks: newest }]
  })
}

/**
 * The group a task is in (the one named, or any), with its tasks in order:
 * for a session that takes the group on, and for task_context
 */
export function groupAround(
  tasks: readonly TaskView[],
  records: BundleRecords,
  taskId: string,
  bundleId?: string
):
  | { id: string; title: string; summary?: string; tasks: TaskView[] }
  | undefined {
  const view = bundlesOf(tasks, records)
  const group = bundleId
    ? view.groups.find((each) => each.id === bundleId)
    : bundleOf(view, taskId)
  if (!group?.tasks.includes(taskId)) return undefined
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const members = group.tasks.flatMap((id) => {
    const task = byId.get(id)
    return task ? [task] : []
  })
  return {
    id: group.id,
    title: group.fill?.title ?? group.name ?? members[0]?.title ?? '',
    ...(group.fill?.summary && { summary: group.fill.summary }),
    tasks: members,
  }
}
