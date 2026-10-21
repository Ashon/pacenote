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
import { localized } from '../i18n/locale.js'
import { text } from './folders.text.js'
import { readJson, writeJson } from './store.js'
import type { FolderCheck, TaskView } from './types.js'

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
export const REPOS_FILE = 'tasks-repos.json'

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
    const { stdout } = await run('git', ['-C', folder, ...args], {
      timeout: 5000,
    })
    return stdout
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

/** Codex's session logs since a time: ~/.codex/sessions/YYYY/MM/DD/*.jsonl */
export function codexLogs(
  home: string,
  since: number,
  now = Date.now()
): string[] {
  const root = path.join(home, '.codex', 'sessions')
  const files: string[] = []
  for (
    let day = since - 86_400_000;
    day <= now + 86_400_000;
    day += 86_400_000
  ) {
    const date = new Date(day)
    const dir = path.join(
      root,
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    )
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
  let text: string
  try {
    text = head(file, 64 * 1024)
  } catch {
    return undefined
  }
  const match = /"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)
  if (!match) return undefined
  try {
    const folder = JSON.parse(`"${match[1]}"`) as string
    return path.isAbsolute(folder) ? folder : undefined
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

function list(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function modified(file: string): number | undefined {
  try {
    return statSync(file).mtimeMs
  } catch {
    return undefined
  }
}

function isFolder(folder: string): boolean {
  try {
    return statSync(folder).isDirectory()
  } catch {
    return false
  }
}

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
  const once = (folders: string[]) => {
    const seen = new Set<string>()
    return folders.filter((folder) => {
      const key = real(folder)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const { repo } = task
  if (repo) {
    const remembered = repoFolder(options.dataDir, repo)
    const folders = once([
      ...(remembered ? [remembered] : []),
      ...recent.map((folder) => folder.path),
    ])
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
    for (const remote of remotes) {
      const url = remote?.trim() ?? ''
      // A URL or user@host:path, not a folder on this Mac
      if (!/^[a-z+]+:\/\/|^[\w.-]+@/i.test(url)) continue
      const repo = remoteRepo(url)
      if (repo) repos.push(repo)
    }
  }
  const seen = new Set<string>()
  return repos
    .filter((repo) => {
      const key = repo.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}
