import { execFile } from 'node:child_process'
import { open, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  codexLogs,
  logField,
  remoteRepo,
  yourFolder,
} from '../tasks/folders.js'
import type { WorkTool } from '../tasks/types.js'

/**
 * Your Claude Code and Codex sessions on this Mac, as much of each as tells
 * where you worked: the folder it ran in, its repository, and when it started
 * and last wrote to its log. Only a log's first lines are read, once; nothing
 * you typed or the tools said is kept.
 */

export interface SessionMark {
  tool: WorkTool
  cwd: string
  /** The folder's repository, as owner/name, from its origin remote */
  repo?: string
  startedAt: string
  /** When it last wrote to its log */
  lastAt: string
}

/** What a log's head says, kept by file: it does not change */
const heads = new Map<string, { cwd?: string; startedAt?: string }>()

const HEAD_BYTES = 64 * 1024

async function headOf(file: string) {
  const known = heads.get(file)
  if (known) return known
  let text = ''
  const handle = await open(file, 'r').catch(() => undefined)
  if (handle)
    try {
      const buffer = Buffer.alloc(HEAD_BYTES)
      const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0)
      text = buffer.subarray(0, bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  const head = {
    cwd: logField(text, 'cwd'),
    startedAt: logField(text, 'timestamp'),
  }
  // A log too new to say yet is read again next time.
  if (head.cwd) heads.set(file, head)
  return head
}

const run = promisify(execFile)

/** Each folder's repository, asked of git and kept a while */
const repos = new Map<
  string,
  { at: number; repo: Promise<string | undefined> }
>()

function repoOf(cwd: string, now = Date.now()) {
  const known = repos.get(cwd)
  if (known && now - known.at < 10 * 60_000) return known.repo
  const repo = run('git', ['-C', cwd, 'config', '--get', 'remote.origin.url'], {
    timeout: 5_000,
  }).then(
    ({ stdout }) => {
      const url = stdout.trim()
      // A URL or user@host:path, not a folder on this Mac
      return /^[a-z+]+:\/\/|^[\w.-]+@/i.test(url) ? remoteRepo(url) : undefined
    },
    () => undefined
  )
  repos.set(cwd, { at: now, repo })
  return repo
}

/**
 * Your sessions since a time, newest first: the ones in your own folders, not
 * the ones an app runs its tools in (leaveOut, Pacenote's data folder) or a
 * temporary folder outside your home
 */
export async function sessionMarks(
  home: string,
  options: { since: number; now?: number; leaveOut?: string[] }
): Promise<SessionMark[]> {
  const now = options.now ?? Date.now()
  const files: { file: string; tool: WorkTool }[] = []
  const projects = path.join(home, '.claude', 'projects')
  for (const project of await readdir(projects).catch(() => [])) {
    const dir = path.join(projects, project)
    for (const name of await readdir(dir).catch(() => []))
      if (name.endsWith('.jsonl'))
        files.push({ file: path.join(dir, name), tool: 'claude' })
  }
  try {
    for (const file of codexLogs(home, options.since, now))
      files.push({ file, tool: 'codex' })
  } catch {
    // No Codex logs
  }
  const marks: SessionMark[] = []
  for (const { file, tool } of files) {
    const info = await stat(file).catch(() => undefined)
    if (!info || info.mtimeMs < options.since) continue
    const head = await headOf(file)
    if (!head.cwd || !path.isAbsolute(head.cwd)) continue
    if (!yourFolder(home, head.cwd, options.leaveOut)) continue
    const lastAt = new Date(info.mtimeMs).toISOString()
    marks.push({
      tool,
      cwd: head.cwd,
      startedAt:
        head.startedAt && !Number.isNaN(Date.parse(head.startedAt))
          ? head.startedAt
          : lastAt,
      lastAt,
    })
  }
  await Promise.all(
    marks.map(async (mark) => {
      mark.repo = await repoOf(mark.cwd, now)
    })
  )
  return marks.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))
}
