import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterAll, describe, expect, it } from 'vitest'
import {
  recentFolders,
  repoFolderRows,
  saveRepo,
  suggestFolders,
  yourRepos,
} from '../src/tasks/folders.js'
import {
  collectPrompt,
  registerTaskTools,
  taskRules,
} from '../src/tasks/mcp.js'
import type { TaskView } from '../src/tasks/types.js'

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'pacenote-folders-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

// Whole seconds, as a log's time is set
const NOW = Math.floor(Date.now() / 1000) * 1000
const HOUR = 3600_000
const DAY = 24 * HOUR

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'ignore' })
function checkout(at: string, remote?: string) {
  mkdirSync(at, { recursive: true })
  git(at, 'init', '-q')
  if (remote) git(at, 'remote', 'add', 'origin', remote)
  return at
}

/** A log that last wrote some time ago */
function log(file: string, lines: object[], ago: number) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, lines.map((line) => `${JSON.stringify(line)}\n`).join(''))
  const at = new Date(NOW - ago)
  utimesSync(file, at, at)
}

/** Claude Code's log of a session in a folder */
function claudeSession(home: string, cwd: string, ago: number, id = 'a') {
  log(
    path.join(
      home,
      '.claude',
      'projects',
      cwd.replace(/[/.]/g, '-'),
      `${id}.jsonl`
    ),
    [
      { type: 'summary', summary: 'Earlier work' },
      {
        type: 'user',
        sessionId: id,
        cwd,
        message: { role: 'user', content: 'hi' },
      },
    ],
    ago
  )
}

/** Codex's rollout of a session in a folder, in today's folder */
function codexSession(home: string, cwd: string, ago: number) {
  const day = new Date(NOW)
  log(
    path.join(
      home,
      '.codex',
      'sessions',
      String(day.getFullYear()),
      String(day.getMonth() + 1).padStart(2, '0'),
      String(day.getDate()).padStart(2, '0'),
      'rollout-2026-10-14T09-00-00-0199.jsonl'
    ),
    [
      {
        type: 'session_meta',
        payload: { id: '0199', cwd, instructions: 'x'.repeat(100_000) },
      },
    ],
    ago
  )
}

const task = (fields: Partial<TaskView>) =>
  ({
    title: 'Look into it',
    source: { conversation: 'C1', message: '1.0', label: '#ops' },
    ...fields,
  }) as TaskView

describe('the folders you worked in lately', () => {
  it('reads them from Claude Code’s and Codex’s logs, newest first', () => {
    const home = path.join(root, 'recent')
    const data = path.join(home, '.pacenote')
    const payments = checkout(path.join(home, 'git', 'payments'))
    const web = checkout(path.join(home, 'work', 'web'))
    const old = checkout(path.join(home, 'git', 'old'))
    mkdirSync(data, { recursive: true })
    // Temporary, but outside the home: where a tool ran for an app
    const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'scratch-')))

    claudeSession(home, payments, 2 * HOUR)
    claudeSession(home, payments, 5 * HOUR, 'b')
    codexSession(home, web, HOUR)
    claudeSession(home, old, 40 * DAY)
    claudeSession(home, home, HOUR)
    claudeSession(home, data, HOUR)
    claudeSession(home, scratch, HOUR)
    claudeSession(home, path.join(home, 'gone'), HOUR)

    expect(
      recentFolders(home, { leaveOut: [data], now: NOW }).map((f) => [
        f.path,
        Date.parse(f.usedAt),
      ])
    ).toEqual([
      [web, NOW - HOUR],
      [payments, NOW - 2 * HOUR],
    ])
    rmSync(scratch, { recursive: true, force: true })
  })

  it('reads none without the tools’ logs', () => {
    expect(recentFolders(path.join(root, 'nobody'))).toEqual([])
  })
})

