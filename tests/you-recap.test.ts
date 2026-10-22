import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../src/i18n/locale.js'
import { registerTaskTools } from '../src/tasks/mcp.js'
import { saveRepo } from '../src/tasks/folders.js'
import type { TaskView, WorkEntry } from '../src/tasks/types.js'
import { addTasks, closeTask } from '../src/tasks/write.js'
import {
  type Commit,
  keepWritten,
  periodKey,
  periodRange,
  recapOf,
  recapPrompt,
  shiftPeriod,
  yourCommits,
} from '../src/you/recap.js'
import type { SessionMark } from '../src/you/sessions.js'
import type { AreaRecord } from '../src/you/types.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-recap-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** Thursday Oct 15 2026, 9:30 on this Mac */
const NOW = new Date(2026, 9, 15, 9, 30).getTime()
const at = (day: number, hour = 12) =>
  new Date(2026, 9, day, hour).toISOString()

const areas: AreaRecord[] = [
  {
    id: 'pay',
    name: 'Payments',
    parts: [
      { kind: 'repo', id: 'ashon/payments', label: 'Ashon/payments' },
      { kind: 'channel', id: 'C0PAY', label: '#payments' },
    ],
    createdAt: at(1),
  },
  {
    id: 'infra',
    name: 'Infra on-call',
    parts: [{ kind: 'channel', id: 'C0INFRA', label: '#infra' }],
    createdAt: at(1),
  },
]

let n = 0
function task(over: Partial<TaskView> & { channel?: [string, string] }) {
  n += 1
  const { channel, ...rest } = over
  const [conversation, label] = channel ?? ['C0PAY', '#payments']
  return {
    id: `T${n}`,
    source: { app: 'slack', conversation, label, message: `${n}.000100` },
    title: `Task ${n}`,
    kind: 'asked',
    askedBy: 'mina',
    confidence: 'sure',
    reason: 'Asked by name',
    postedAt: at(13),
    foundAt: at(13),
    status: 'open',
    faded: false,
    ...rest,
  } as TaskView
}

const commit = (subject: string, day: number, repo = 'Ashon/payments') => ({
  repo,
  hash: `${subject}-${day}`,
  at: at(day),
  subject,
})

