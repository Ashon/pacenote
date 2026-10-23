import { execFile } from 'node:child_process'
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { dayDirFor } from '../history/layout.js'
import { localized } from '../i18n/locale.js'
import { text } from './folders.text.js'
import { readJson, writeJson } from './store.js'
import type { FolderCheck, RepoFolderRow, TaskView } from './types.js'

/**
 * Where a task's work happens on this Mac: each repository's folder, chosen
 * once and remembered, its checkouts found under the usual folders, and the
 * folders you worked in lately with Claude Code or Codex, read from their own
 * session logs (only each session's folder). The desktop app suggests a
 * task's folder from these; a collection is given the repositories' names,
 * never their folders.
 */

const run = promisify(execFile)

/** Each repository's folder on this Mac (tasks-repos.json, the app's) */
const REPOS_FILE = 'tasks-repos.json'

export function readRepos(dataDir: string): Record<string, string> {
  const file = readJson<{ repos?: Record<string, string> }>(
    path.join(dataDir, REPOS_FILE),
    {}
  )
  return file.repos && typeof file.repos === 'object' ? file.repos : {}
}

export function saveRepo(
  dataDir: string,
  repo: string,
  folder: string | undefined
): Record<string, string> {
  const repos = readRepos(dataDir)
  const key = Object.keys(repos).find(
    (name) => name.toLowerCase() === repo.toLowerCase()
  )
  if (key) delete repos[key]
  if (folder) repos[repo] = folder
  writeJson(path.join(dataDir, REPOS_FILE), { version: 1, repos })
  return repos
}

export const repoFolder = (dataDir: string, repo: string) =>
  Object.entries(readRepos(dataDir)).find(
    ([name]) => name.toLowerCase() === repo.toLowerCase()
  )?.[1]

/**
 * The repository a git remote points to, as owner/name:
 * https://github.com/Ashon/payments.git, git@github.com:Ashon/payments.git
 */
export function remoteRepo(remote: string): string | undefined {
  const match = /[/:]([^/:\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim())
  return match ? `${match[1]}/${match[2]}` : undefined
}

/** remoteRepo, for a remote that is a URL or user@host:path, not a folder */
export function originRepo(remote: string | undefined): string | undefined {
  const url = remote?.trim() ?? ''
  return /^[a-z+]+:\/\/|^[\w.-]+@/i.test(url) ? remoteRepo(url) : undefined
}

/** The repository of a folder's checkout, by its origin, as owner/name */
export async function folderRepo(folder: string): Promise<string | undefined> {
  const remote = await git(folder, ['remote', 'get-url', 'origin'])
  return remote ? remoteRepo(remote) : undefined
}

/** Whether a folder is the repository's checkout: its origin and its changes */
export async function checkFolder(
  folder: string,
  repo: string | undefined
): Promise<FolderCheck> {
  const t = localized(text)
  if (!existsSync(folder) || !statSync(folder).isDirectory())
    return { path: folder, matches: false, error: t.noFolder }
  const remote = await git(folder, ['remote', 'get-url', 'origin'])
  const status = await git(folder, ['status', '--porcelain'])
  if (status === undefined)
    return { path: folder, matches: !repo, error: t.notCheckout }
  return {
    path: folder,
    remote: remote?.trim() || undefined,
    matches:
      !repo || remoteRepo(remote ?? '')?.toLowerCase() === repo.toLowerCase(),
    changes: status.split('\n').filter((line) => line.trim()).length,
  }
}

async function git(
  folder: string,
  args: string[]
): Promise<string | undefined> {
  try {
    return (await run('git', ['-C', folder, ...args], { timeout: 5000 })).stdout
  } catch {
    return undefined
  }
}

/** Where checkouts usually are, under the home folder */
const ROOTS = [
  'git',
  'src',
  'code',
  'work',
  'projects',
  'Developer',
  'dev',
  'repos',
]
const SKIP = new Set(['node_modules', 'Library', 'vendor', 'target', 'dist'])

/**
 * Checkouts of the repository under the usual folders of the home, at most
 * four levels down: the checkouts are listed first, then the ones named like
 * the repository have their remote checked before the rest, a few, quickly
 */
export async function findRepoFolders(
  repo: string,
  home: string,
  limit = 5
): Promise<FolderCheck[]> {
  const deadline = Date.now() + 3000
  const checkouts: string[] = []
  const queue: { dir: string; depth: number }[] = ROOTS.map((name) => ({
    dir: path.join(home, name),
    depth: 0,
  })).filter(({ dir }) => existsSync(dir))
  let visited = 0
  while (queue.length && Date.now() < deadline && (visited += 1) <= 5000) {
    const { dir, depth } = queue.shift()!
    if (existsSync(path.join(dir, '.git'))) {
      checkouts.push(dir)
      continue
    }
    if (depth >= 4) continue
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true }))
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          !SKIP.has(entry.name)
        )
          queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 })
    } catch {
      // Not readable
    }
  }
  const name = repo.split('/')[1]?.toLowerCase() ?? ''
  const named = (dir: string) => path.basename(dir).toLowerCase().includes(name)
  const ordered = [
    ...checkouts.filter(named),
    ...checkouts.filter((dir) => !named(dir)),
  ].slice(0, 60)
  const found: FolderCheck[] = []
  for (const dir of ordered) {
    if (found.length >= limit || Date.now() > deadline + 3000) break
    const check = await checkFolder(dir, repo)
    if (check.matches) found.push(check)
  }
  return found
}

