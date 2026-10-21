import { HISTORY_MS } from '../tasks/store.js'
import type {
  CollectionRecord,
  Task,
  TaskDecisions,
  TasksFile,
  WorkEntry,
  WorkFile,
} from '../tasks/types.js'
import type { AreaRecord, Written, YouFile } from '../you/types.js'

/**
 * Your Todo, the same on each of your Macs: how what one Mac has meets what
 * another sends (todo-sync.ts carries it). Each merge gives the same result
 * whichever Mac runs it and in whatever order changes arrive, so the Macs
 * settle on the same files, with nothing to ask you:
 * - tasks by their message: the version changed last, its updates together
 * - your decisions (done, dismissed, kept) by their time, the latest one
 *   standing, a decision taken back included
 * - the work log by entry, a session marked with the Mac it is on
 * - what Write it up wrote, by period, the latest
 * - your areas by id, what you said about them kept from either Mac
 * Only what is kept on disk moves: never Slack messages, which Pacenote does
 * not keep.
 */

const later = (a: string | undefined, b: string | undefined) =>
  !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b

/** When a task last changed: found, updated, closed or wrapped up */
function changedAt(task: Task): number {
  return Math.max(
    Date.parse(task.foundAt) || 0,
    ...(task.updates ?? []).map((update) => Date.parse(update.at) || 0),
    task.closed ? Date.parse(task.closed.at) || 0 : 0,
    task.wrapUp ? Date.parse(task.wrapUp.at) || 0 : 0
  )
}

/** The same task from two Macs: the version changed last, all updates kept */
export function mergeTask(a: Task, b: Task): Task {
  const [newer, older] =
    changedAt(a) !== changedAt(b)
      ? changedAt(a) > changedAt(b)
        ? [a, b]
        : [b, a]
      : JSON.stringify(a) >= JSON.stringify(b)
        ? [a, b]
        : [b, a]
  const updates = new Map(
    [...(older.updates ?? []), ...(newer.updates ?? [])].map((update) => [
      `${update.at}\n${update.why}`,
      update,
    ])
  )
  const merged: Task = {
    ...older,
    ...newer,
    ...(updates.size > 0
      ? {
          updates: [...updates.values()].sort(
            (x, y) => Date.parse(x.at) - Date.parse(y.at)
          ),
        }
      : {}),
  }
  const closed = newer.closed ?? older.closed
  if (closed) merged.closed = closed
  const wrapUp =
    newer.wrapUp && older.wrapUp
      ? later(newer.wrapUp.at, older.wrapUp.at) === newer.wrapUp.at
        ? newer.wrapUp
        : older.wrapUp
      : (newer.wrapUp ?? older.wrapUp)
  if (wrapUp) merged.wrapUp = wrapUp
  return merged
}

