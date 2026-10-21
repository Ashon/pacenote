import { randomUUID } from 'node:crypto'
import { getLocale, localized, type Locale } from '../i18n/locale.js'
import { outcomeOf, outcomeWords } from '../tasks/context.js'
import type { TaskView, WorkEntry } from '../tasks/types.js'
import { text } from './areas.text.js'
import type { SessionMark } from './sessions.js'
import type {
  AreaPart,
  AreaRecord,
  AreaRole,
  AreaView,
  TaskArea,
  YouFile,
} from './types.js'

/**
 * Where you contribute, found in your work with no model asked: each
 * repository you worked in is an area, its sibling repositories (payments,
 * payments-sdk) join it, and so does a Slack channel whose tasks are mostly
 * about it; a channel that asks you often about no one repository is an area
 * of its own, as is a user group that asks you. Areas are kept (you.json) so
 * your fixes stay: later work only adds parts to them, never renames or takes
 * apart what you shaped. What is going on in each is counted again each time.
 */

const DAY = 86_400_000
/** How far back your work is read: 8 weeks */
export const WINDOW_MS = 56 * DAY
/** What lately and roles count */
export const RECENT_MS = 30 * DAY
/** An area with nothing for this long is resting */
export const REST_AFTER_MS = 28 * DAY
/** A session that wrote this lately is working now */
const WORKING_MS = 15 * 60_000
/** A repository needs this much work in it to be an area */
const REPO_MIN = 2
/** A channel joins a repository's area with this many tasks about it... */
const CHANNEL_JOIN_MIN = 2
/** ...that are this share of its tasks about a repository */
const CHANNEL_JOIN_SHARE = 0.6
/** A channel with no repository of its own needs this many tasks */
const CHANNEL_MIN = 3
/** A user group with no channel or repository of its own needs this many */
const GROUP_MIN = 2
const LATELY = 3
const NOW = 5
const PEOPLE = 3

export const partKey = (part: Pick<AreaPart, 'kind' | 'id'>) =>
  `${part.kind}:${part.id.toLowerCase()}`

/**
 * What one audience may hear of your work. Pace answers in a channel that
 * everyone there reads, so it speaks only of tasks from public channels and
 * your own from this Mac.
 */
export interface Audience {
  task: (task: TaskView) => boolean
  /** A Slack conversation, by ID */
  channel: (conversation: string) => boolean
}

/**
 * The areas an audience may hear of, without the channels it may not. An area
 * with a repository is named for it and stays; one without is named for one
 * of its channels, so it goes when any of them may not be heard of.
 */
export function areasFor(
  records: readonly AreaRecord[],
  audience?: Audience
): AreaRecord[] {
  if (!audience) return [...records]
  return records.flatMap((record) => {
    const heard = record.parts.filter(
      (part) => part.kind !== 'channel' || audience.channel(part.id)
    )
    if (heard.length === record.parts.length) return [record]
    if (!record.parts.some((part) => part.kind === 'repo')) return []
    return [{ ...record, parts: heard }]
  })
}

/** One piece of your work: a task or a session, and the parts it touches */
export interface Signal {
  at: number
  parts: AreaPart[]
  task?: TaskView
  session?: SessionMark
}

/** A task is your work unless it is a Maybe, or you dismissed it as not */
const yourTask = (task: TaskView) =>
  task.status !== 'maybe' &&
  (task.status !== 'dismissed' || task.dismissReason === 'done-already')

export function taskParts(task: TaskView): AreaPart[] {
  const parts: AreaPart[] = []
  if (task.repo && /^[^/\s]+\/[^/\s]+$/.test(task.repo))
    parts.push({ kind: 'repo', id: task.repo.toLowerCase(), label: task.repo })
  if (task.source.app !== 'local' && task.source.label.startsWith('#'))
    parts.push({
      kind: 'channel',
      id: task.source.conversation,
      label: task.source.label,
    })
  if (task.group)
    parts.push({
      kind: 'group',
      id: task.group.toLowerCase(),
      label: task.group,
    })
  return parts
}

