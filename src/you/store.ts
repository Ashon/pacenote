import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Locale } from '../i18n/locale.js'
import { allTaskViews, readJson, readTasks, writeJson } from '../tasks/store.js'
import { readWork } from '../tasks/work.js'
import {
  areasFor,
  areaViews,
  findAreas,
  reconcile,
  signalsOf,
  WINDOW_MS,
  type Audience,
} from './areas.js'
import { sessionMarks } from './sessions.js'
import type { YouFile, YouView } from './types.js'

/**
 * you.json: your areas as you shaped them, when you looked at them, and who
 * you are on GitHub and in git. Only the desktop app writes it; the MCP
 * server reads it.
 */
export const YOU_FILE = 'you.json'

export function readYou(dataDir: string): YouFile {
  const file = readJson<Partial<YouFile>>(path.join(dataDir, YOU_FILE), {})
  return {
    version: 1,
    areas: Array.isArray(file.areas) ? file.areas : [],
    ...(file.confirmedAt ? { confirmedAt: file.confirmedAt } : {}),
    ...(file.accounts?.checkedAt ? { accounts: file.accounts } : {}),
  }
}

export function changeYou(
  dataDir: string,
  change: (file: YouFile) => YouFile
): YouFile {
  const next = change(readYou(dataDir))
  writeJson(path.join(dataDir, YOU_FILE), next)
  return next
}

/**
 * You, counted from your tasks and your sessions on this Mac (with a home):
 * the areas kept, with any your work adds, and what is going on in each.
 * keep: write the areas it adds (the desktop app); the MCP server only reads.
 * audience: count only what it may hear of (Pace in a channel). locale: the
 * language of its words, the app's unless given (English for an AI tool).
 */
export async function countYou(options: {
  dataDir: string
  home?: string
  keep?: boolean
  audience?: Audience
  now?: number
  locale?: Locale
}): Promise<YouView> {
  const { dataDir } = options
  const now = options.now ?? Date.now()
  const sessions = options.home
    ? await sessionMarks(options.home, {
        since: now - WINDOW_MS,
        now,
        leaveOut: [dataDir],
      })
    : []
  // Read after the sessions, all at once, so a fix made meanwhile is kept
  const { audience } = options
  const tasks = allTaskViews(dataDir, now).filter(
    (task) => !audience || audience.task(task)
  )
  const signals = signalsOf(tasks, sessions, now)
  let file = readYou(dataDir)
  const found = reconcile(file.areas, findAreas(signals), new Date(now))
  if (found.changed) {
    file = { ...file, areas: found.records }
    // Areas found from part of your work are not kept
    if (options.keep && !audience) writeJson(path.join(dataDir, YOU_FILE), file)
  }
  const areas = areaViews(
    areasFor(file.areas, audience),
    signals,
    readWork(dataDir).entries,
    now,
    options.locale
  )
  const slack = readTasks(dataDir).you
  return {
    areas,
    firstLook: areas.length > 0 && !file.confirmedAt,
    accounts: {
      ...(slack
        ? {
            slack: {
              name: slack.name || slack.realName || slack.id,
              team: slack.team,
            },
          }
        : {}),
      ...(file.accounts?.github ? { github: file.accounts.github } : {}),
      ...(file.accounts?.git ? { git: file.accounts.git } : {}),
    },
    at: new Date(now).toISOString(),
  }
}

const run = promisify(execFile)
const DAY = 86_400_000

/**
 * Who you are on GitHub (gh, as signed in) and in git (its global email),
 * looked up once a day. Neither is asked for anything else.
 */
export async function checkAccounts(
  dataDir: string,
  toolPath: string,
  now = Date.now()
): Promise<void> {
  const checkedAt = readYou(dataDir).accounts?.checkedAt
  if (checkedAt && now - Date.parse(checkedAt) < DAY) return
  const env = { ...process.env, PATH: toolPath }
  const ask = (command: string, args: string[]) =>
    run(command, args, { env, timeout: 10_000 }).then(
      ({ stdout }) => stdout.trim() || undefined,
      () => undefined
    )
  const github = await ask('gh', ['api', 'user', '--jq', '.login'])
  const git = await ask('git', ['config', '--global', 'user.email'])
  changeYou(dataDir, (file) => ({
    ...file,
    accounts: {
      checkedAt: new Date(now).toISOString(),
      ...(github && /^[\w-]{1,39}$/.test(github) ? { github } : {}),
      ...(git && git.includes('@') && git.length < 200 ? { git } : {}),
    },
  }))
}