describe('a task’s folder', () => {
  const home = path.join(root, 'suggest')
  const data = path.join(home, '.pacenote')
  mkdirSync(data, { recursive: true })
  const payments = checkout(
    path.join(home, 'git', 'payments'),
    'git@github.com:Ashon/payments.git'
  )
  const worktree = checkout(
    path.join(home, 'work', 'payments-hotfix'),
    'https://github.com/Ashon/payments.git'
  )
  const found = checkout(
    path.join(home, 'git', 'github', 'payments'),
    'https://github.com/Ashon/payments'
  )
  const ledger = checkout(
    path.join(home, 'git', 'ledger'),
    'git@github.com:Ashon/ledger.git'
  )
  const notes = path.join(home, 'notes')
  mkdirSync(notes, { recursive: true })
  claudeSession(home, notes, HOUR)
  claudeSession(home, ledger, 2 * HOUR)
  claudeSession(home, worktree, 3 * HOUR)
  codexSession(home, payments, 4 * HOUR)

  it('for a repository: its folder, then its checkouts you worked in, then the ones found', async () => {
    saveRepo(data, 'Ashon/payments', payments)
    const folders = await suggestFolders(task({ repo: 'ashon/payments' }), {
      home,
      dataDir: data,
    })
    expect(folders.map((f) => [f.path, f.usedAt !== undefined])).toEqual([
      [payments, true],
      [worktree, true],
      [found, false],
    ])
    expect(folders.every((f) => f.matches)).toBe(true)
    saveRepo(data, 'Ashon/payments', undefined)
  })

  it('for a task with none: the folders you worked in, the ones it names first', async () => {
    const suggest = (fields: Partial<TaskView>) =>
      suggestFolders(task(fields), { home, dataDir: data }).then((folders) =>
        folders.map((f) => f.path)
      )
    // Newest first
    expect(await suggest({})).toEqual([notes, ledger, worktree, payments])
    // Named in the title, by its folder or its repository
    expect(await suggest({ title: 'Check the ledger totals' })).toEqual([
      ledger,
      notes,
      worktree,
      payments,
    ])
    // Named in the channel, after the ones named in the task
    expect(
      await suggest({
        summary: 'hyun asks about payments',
        source: { conversation: 'C1', message: '1.0', label: '#ledger' },
      })
    ).toEqual([worktree, payments, ledger, notes])
    // A word of its own: "ledgers" does not name the ledger
    expect((await suggest({ title: 'Count the ledgers' }))[0]).toBe(notes)
    const [first] = await suggestFolders(task({}), { home, dataDir: data })
    expect(first).toMatchObject({
      path: notes,
      error: 'It is not a git checkout.',
      usedAt: new Date(NOW - HOUR).toISOString(),
    })
  })

  it('names the repositories you work in, never their folders', async () => {
    const away = checkout(
      path.join(home, 'git', 'mirror'),
      '/srv/git/mirror.git'
    )
    claudeSession(home, away, HOUR)
    saveRepo(data, 'Acme/billing', path.join(home, 'git', 'billing'))
    expect(await yourRepos(data, home)).toEqual([
      'Acme/billing',
      'Ashon/ledger',
      'Ashon/payments',
    ])
    // Without the home, only the ones with a folder remembered
    expect(await yourRepos(data, undefined)).toEqual(['Acme/billing'])
  })

  it('lists each repository with where its code tasks open', async () => {
    const rows = await repoFolderRows(data, home, [
      'Ashon/payments',
      'ashon/payments',
      'Acme/web',
    ])
    expect(rows.map((row) => [row.repo, row.state, row.tasks])).toEqual([
      // A folder remembered: its tasks open there
      ['Acme/billing', 'remembered', 0],
      // In your open tasks, and a checkout where you worked lately
      ['Ashon/payments', 'found', 2],
      // In a task, with no folder anywhere yet
      ['Acme/web', 'none', 1],
      // Only where you worked lately
      ['Ashon/ledger', 'found', 0],
    ])
    // The checkout you worked in last: the hotfix worktree
    expect(rows[1]!.folder).toBe(worktree)
    expect(rows[3]!.folder).toBe(ledger)
  })

  it('gives a collection the repositories, to tell what a thread means', async () => {
    const server = new McpServer({ name: 'pacenote', version: 'test' })
    registerTaskTools(server, {
      dataDir: data,
      settings: () => ({ on: true, dms: false, exclude: [] }),
      home,
    })
    const client = new Client({ name: 'claude-code', version: '1' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await server.connect(serverSide)
    await client.connect(clientSide)
    const result = await client.callTool({ name: 'collect_context' })
    const [content] = result.content as { text: string }[]
    const context = JSON.parse(content!.text)
    expect(context.repos).toEqual([
      'Acme/billing',
      'Ashon/ledger',
      'Ashon/payments',
    ])
    expect(content!.text).not.toContain(home)
    expect(taskRules('en')).toContain('repositories collect_context lists')
    expect(collectPrompt()).toContain(
      'or no repo while its thread plainly means one'
    )
    await client.close()
  })
})