/** tasks.json from two Macs */
export function mergeTasks(
  local: TasksFile,
  remote: TasksFile,
  now = Date.now()
): TasksFile {
  const byId = new Map<string, Task>()
  for (const task of [...local.tasks, ...remote.tasks]) {
    if (now - Date.parse(task.foundAt) >= HISTORY_MS) continue
    const seen = byId.get(task.id)
    byId.set(task.id, seen ? mergeTask(seen, task) : task)
  }
  const groups = new Map<string, { group: string; at: string }>()
  for (const entry of [
    ...(local.notYourGroups ?? []),
    ...(remote.notYourGroups ?? []),
  ]) {
    const seen = groups.get(entry.group)
    if (!seen || later(seen.at, entry.at) === entry.at)
      groups.set(entry.group, entry)
  }
  const collectedAt = later(local.collectedAt, remote.collectedAt)
  const you =
    local.you && remote.you
      ? JSON.stringify(local.you) >= JSON.stringify(remote.you)
        ? local.you
        : remote.you
      : (local.you ?? remote.you)
  return {
    version: 1,
    ...(collectedAt ? { collectedAt } : {}),
    tasks: [...byId.values()].sort(
      (x, y) =>
        Date.parse(x.foundAt) - Date.parse(y.foundAt) ||
        (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
    ),
    ...(you ? { you } : {}),
    ...(groups.size > 0
      ? {
          notYourGroups: [...groups.values()].sort((x, y) =>
            x.group < y.group ? -1 : 1
          ),
        }
      : {}),
  }
}

/**
 * Decisions you take back, by task, with when: so a Mac that still has the
 * decision drops it rather than bringing it back
 */
export type TakenBack = Record<string, string>

/** Your decisions from two Macs: the latest about each task stands */
export function mergeDecisions(
  local: { decisions: TaskDecisions; takenBack: TakenBack },
  remote: { decisions: TaskDecisions; takenBack: TakenBack }
): { decisions: TaskDecisions; takenBack: TakenBack } {
  const takenBack: TakenBack = { ...local.takenBack }
  for (const [id, at] of Object.entries(remote.takenBack))
    takenBack[id] = later(takenBack[id], at)!
  const decisions: TaskDecisions = {}
  for (const [id, decision] of [
    ...Object.entries(local.decisions),
    ...Object.entries(remote.decisions),
  ]) {
    const seen = decisions[id]
    if (
      !seen ||
      Date.parse(decision.at) > Date.parse(seen.at) ||
      (decision.at === seen.at &&
        JSON.stringify(decision) > JSON.stringify(seen))
    )
      decisions[id] = decision
  }
  for (const [id, decision] of Object.entries(decisions)) {
    const back = takenBack[id]
    if (back && Date.parse(back) >= Date.parse(decision.at))
      delete decisions[id]
    else if (back) delete takenBack[id]
  }
  return { decisions: sorted(decisions), takenBack: sorted(takenBack) }
}

const sorted = <T>(record: Record<string, T>): Record<string, T> =>
  Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )

/** When a work entry last changed */
function touchedAt(entry: WorkEntry): number {
  return entry.kind === 'session'
    ? Math.max(
        Date.parse(entry.startedAt) || 0,
        ...(entry.resumedAt ?? []).map((at) => Date.parse(at) || 0)
      )
    : Date.parse(entry.copiedAt ?? entry.at) || 0
}

/**
 * The work log from two Macs. A session runs on the Mac it started on: one
 * from the other Mac is marked with that Mac's id (mac), and loses the mark
 * when it comes back home. Sessions you started yourself that look like a
 * task's, and the looks-done judge's proposals, stay with their Mac.
 */
export function mergeWork(
  local: WorkFile,
  remote: Pick<WorkFile, 'entries' | 'notIt'>,
  ids: { here: string; peer: string }
): WorkFile {
  const byId = new Map<string, WorkEntry>()
  const home = (entry: WorkEntry, from: 'local' | 'remote'): WorkEntry => {
    if (entry.kind !== 'session') return entry
    const mac = entry.mac ?? (from === 'remote' ? ids.peer : undefined)
    const rest = { ...entry }
    delete rest.mac
    return mac && mac !== ids.here ? { ...rest, mac } : rest
  }
  for (const [from, entries] of [
    ['local', local.entries],
    ['remote', remote.entries],
  ] as const)
    for (const raw of entries) {
      const entry = home(raw, from)
      const seen = byId.get(entry.id)
      if (!seen) {
        byId.set(entry.id, entry)
        continue
      }
      const newer =
        touchedAt(entry) !== touchedAt(seen)
          ? touchedAt(entry) > touchedAt(seen)
            ? entry
            : seen
          : JSON.stringify(entry) > JSON.stringify(seen)
            ? entry
            : seen
      const other = newer === entry ? seen : entry
      if (newer.kind === 'session' && other.kind === 'session') {
        const resumedAt = [
          ...new Set([...(newer.resumedAt ?? []), ...(other.resumedAt ?? [])]),
        ].sort()
        byId.set(entry.id, {
          ...newer,
          ...(newer.session || !other.session
            ? {}
            : { session: other.session }),
          ...(resumedAt.length > 0 ? { resumedAt } : {}),
        })
      } else byId.set(entry.id, newer)
    }
  const notIt = new Map(
    [...(local.notIt ?? []), ...(remote.notIt ?? [])].map((entry) => [
      `${entry.task}\n${entry.session}`,
      entry,
    ])
  )
  return {
    ...local,
    entries: [...byId.values()].sort(
      (a, b) => touchedAtStart(a) - touchedAtStart(b) || (a.id < b.id ? -1 : 1)
    ),
    notIt: [...notIt.values()].sort((a, b) =>
      a.at < b.at ? -1 : a.at > b.at ? 1 : a.task < b.task ? -1 : 1
    ),
  }
}

