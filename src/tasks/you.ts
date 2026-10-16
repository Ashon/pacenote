import type { TasksSettings } from './settings.js'
import { readTasks, withTasksLock, writeTasks } from './store.js'
import type { SlackYou, TasksFile } from './types.js'

/**
 * Who you are in Slack, so a collection can tell what is asked of you and
 * what only looks like it: your member id and names as the collection's own
 * Slack connector sees you (it looks them up once, then every 30 days), the
 * other names people call you and the user groups that mean you (Settings >
 * Todo), and the groups you said do not (on a Maybe's row). Kept in
 * tasks.json; Pacenote holds no Slack token for this.
 */

const DAY = 24 * 60 * 60_000
/** A collection looks you up again after this long */
export const LOOK_AGAIN_MS = 30 * DAY

/** A Slack member id: U or W, then letters and digits */
const MEMBER = /^[UW][A-Z0-9]{2,20}$/

/**
 * A user group as its @handle ("@infra-oncall"), from "infra-oncall",
 * "@Infra-Oncall" or Slack's <!subteam^S0123|@infra-oncall>; undefined when it
 * is not one
 */
export function groupHandle(value: string): string | undefined {
  const subteam = /^<!subteam\^[A-Z0-9]+(?:\|([^>]*))?>$/.exec(value.trim())
  const name = (subteam ? (subteam[1] ?? '') : value)
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
  return /^[\p{L}\p{N}._-]{1,80}$/u.test(name) ? `@${name}` : undefined
}

const unique = (values: readonly (string | undefined)[]) => {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const name = value?.trim()
    if (!name || seen.has(name.toLowerCase())) return []
    seen.add(name.toLowerCase())
    return [name.slice(0, 80)]
  })
}

/** The user groups that mean you, as @handles (Settings > Todo) */
export function yourGroups(settings: TasksSettings): string[] {
  return unique((settings.groups ?? []).map(groupHandle))
}

/** The groups you said are not you, but for those Settings says are */
export function notYourGroups(file: TasksFile, yours: readonly string[]) {
  return unique(
    (file.notYourGroups ?? [])
      .map((entry) => groupHandle(entry.group))
      .filter((group) => group && !yours.includes(group))
  )
}

/** Who you are, as a collection is told (collect_context) */
export interface YouForCollection {
  /** Your member id, as the collection's Slack connector saw you */
  id?: string
  /** What people call you: your Slack names, then the ones you added */
  names: string[]
  /** User groups whose mention asks you */
  groups: string[]
  /** User groups you said do not mean you */
  notGroups: string[]
  /**
   * Not looked up yet, or not lately: the collection looks up your own
   * profile and gives it to add_tasks
   */
  lookUp?: true
}

export function youForCollection(
  file: TasksFile,
  settings: TasksSettings,
  now = Date.now()
): YouForCollection {
  const { you } = file
  const groups = yourGroups(settings)
  return {
    ...(you ? { id: you.id } : {}),
    names: unique([you?.name, you?.realName, ...(settings.names ?? [])]),
    groups,
    notGroups: notYourGroups(file, groups),
    ...(you && now - Date.parse(you.seenAt) < LOOK_AGAIN_MS
      ? {}
      : { lookUp: true as const }),
  }
}

/** Your profile as a collection sends it (add_tasks) */
export interface NewYou {
  id: string
  name?: string
  real_name?: string
  team?: string
}

/** Your profile to keep; undefined when its id is not a member id */
export function youFrom(input: NewYou, now: Date): SlackYou | undefined {
  const id = input.id.trim()
  if (!MEMBER.test(id)) return undefined
  const text = (value: string | undefined) =>
    value?.trim().slice(0, 80) || undefined
  return {
    id,
    name: text(input.name)?.replace(/^@/, ''),
    realName: text(input.real_name),
    team: text(input.team),
    seenAt: now.toISOString(),
  }
}

/**
 * Says whether a user group means you, for the ones Settings does not list:
 * a group that does not is kept so it is not asked about again, and a
 * collection leaves its mentions out. One that does goes into Settings, by
 * the caller, and comes off this list. undefined when it is not a group.
 */
export function answerGroup(
  dataDir: string,
  value: string,
  yours: boolean,
  now = new Date()
): string | undefined {
  const group = groupHandle(value)
  if (!group) return undefined
  withTasksLock(dataDir, () => {
    const file = readTasks(dataDir)
    const others = (file.notYourGroups ?? []).filter(
      (entry) => groupHandle(entry.group) !== group
    )
    writeTasks(dataDir, {
      ...file,
      notYourGroups: yours
        ? others
        : [...others, { group, at: now.toISOString() }],
    })
  })
  return group
}