describe('recap periods', () => {
  it('counts weeks from Monday, as ISO does, and steps across years', () => {
    expect(periodKey('week', new Date(2026, 9, 12))).toBe('2026-W42')
    expect(periodKey('week', new Date(2026, 9, 15))).toBe('2026-W42')
    expect(periodKey('week', new Date(2026, 9, 18, 23))).toBe('2026-W42')
    expect(periodKey('week', new Date(2026, 9, 19))).toBe('2026-W43')
    // 2026 starts on a Thursday, so it has 53 weeks and Jan 1 2027 is in it.
    expect(periodKey('week', new Date(2027, 0, 1))).toBe('2026-W53')
    expect(shiftPeriod('week', '2026-W53', 1)).toBe('2027-W01')
    const week = periodRange('week', '2026-W42')!
    expect(week.start).toEqual(new Date(2026, 9, 12))
    expect(week.end).toEqual(new Date(2026, 9, 19))
    expect(shiftPeriod('week', '2026-W42', -1)).toBe('2026-W41')
    expect(shiftPeriod('day', '2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftPeriod('month', '2026-12', 1)).toBe('2027-01')
    expect(periodKey('month', new Date(2026, 9, 15))).toBe('2026-10')
    expect(periodRange('week', 'W42')).toBeUndefined()
  })
})

describe('a recap', () => {
  const tasks = [
    task({
      title: 'Ship retry backoff',
      repo: 'Ashon/payments',
      status: 'done',
      settledAt: at(14, 16),
    }),
    task({
      title: 'Answer hyun',
      askedBy: 'hyun',
      status: 'closed',
      closed: { at: at(13), why: 'replied' },
      settledAt: at(13),
    }),
    task({
      title: 'Review the payment retry PR',
      due: 'Friday',
      postedAt: at(14),
    }),
    task({
      title: 'Clear the disk alert',
      channel: ['C0INFRA', '#infra'],
      askedBy: 'jin',
      status: 'done',
      settledAt: at(14, 18),
    }),
    task({
      title: 'Look at the WAL growth',
      channel: ['C0INFRA', '#infra'],
      askedBy: 'jin',
      postedAt: at(14, 19),
    }),
    // Not your work: a Maybe, a task dismissed as not yours
    task({ title: 'A guess', status: 'maybe' }),
    task({
      title: 'Not mine',
      status: 'dismissed',
      dismissReason: 'not-mine',
      settledAt: at(14),
    }),
    // Last week's
    task({
      title: 'Old one',
      status: 'done',
      settledAt: at(8),
      postedAt: at(7),
    }),
  ]
  const sessions: SessionMark[] = [
    {
      tool: 'claude',
      cwd: '/w/payments',
      repo: 'Ashon/payments',
      startedAt: at(12, 10),
      lastAt: at(15, 9),
    },
  ]
  const commits: Commit[] = [
    commit('feat: retry backoff for payment retries', 14),
    commit('fix: keep the idempotency key on a retry', 14),
    commit('chore: tidy', 13),
    commit('feat: a side project', 13, 'Ashon/elsewhere'),
    commit('feat: last week', 8),
  ]
  const work: WorkEntry[] = [
    {
      kind: 'session',
      id: 'w1',
      task: tasks[2]!.id,
      tool: 'claude',
      cwd: '/w/payments',
      startedAt: at(15, 8),
    },
  ]
  const recap = (period: 'day' | 'week' | 'month', key: string) =>
    recapOf({
      period,
      key,
      now: NOW,
      tasks,
      work,
      areas,
      sessions,
      commits,
      runs: [
        { at: at(13), label: '#payments', request: 'any retry timeouts?' },
        { at: at(14), label: '#random', request: 'what is our coffee budget' },
      ],
      emails: ['ashon@acme.dev'],
    })!

  it('puts a week of work in its areas: done, commits by subject, days, asks and what carries over', () => {
    const week = recap('week', '2026-W42')
    expect(week.current).toBe(true)
    expect(week.prev).toBe('2026-W41')
    expect(week.next).toBeUndefined()
    expect(week.areas.map((a) => a.name)).toEqual([
      'Payments',
      'Infra on-call',
      'Elsewhere',
    ])
    const [payments, infra, elsewhere] = week.areas
    expect(payments).toMatchObject({
      done: 2,
      commits: 3,
      days: 4,
      asks: 3,
      runs: 1,
      repos: ['Ashon/payments'],
    })
    expect(payments!.items.map((i) => i.title)).toEqual([
      'Ship retry backoff',
      'Answer hyun',
      'feat: retry backoff for payment retries',
      'Asked Pace: any retry timeouts?',
    ])
    expect(payments!.commitsMore).toBe(2)
    expect(payments!.carried.map((i) => i.title)).toEqual([
      'Review the payment retry PR',
    ])
    expect(payments!.carried[0]!.note).toBe('mina asked you · due Friday')
    expect(infra).toMatchObject({ done: 1, commits: 0, asks: 2 })
    // A repository in no area, and a channel in none, are Elsewhere.
    expect(elsewhere!.items.map((i) => i.title)).toEqual([
      'feat: a side project',
      'Asked Pace: what is our coffee budget',
    ])
    expect(payments!.share).toBeGreaterThan(infra!.share)
    expect(week.totals).toMatchObject({ done: 3, commits: 4, days: 4 })
    // Last week has its own.
    const last = recap('week', '2026-W41')
    expect(last.current).toBe(false)
    expect(last.next).toBe('2026-W42')
    expect(last.areas[0]!.items.map((i) => i.title)).toEqual([
      'Old one',
      'feat: last week',
    ])
  })

  it('reads a morning as a standup: yesterday, today so far, doing and next', () => {
    const day = recap('day', '2026-10-15')
    expect(day.day!.yesterday!.map((i) => i.title)).toEqual([
      'Clear the disk alert',
      'Ship retry backoff',
      '2 commits in Ashon/payments',
    ])
    expect(day.day!.yesterday![2]!.note).toBe(
      'feat: retry backoff for payment retries · fix: keep the idempotency key on a retry'
    )
    expect(day.day!.done).toEqual([])
    expect(day.day!.doing.map((i) => i.title)).toEqual([
      'Review the payment retry PR',
    ])
    // Next: what is open, due ones first
    expect(day.day!.next.map((i) => i.title)).toEqual([
      'Look at the WAL growth',
    ])
    expect(day.day!.next[0]!.area?.name).toBe('Infra on-call')
  })

  it('says what changed in a month, and who asked most', () => {
    const month = recap('month', '2026-10')
    expect(month.month).toEqual({
      started: ['Payments', 'Infra on-call'],
      quiet: [],
      people: ['mina', 'jin', 'hyun'],
    })
  })

  it('asks for a write-up that sums commits up rather than listing them', () => {
    const week = recap('week', '2026-W42')
    const prompt = recapPrompt(
      week,
      'the week of Mon Oct 12, 2026 (so far)',
      commits
    )
    expect(prompt).toContain('never list commit messages')
    expect(prompt).toContain(
      '- Commit: fix: keep the idempotency key on a retry'
    )
    expect(prompt).toContain('- Done: Ship retry backoff (Done)')
    expect(prompt).toContain('- Still open: Review the payment retry PR')
    expect(prompt).not.toContain('feat: last week')
  })

  describe('in Korean', () => {
    afterEach(() => setLocale('en'))

    it('words its own lines in Korean, and the write-up prompt still in English', () => {
      setLocale('ko')
      const week = recap('week', '2026-W42')
      expect(week.areas.map((a) => a.name)).toEqual([
        'Payments',
        'Infra on-call',
        '기타',
      ])
      const [payments] = week.areas
      expect(payments!.items.map((i) => i.title)).toContain(
        'Pace에게 요청: any retry timeouts?'
      )
      expect(payments!.items[0]!.note).toBe('완료')
      expect(payments!.carried[0]!.note).toBe('mina님의 요청 · 마감 Friday')
      expect(recap('day', '2026-10-15').day!.yesterday![2]!.title).toBe(
        'Ashon/payments 커밋 2개'
      )

      const prompt = recapPrompt(
        week,
        'the week of Mon Oct 12, 2026 (so far)',
        commits
      )
      expect(prompt).toContain('## Elsewhere: ')
      expect(prompt).toContain('- Done: Ship retry backoff (Done)')
      expect(prompt).toContain('- Asked Pace: any retry timeouts?')
      expect(prompt).toContain(
        '- Still open: Review the payment retry PR (mina asked you · due Friday)'
      )
      expect(prompt).not.toMatch(/[가-힣]/)
      // The write-up itself is in the user's language, the app's
      expect(prompt).toContain('Write in Korean, the language the user reads')
    })
  })
})

describe('your commits', () => {
  it('are yours only, on any branch, once across checkouts', async () => {
    const repo = path.join(root, 'payments')
    mkdirSync(repo, { recursive: true })
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repo, ...args], {
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      })
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'ashon@acme.dev')
    git('config', 'user.name', 'ashon')
    const save = (file: string, message: string, author?: string) => {
      writeFileSync(path.join(repo, file), file)
      git('add', file)
      git(
        ...(author
          ? ['-c', `user.email=${author}`, '-c', 'user.name=mina']
          : []),
        'commit',
        '-q',
        '-m',
        message
      )
    }
    save('a', 'feat: retry backoff')
    save('b', 'fix: from mina', 'mina@acme.dev')
    git('switch', '-q', '-c', 'work')
    save('c', 'wip: on a branch')
    const { commits, emails } = await yourCommits({
      folders: new Map([['Ashon/payments', [repo, repo]]]),
      emails: [],
      since: new Date(Date.now() - 3_600_000),
      until: new Date(Date.now() + 60_000),
    })
    expect(commits.map((c) => c.subject).sort()).toEqual([
      'feat: retry backoff',
      'wip: on a branch',
    ])
    expect(emails).toEqual(['ashon@acme.dev'])
  })
})