/** Your work of the last 8 weeks, from your tasks and sessions */
export function signalsOf(
  tasks: readonly TaskView[],
  sessions: readonly SessionMark[],
  now = Date.now()
): Signal[] {
  const signals: Signal[] = []
  for (const task of tasks) {
    if (!yourTask(task)) continue
    const at = Date.parse(task.settledAt ?? task.postedAt)
    const parts = taskParts(task)
    if (parts.length && now - at < WINDOW_MS) signals.push({ at, parts, task })
  }
  // A session is work on the day it started and the day it last wrote, so
  // one kept open over days counts more than one, and never more than it
  // shows (the days between are not read).
  for (const session of sessions) {
    if (!session.repo) continue
    const last = Date.parse(session.lastAt)
    const start = Date.parse(session.startedAt)
    const days = dayOf(start) === dayOf(last) ? [last] : [last, start]
    for (const at of days) {
      if (now - at >= WINDOW_MS) continue
      signals.push({
        at,
        session,
        parts: [
          { kind: 'repo', id: session.repo.toLowerCase(), label: session.repo },
        ],
      })
    }
  }
  return signals
}

/** The day a time is in, on this Mac */
const dayOf = (at: number) => new Date(at).toDateString()

/**
 * The areas your work makes, each a list of parts (repositories first, most
 * worked in first), and the parts that are enough for an area on their own
 */
export function findAreas(signals: readonly Signal[]): {
  areas: AreaPart[][]
  alone: Set<string>
} {
  const count = new Map<string, number>()
  const parts = new Map<string, AreaPart>()
  // A channel's or group's tasks, by the repository or channel they are about
  const with_ = new Map<string, Map<string, number>>()
  const bump = (map: Map<string, number>, key: string) =>
    map.set(key, (map.get(key) ?? 0) + 1)
  for (const signal of signals) {
    const keys = signal.parts.map(partKey)
    signal.parts.forEach((part, i) => {
      bump(count, keys[i]!)
      if (!parts.has(keys[i]!)) parts.set(keys[i]!, part)
    })
    for (const key of keys) {
      if (key.startsWith('repo:')) continue
      const others = with_.get(key) ?? new Map<string, number>()
      for (const other of keys)
        if (other !== key && !other.startsWith('group:')) bump(others, other)
      with_.set(key, others)
    }
  }
  const kind = (key: string) => parts.get(key)!.kind
  const n = (key: string) => count.get(key) ?? 0

  // Union-find over the parts that make it into an area
  const up = new Map<string, string>()
  const root = (key: string): string => {
    const parent = up.get(key)!
    if (parent === key) return key
    const top = root(parent)
    up.set(key, top)
    return top
  }
  const join = (a: string, b: string) => up.set(root(a), root(b))
  const alone = new Set<string>()

  const repos = [...count.keys()].filter(
    (key) => kind(key) === 'repo' && n(key) >= REPO_MIN
  )
  for (const repo of repos) {
    up.set(repo, repo)
    alone.add(repo)
  }
  // Siblings: payments and payments-sdk, under one owner
  for (const a of repos)
    for (const b of repos) {
      if (a === b) continue
      const [ownerA, nameA] = a.slice(5).split('/')
      const [ownerB, nameB] = b.slice(5).split('/')
      if (
        ownerA === ownerB &&
        nameA!.length >= 3 &&
        /^[-_.]/.test(nameB!.slice(nameA!.length)) &&
        nameB!.startsWith(nameA!)
      )
        join(b, a)
    }
  // The one repository most of a channel's tasks are about, else its own
  const best = (key: string, among: (other: string) => boolean) => {
    const others = [...(with_.get(key) ?? new Map<string, number>())].filter(
      ([other]) => among(other)
    )
    const total = others.reduce((sum, [, k]) => sum + k, 0)
    const [top] = others.sort((a, b) => b[1] - a[1])
    return top &&
      top[1] >= CHANNEL_JOIN_MIN &&
      top[1] / total >= CHANNEL_JOIN_SHARE
      ? top[0]
      : undefined
  }
  for (const channel of [...count.keys()].filter(
    (k) => kind(k) === 'channel'
  )) {
    const repo = best(
      channel,
      (other) => up.has(other) && kind(other) === 'repo'
    )
    if (repo) {
      up.set(channel, channel)
      join(channel, repo)
    } else if (n(channel) >= CHANNEL_MIN) {
      up.set(channel, channel)
      alone.add(channel)
    }
  }
  for (const group of [...count.keys()].filter((k) => kind(k) === 'group')) {
    const [top] = [...(with_.get(group) ?? new Map<string, number>())]
      .filter(([other]) => up.has(other))
      .sort((a, b) => b[1] - a[1])
    if (top) {
      up.set(group, group)
      join(group, top[0])
    } else if (n(group) >= GROUP_MIN) {
      up.set(group, group)
      alone.add(group)
    }
  }

  const byRoot = new Map<string, string[]>()
  for (const key of up.keys()) {
    const top = root(key)
    byRoot.set(top, [...(byRoot.get(top) ?? []), key])
  }
  const order = { repo: 0, channel: 1, group: 2 }
  const areas = [...byRoot.values()]
    .map((keys) =>
      keys
        .sort(
          (a, b) =>
            order[kind(a)] - order[kind(b)] || n(b) - n(a) || a.localeCompare(b)
        )
        .map((key) => parts.get(key)!)
    )
    .sort((a, b) => sum(b) - sum(a))
  function sum(area: AreaPart[]) {
    return area.reduce((total, part) => total + n(partKey(part)), 0)
  }
  return { areas, alone }
}