const touchedAtStart = (entry: WorkEntry) =>
  Date.parse(entry.kind === 'session' ? entry.startedAt : entry.at) || 0

/** What Write it up wrote, from two Macs: each period's latest */
export function mergeWritten(
  local: Record<string, Written>,
  remote: Record<string, Written>
): Record<string, Written> {
  const all: Record<string, Written> = { ...local }
  for (const [key, written] of Object.entries(remote)) {
    const seen = all[key]
    if (
      !seen ||
      Date.parse(written.at) > Date.parse(seen.at) ||
      (written.at === seen.at && JSON.stringify(written) > JSON.stringify(seen))
    )
      all[key] = written
  }
  return sorted(all)
}

/**
 * Your areas from two Macs: each area by id, with the parts either Mac
 * found, what you took out on either, the name you gave it, and leaving it.
 * Who you are on GitHub and in git stays with each Mac.
 */
export function mergeYou(local: YouFile, remote: YouFile): YouFile {
  const byId = new Map<string, AreaRecord>()
  for (const area of [...local.areas, ...remote.areas]) {
    const seen = byId.get(area.id)
    if (!seen) {
      byId.set(area.id, area)
      continue
    }
    const named =
      seen.named && area.named
        ? JSON.stringify(seen) >= JSON.stringify(area)
          ? seen
          : area
        : seen.named
          ? seen
          : area.named
            ? area
            : seen.name <= area.name
              ? seen
              : area
    const out = [...new Set([...(seen.out ?? []), ...(area.out ?? [])])].sort()
    const parts = new Map(
      [...seen.parts, ...area.parts].map((part) => [
        `${part.kind}:${part.id}`,
        part,
      ])
    )
    const left = later(seen.left, area.left)
    byId.set(area.id, {
      id: area.id,
      name: named.name,
      ...(named.named ? { named: true } : {}),
      parts: [...parts.values()]
        .filter((part) => !out.includes(`${part.kind}:${part.id}`))
        .sort((a, b) => (`${a.kind}:${a.id}` < `${b.kind}:${b.id}` ? -1 : 1)),
      ...(out.length > 0 ? { out } : {}),
      createdAt:
        Date.parse(seen.createdAt) <= Date.parse(area.createdAt)
          ? seen.createdAt
          : area.createdAt,
      ...(left ? { left } : {}),
    })
  }
  const confirmedAt = later(local.confirmedAt, remote.confirmedAt)
  return {
    ...local,
    areas: [...byId.values()].sort((a, b) =>
      a.createdAt < b.createdAt
        ? -1
        : a.createdAt > b.createdAt
          ? 1
          : a.id < b.id
            ? -1
            : 1
    ),
    ...(confirmedAt ? { confirmedAt } : {}),
  }
}

/**
 * Collections another Mac ran, kept beside the old log
 * (tasks-collections.json) and marked with that Mac's id, so Todo can say
 * "Collected 10:20 on MacBook Pro". Its rows replace the ones it sent before.
 */
export function mergeCollections(
  kept: CollectionRecord[],
  remote: CollectionRecord[],
  peer: string,
  now = Date.now(),
  days = 7
): CollectionRecord[] {
  const since = now - days * 86_400_000
  return [
    ...kept.filter((row) => row.mac !== peer),
    ...remote
      .filter((row) => !row.mac && Date.parse(row.startedAt) >= since)
      .map((row) => ({ ...row, mac: peer })),
  ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}