// ---------------------------------------------------------------------------
// Codex's session logs

/** The first bytes of a file, for finding what a log starts with */
export function head(file: string, bytes = 256 * 1024): string {
  const fd = openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(bytes)
    const read = readSync(fd, buffer, 0, bytes, 0)
    return buffer.subarray(0, read).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

const DAY = 86_400_000

/** Codex's session logs since a time: ~/.codex/sessions/YYYY/MM/DD/*.jsonl */
export function codexLogs(
  home: string,
  since: number,
  now = Date.now()
): string[] {
  const root = path.join(home, '.codex', 'sessions')
  const files: string[] = []
  for (let day = since - DAY; day <= now + DAY; day += DAY) {
    const dir = path.join(root, ...dayDirFor(new Date(day)).split('-'))
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir))
      if (name.endsWith('.jsonl')) files.push(path.join(dir, name))
  }
  return files.filter((file) => statSync(file).mtimeMs >= since - 60_000)
}

// ---------------------------------------------------------------------------
// The folders you worked in lately

/** How far back the tools' session logs are read for their folders */
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60_000

export interface RecentFolder {
  path: string
  /** When a session there last wrote to its log */
  usedAt: string
}

/**
 * The folders you worked in lately with Claude Code or Codex, newest first,
 * from their session logs of the last 30 days. Left out: your home folder,
 * the folders given, and temporary ones outside your home (where a tool runs
 * for an app, as a collection does).
 */
export function recentFolders(
  home: string,
  options: { leaveOut?: string[]; now?: number; limit?: number } = {}
): RecentFolder[] {
  const now = options.now ?? Date.now()
  const since = now - RECENT_WINDOW_MS
  const seen = new Map<string, number>()
  const note = (folder: string | undefined, at: number | undefined) => {
    if (!folder || at === undefined || at < since) return
    if ((seen.get(folder) ?? 0) < at) seen.set(folder, at)
  }
  // Claude Code keeps a project's logs together: its newest says when.
  const projects = path.join(home, '.claude', 'projects')
  for (const project of list(projects)) {
    const dir = path.join(projects, project)
    let newest: { file: string; at: number } | undefined
    for (const name of list(dir)) {
      if (!name.endsWith('.jsonl')) continue
      const file = path.join(dir, name)
      const at = modified(file)
      if (at !== undefined && (!newest || at > newest.at)) newest = { file, at }
    }
    if (newest) note(folderIn(newest.file), newest.at)
  }
  for (const file of codexLogs(home, since, now))
    note(folderIn(file), modified(file))

  const realHome = real(home)
  const leaveOut = new Set([realHome, ...(options.leaveOut ?? []).map(real)])
  return [...seen]
    .map(([folder, at]) => ({ folder, real: real(folder), at }))
    .filter(
      ({ folder, real }) =>
        !leaveOut.has(real) &&
        (inside(realHome, real) || !temporary(real)) &&
        isFolder(folder)
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, options.limit ?? 12)
    .map(({ folder, at }) => ({
      path: folder,
      usedAt: new Date(at).toISOString(),
    }))
}