describe('my_recap', () => {
  it('gives an AI tool the week, with what was written for it', async () => {
    const data = path.join(root, 'data')
    const settings = { on: true, dms: false, exclude: [] }
    const posted = Date.now() - 3_600_000
    const { added } = addTasks(
      data,
      [1, 2].map((k) => ({
        title: `Payments task ${k}`,
        asked_by: 'mina',
        where: '#payments',
        link: `https://acme.slack.com/archives/C0PAY/p${Math.floor(posted / 1000) + k}000100`,
        confidence: 'sure' as const,
        repo: 'Ashon/payments',
      })),
      { settings }
    )
    closeTask(data, added[0]!.id, 'resolved', new Date(), {
      by: 'claude-code',
      note: 'Merged the fix',
    })
    saveRepo(data, 'Ashon/payments', path.join(root, 'payments'))
    const week = periodKey('week', new Date())
    keepWritten(data, 'week', week, {
      text: 'You fixed the payment retries.',
      at: new Date().toISOString(),
      by: 'claude',
    })
    const server = new McpServer({ name: 'pacenote', version: 'test' })
    registerTaskTools(server, { dataDir: data, settings: () => settings })
    const client = new Client({ name: 'claude-code', version: '1' })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(a), client.connect(b)])
    const result = await client.callTool({
      name: 'my_recap',
      arguments: { period: 'week' },
    })
    const body = JSON.parse((result.content as { text: string }[])[0]!.text)
    expect(body).toMatchObject({
      period: 'week',
      key: week,
      soFar: true,
      written: 'You fixed the payment retries.',
    })
    expect(body.areas[0]).toMatchObject({
      name: 'Payments',
      done: ['Payments task 1 (Done in Claude Code · Merged the fix)'],
      stillOpen: ['Payments task 2 (mina asked you)'],
    })
    // The commits in the remembered folder are the user's own ones.
    expect(body.areas[0].commits).toEqual(
      expect.arrayContaining(['feat: retry backoff', 'wip: on a branch'])
    )
    const prompt = await client.getPrompt({
      name: 'recap',
      arguments: { period: 'day' },
    })
    expect((prompt.messages[0]!.content as { text: string }).text).toContain(
      'Call my_recap with period "day"'
    )
  })
})