/**
 * A name for an area from its parts: its main repository's ("Payments" for
 * Ashon/payments and Ashon/payments-sdk), else its channel's or group's
 */
export function areaName(parts: readonly AreaPart[]): string {
  const repos = parts.filter((part) => part.kind === 'repo')
  let name: string
  if (repos.length) {
    const names = repos.map((repo) => repo.label.split('/')[1] ?? repo.label)
    const first = names[0]!
    // The family's own name: the shortest that the first starts with
    name =
      names
        .filter((each) => first === each || first.startsWith(each))
        .sort((a, b) => a.length - b.length)[0] ?? first
  } else name = (parts[0]?.label ?? 'Area').replace(/^[#@]/, '')
  const words = name.replace(/[-_.]+/g, ' ').trim()
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'Area'
}

/**
 * Puts what your work makes into the areas kept: a part no area has joins the
 * area its other parts are in (unless you took it out of that one), or starts
 * a new area. Areas are never renamed, split or dropped here.
 */
export function reconcile(
  records: readonly AreaRecord[],
  found: ReturnType<typeof findAreas>,
  now = new Date(),
  newId = () => randomUUID().slice(0, 8)
): { records: AreaRecord[]; changed: boolean } {
  const next = records.map((record) => ({
    ...record,
    parts: [...record.parts],
  }))
  const owner = new Map<string, AreaRecord>()
  for (const record of next)
    for (const part of record.parts) owner.set(partKey(part), record)
  let changed = false
  const start = (parts: AreaPart[]) => {
    const record: AreaRecord = {
      id: newId(),
      name: areaName(parts),
      parts,
      createdAt: now.toISOString(),
    }
    next.push(record)
    for (const part of parts) owner.set(partKey(part), record)
    changed = true
  }
  for (const area of found.areas) {
    const free = area.filter((part) => !owner.has(partKey(part)))
    if (free.length === 0) continue
    const overlap = new Map<AreaRecord, number>()
    for (const part of area) {
      const record = owner.get(partKey(part))
      if (record) overlap.set(record, (overlap.get(record) ?? 0) + 1)
    }
    const [target] = [...overlap]
      .sort((a, b) => Number(!b[0].left) - Number(!a[0].left) || b[1] - a[1])
      .map(([record]) => record)
    if (!target) {
      start(free)
      continue
    }
    const out = new Set(target.out ?? [])
    const joining = free.filter((part) => !out.has(partKey(part)))
    if (joining.length) {
      target.parts.push(...joining)
      for (const part of joining) owner.set(partKey(part), target)
      changed = true
    }
    // One you took out stands alone, if it is enough for an area by itself.
    for (const part of free)
      if (out.has(partKey(part)) && found.alone.has(partKey(part)))
        start([part])
  }
  return { records: next, changed }
}

// Your fixes, each a change to you.json's areas

export function renameArea(file: YouFile, id: string, name: string): YouFile {
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) return file
  return {
    ...file,
    areas: file.areas.map((area) =>
      area.id === id ? { ...area, name: trimmed, named: true } : area
    ),
  }
}

/** Takes a part out of an area; an area left with none goes */
export function takeOut(file: YouFile, id: string, key: string): YouFile {
  return {
    ...file,
    areas: file.areas.flatMap((area) => {
      if (area.id !== id) return [area]
      const parts = area.parts.filter((part) => partKey(part) !== key)
      if (parts.length === area.parts.length) return [area]
      if (parts.length === 0) return []
      return [{ ...area, parts, out: [...new Set([...(area.out ?? []), key])] }]
    }),
  }
}

/** Puts one area's parts into another, which keeps its name */
export function mergeAreas(file: YouFile, id: string, into: string): YouFile {
  const from = file.areas.find((area) => area.id === id)
  if (!from || id === into || !file.areas.some((area) => area.id === into))
    return file
  return {
    ...file,
    areas: file.areas
      .filter((area) => area.id !== id)
      .map((area) => {
        if (area.id !== into) return area
        const keys = new Set(area.parts.map(partKey))
        return {
          ...area,
          parts: [
            ...area.parts,
            ...from.parts.filter((part) => !keys.has(partKey(part))),
          ],
        }
      }),
  }
}

/** Not yours anymore (or yours again, with left false) */
export function leaveArea(
  file: YouFile,
  id: string,
  left: boolean,
  now = new Date()
): YouFile {
  return {
    ...file,
    areas: file.areas.map((area) => {
      if (area.id !== id) return area
      const { left: _was, ...rest } = area
      void _was
      return left ? { ...rest, left: now.toISOString() } : rest
    }),
  }
}

/** The area a task is in: by its repository, else its channel, else group */
export function taskArea(
  records: readonly AreaRecord[],
  task: Pick<TaskView, 'repo' | 'source' | 'group'>
): TaskArea | undefined {
  const keys = taskParts(task as TaskView).map(partKey)
  for (const key of keys) {
    const area = records.find(
      (record) => !record.left && record.parts.some((p) => partKey(p) === key)
    )
    if (area) return { id: area.id, name: area.name }
  }
  return undefined
}

const ROLE_ORDER: AreaRole[] = ['build', 'review', 'answer', 'on-call']

/**
 * What is going on in each area kept, from your work; what shows each role
 * and how tasks ended, in the app's language unless one is given (English for
 * an AI tool)
 */
export function areaViews(
  records: readonly AreaRecord[],
  signals: readonly Signal[],
  work: readonly WorkEntry[],
  now = Date.now(),
  locale: Locale = getLocale()
): AreaView[] {
  const t = localized(text, locale)
  const views = records
    .filter((record) => !record.left)
    .map((record): AreaView => {
      const keys = new Set(record.parts.map(partKey))
      const mine = signals.filter((signal) =>
        signal.parts.some((part) => keys.has(partKey(part)))
      )
      const recent = mine.filter((signal) => now - signal.at < RECENT_MS)
      const tasks = recent.flatMap((signal) =>
        signal.task ? [signal.task] : []
      )
      const sessions = recent.filter((signal) => signal.session)
      const asked = tasks.filter(
        (task) => task.kind === 'asked' && task.askedBy
      )
      const askers = rank(asked.map((task) => task.askedBy!))
      const roles: AreaView['roles'] = []
      const days = new Set(sessions.map((signal) => dayOf(signal.at))).size
      if (days)
        roles.push({
          role: 'build',
          evidence: t.sessionDays(days),
        })
      const reviews = tasks.filter((task) => /\breview|리뷰/i.test(task.title))
      if (reviews.length >= 2)
        roles.push({
          role: 'review',
          evidence: t.reviews(reviews.length),
        })
      if (asked.length >= 2)
        roles.push({
          role: 'answer',
          evidence: t.peopleAsked(askers.slice(0, 2), asked.length),
        })
      const groups = record.parts.filter((part) => part.kind === 'group')
      const byGroup = tasks.filter((task) =>
        groups.some((group) => group.id === task.group?.toLowerCase())
      )
      if (byGroup.length)
        roles.push({
          role: 'on-call',
          evidence: t.groupsAsked(
            groups.map((g) => g.label),
            byGroup.length
          ),
        })
      roles.sort(
        (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
      )
      // Open tasks, whenever they were asked
      const all = mine.flatMap((signal) => (signal.task ? [signal.task] : []))
      const open = all
        .filter((task) => task.status === 'open')
        .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
      const settled = tasks
        .filter((task) => task.status !== 'open' && task.settledAt)
        .sort((a, b) => Date.parse(b.settledAt!) - Date.parse(a.settledAt!))
      const live = mine
        .filter(
          (signal) =>
            signal.session &&
            now - Date.parse(signal.session.lastAt) < WORKING_MS
        )
        .sort((a, b) => b.at - a.at)[0]?.session
      const weeks = Array.from({ length: 8 }, () => 0)
      for (const signal of mine) {
        const ago = Math.floor((now - signal.at) / (7 * DAY))
        if (ago >= 0 && ago < 8) weeks[7 - ago] = (weeks[7 - ago] ?? 0) + 1
      }
      const last = Math.max(...mine.map((signal) => signal.at))
      const lastActiveAt = Number.isFinite(last)
        ? new Date(last).toISOString()
        : undefined
      return {
        id: record.id,
        name: record.name,
        parts: record.parts,
        state:
          lastActiveAt && now - last < REST_AFTER_MS ? 'active' : 'resting',
        roles,
        now: unique(open)
          .slice(0, NOW)
          .map((task) => ({
            id: task.id,
            title: task.title,
            askedBy: task.kind === 'asked' ? task.askedBy : undefined,
            due: task.due,
          })),
        working: live && { tool: live.tool, at: live.lastAt },
        lately: unique(settled)
          .slice(0, LATELY)
          .map((task) => ({
            id: task.id,
            title: task.title,
            at: task.settledAt!,
            outcome:
              task.status === 'dismissed'
                ? outcomeWords({ kind: 'done-already' }, locale)
                : outcomeOf(task, [...work], locale),
          })),
        latelyMore: Math.max(0, unique(settled).length - LATELY),
        people: askers.slice(0, PEOPLE),
        weeks,
        lastActiveAt,
      }
    })
  const at = (view: AreaView) => Date.parse(view.lastActiveAt ?? '') || 0
  return [
    ...views.filter((v) => v.state === 'active').sort((a, b) => at(b) - at(a)),
    ...views.filter((v) => v.state === 'resting').sort((a, b) => at(b) - at(a)),
  ]
}

/** Names by how often they come, most first */
function rank(list: string[]): string[] {
  const counts = new Map<string, number>()
  for (const name of list) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

function unique(tasks: TaskView[]): TaskView[] {
  const seen = new Set<string>()
  return tasks.filter((task) => !seen.has(task.id) && seen.add(task.id))
}