/**
 * A folder a session ran in is your work's: not one an app runs its tools in
 * (leaveOut, Pacenote's data folder), nor a temporary one outside your home
 */
export function yourFolder(
  home: string,
  folder: string,
  leaveOut: string[] = []
): boolean {
  const at = real(folder)
  return (
    !leaveOut.some((dir) => inside(real(dir), at)) &&
    (inside(real(home), at) || !temporary(at))
  )
}

/**
 * A folder with its links followed, as the tools log it (/private/var); one
 * that is gone (a worktree removed since), by the nearest folder still there
 */
function real(folder: string): string {
  const rest: string[] = []
  for (let at = path.resolve(folder); ; at = path.dirname(at)) {
    try {
      return path.join(realpathSync(at), ...rest)
    } catch {
      if (path.dirname(at) === at) return path.resolve(folder)
      rest.unshift(path.basename(at))
    }
  }
}

/** The folder a session log says it ran in: its first "cwd" */
function folderIn(file: string): string | undefined {
  const text = attempt(() => head(file, 64 * 1024), '')
  const folder = logField(text, 'cwd')
  return folder && path.isAbsolute(folder) ? folder : undefined
}

/** A string field's first value in a session log's text */
export function logField(text: string, name: string): string | undefined {
  const match = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(
    text
  )
  if (!match) return undefined
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return undefined
  }
}

const TEMPORARY = [
  tmpdir(),
  '/tmp',
  '/private/tmp',
  '/var/folders',
  '/private/var/folders',
]

const temporary = (folder: string) =>
  TEMPORARY.some((dir) => inside(dir, folder))

const inside = (dir: string, folder: string) =>
  folder === dir || folder.startsWith(dir.endsWith('/') ? dir : `${dir}/`)

/** What read gives, or fallback when it throws */
function attempt<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

const list = (dir: string) => attempt(() => readdirSync(dir), [] as string[])
const modified = (file: string) =>
  attempt<number | undefined>(() => statSync(file).mtimeMs, undefined)
const isFolder = (folder: string) =>
  attempt(() => statSync(folder).isDirectory(), false)

// ---------------------------------------------------------------------------
// A task's folder

/**
 * The folders a task may open in, likeliest first, each checked. With a
 * repository: its folder remembered, then the folders you worked in lately
 * that are its checkouts, then its checkouts under the usual folders. With
 * none: the folders you worked in lately, the ones its title or summary
 * names first, then the ones its channel names.
 */
export async function suggestFolders(
  task: Pick<TaskView, 'repo' | 'title' | 'summary' | 'source'>,
  options: { home: string; dataDir: string; limit?: number }
): Promise<FolderCheck[]> {
  const limit = options.limit ?? 5
  const recent = recentFolders(options.home, { leaveOut: [options.dataDir] })
  // Each folder once, however its path was written
  const used = new Map(
    recent.map((folder) => [real(folder.path), folder.usedAt])
  )
  const withUse = (check: FolderCheck): FolderCheck => {
    const usedAt = used.get(real(check.path))
    return usedAt ? { ...check, usedAt } : check
  }
  const { repo } = task
  if (repo) {
    const remembered = repoFolder(options.dataDir, repo)
    const folders = onceBy(
      [...(remembered ? [remembered] : []), ...recent.map((f) => f.path)],
      real
    )
    const found = (
      await Promise.all(folders.map((folder) => checkFolder(folder, repo)))
    ).filter((check) => check.matches)
    if (found.length < limit)
      for (const check of await findRepoFolders(repo, options.home, limit))
        if (!found.some((f) => real(f.path) === real(check.path)))
          found.push(check)
    return found.slice(0, limit).map(withUse)
  }
  const asked = [task.title, task.summary].join(' ').toLowerCase()
  const where = task.source.label.toLowerCase()
  const checks = await Promise.all(
    recent.map((folder) => checkFolder(folder.path, undefined))
  )
  // Named in the task first, then in its channel, each newest first
  const rank = (check: FolderCheck) => {
    const names = [
      path.basename(check.path),
      remoteRepo(check.remote ?? '')?.split('/')[1],
    ].filter((name): name is string => Boolean(name && name.length >= 3))
    if (names.some((name) => mentions(asked, name))) return 2
    return names.some((name) => mentions(where, name)) ? 1 : 0
  }
  return checks
    .map((check) => ({ check, rank: rank(check) }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map(({ check }) => withUse(check))
}

/** Whether a text has a name in it as a word of its own */
const mentions = (text: string, name: string) =>
  new RegExp(
    `(^|[^a-z0-9])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`
  ).test(text)

/**
 * The repositories you work in, as owner/name: the ones with a folder
 * remembered, then the remotes of the folders you worked in lately (read
 * only with a home). For a collection, to tell what repository a thread
 * means; no folder is in it.
 */
export async function yourRepos(
  dataDir: string,
  home: string | undefined,
  limit = 20
): Promise<string[]> {
  const repos = Object.keys(readRepos(dataDir))
  if (home) {
    const recent = recentFolders(home, { leaveOut: [dataDir] })
    const remotes = await Promise.all(
      recent.map((folder) => git(folder.path, ['remote', 'get-url', 'origin']))
    )
    repos.push(...remotes.flatMap((remote) => originRepo(remote) ?? []))
  }
  return onceBy(repos, (repo) => repo.toLowerCase()).slice(0, limit)
}

/**
 * The repositories you work in, each with where its code tasks open: those
 * with a folder remembered, then those of your open tasks, then those of the
 * folders you worked in lately (read only with a home). A repository without
 * a folder remembered shows the newest of those folders that is its checkout.
 */
export async function repoFolderRows(
  dataDir: string,
  home: string | undefined,
  taskRepos: readonly string[],
  limit = 20
): Promise<RepoFolderRow[]> {
  const remembered = readRepos(dataDir)
  const recent = home ? recentFolders(home, { leaveOut: [dataDir] }) : []
  const checkouts = (
    await Promise.all(
      recent.map(async (folder) => ({
        folder: folder.path,
        repo: originRepo(
          await git(folder.path, ['remote', 'get-url', 'origin'])
        ),
      }))
    )
  ).filter((each): each is { folder: string; repo: string } =>
    Boolean(each.repo)
  )
  const key = (repo: string) => repo.toLowerCase()
  const found = new Map<string, string>()
  for (const each of checkouts)
    if (!found.has(key(each.repo))) found.set(key(each.repo), each.folder)
  const count = (repo: string) =>
    taskRepos.filter((each) => key(each) === key(repo)).length
  return onceBy(
    [
      ...Object.keys(remembered),
      ...taskRepos,
      ...checkouts.map((each) => each.repo),
    ],
    key
  )
    .slice(0, limit)
    .map((repo): RepoFolderRow => {
      const tasks = count(repo)
      const chosen =
        remembered[repo] ??
        Object.entries(remembered).find(
          ([name]) => key(name) === key(repo)
        )?.[1]
      if (chosen) return { repo, state: 'remembered', folder: chosen, tasks }
      const folder = found.get(key(repo))
      return folder
        ? { repo, state: 'found', folder, tasks }
        : { repo, state: 'none', tasks }
    })
}

/** Each item once, by its key: the first one kept */
function onceBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    return !seen.has(k) && seen.add(k)
  })
}
