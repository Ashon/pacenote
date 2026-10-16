import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterAll, describe, expect, it } from 'vitest'
import { registerTaskTools } from '../src/tasks/mcp.js'
import type { TaskView } from '../src/tasks/types.js'
import { addTasks, closeTask } from '../src/tasks/write.js'
import {
  areaName,
  areaViews,
  findAreas,
  leaveArea,
  mergeAreas,
  partKey,
  reconcile,
  renameArea,
  signalsOf,
  takeOut,
  taskArea,
} from '../src/you/areas.js'
import { sessionMarks, type SessionMark } from '../src/you/sessions.js'
import { countYou, readYou, YOU_FILE } from '../src/you/store.js'
import type { YouFile } from '../src/you/types.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-you-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const DAY = 86_400_000
const NOW = Date.parse('2026-10-16T12:00:00Z')
const iso = (at: number) => new Date(at).toISOString()

let n = 0
/** A task as Todo shows it: asked by mina in #payments a day ago, open */
function task(
  over: Partial<TaskView> & { channel?: [string, string] } = {}
): TaskView {
  n += 1
  const { channel, ...rest } = over
  const [conversation, label] = channel ?? ['C0PAY', '#payments']
  const postedAt = iso(NOW - DAY)
  return {
    id: `T${n}`,
    source: { app: 'slack', conversation, label, message: `${n}.000100` },
    title: `Task ${n}`,
    kind: 'asked',
    askedBy: 'mina',
    confidence: 'sure',
    reason: 'Asked by name',
    postedAt,
    foundAt: postedAt,
    status: 'open',
    faded: false,
    ...rest,
  }
}

const session = (repo: string, daysAgo: number): SessionMark => ({
  tool: 'claude',
  cwd: `/Users/me/git/${repo}`,
  repo,
  startedAt: iso(NOW - daysAgo * DAY - 3_600_000),
  lastAt: iso(NOW - daysAgo * DAY),
})

/** The work of the storyboard: Payments, Webhooks, Infra on-call */
function work() {
  const tasks = [
    task({ repo: 'Ashon/payments', title: 'Review the payment retry PR' }),
    task({ repo: 'Ashon/payments', askedBy: 'hyun' }),
    task({
      repo: 'Ashon/payments',
      status: 'done',
      settledAt: iso(NOW - 2 * DAY),
      title: 'Shipped retry backoff',
    }),
    task({ title: 'Answer mina about refunds' }),
    // A channel whose tasks are about no one repository
    task({ channel: ['C0RANDOM', '#random'], repo: 'Ashon/payments' }),
    task({ channel: ['C0RANDOM', '#random'], repo: 'Acme/webhooks' }),
    // A channel that asks you often, and the group it asks you through
    task({ channel: ['C0INFRA', '#infra'], askedBy: 'jin' }),
    task({
      channel: ['C0INFRA', '#infra'],
      group: '@infra-oncall',
      askedBy: 'jin',
    }),
    task({
      channel: ['C0INFRA', '#infra'],
      group: '@infra-oncall',
      askedBy: 'jin',
    }),
    // Not your work: a Maybe, and one you said was not yours
    task({ repo: 'Acme/mobile', status: 'maybe' }),
    task({ repo: 'Acme/mobile', status: 'maybe' }),
    task({
      repo: 'Acme/mobile',
      status: 'dismissed',
      dismissReason: 'not-mine',
      settledAt: iso(NOW - DAY),
    }),
  ]
  const sessions = [
    session('Ashon/payments', 0.002),
    session('Ashon/payments-sdk', 3),
    session('Ashon/payments-sdk', 5),
    session('Acme/webhooks', 4),
    session('Acme/webhooks', 6),
  ]
  return { tasks, sessions }
}

describe('where you contribute', () => {
  it('makes an area of each repository you work in, with its siblings and the channel that asks about it', () => {
    const { tasks, sessions } = work()
    const found = findAreas(signalsOf(tasks, sessions, NOW))
    const labels = found.areas.map((area) => area.map((part) => part.label))
    expect(labels).toEqual([
      ['Ashon/payments', 'Ashon/payments-sdk', '#payments'],
      ['#infra', '@infra-oncall'],
      ['Acme/webhooks'],
    ])
    expect(found.areas.map(areaName)).toEqual(['Payments', 'Infra', 'Webhooks'])
    // A Maybe or a task you said was not yours is no one's area
    expect(labels.flat()).not.toContain('Acme/mobile')
    // #random asks about several repositories, and not often enough alone
    expect(labels.flat()).not.toContain('#random')
  })

  it('names an area by its family, its channel or its group', () => {
    const part = (kind: 'repo' | 'channel' | 'group', label: string) => ({
      kind,
      id: label.toLowerCase(),
      label,
    })
    expect(areaName([part('repo', 'team726/plant-butler-backend')])).toBe(
      'Plant butler backend'
    )
    expect(
      areaName([
        part('repo', 'Ashon/payments-sdk'),
        part('repo', 'Ashon/payments'),
      ])
    ).toBe('Payments')
    expect(areaName([part('channel', '#infra')])).toBe('Infra')
    expect(areaName([part('group', '@design')])).toBe('Design')
  })

  it('keeps your fixes as your work goes on', () => {
    const { tasks, sessions } = work()
    let id = 0
    const newId = () => `A${++id}`
    const first = reconcile(
      [],
      findAreas(signalsOf(tasks, sessions, NOW)),
      new Date(NOW),
      newId
    )
    expect(first.changed).toBe(true)
    let file: YouFile = { version: 1, areas: first.records }
    const [payments, infra, webhooks] = file.areas
    expect([payments!.name, infra!.name, webhooks!.name]).toEqual([
      'Payments',
      'Infra',
      'Webhooks',
    ])

    // You rename Payments, take #payments out of it, and leave Webhooks.
    file = renameArea(file, payments!.id, 'Money')
    file = takeOut(file, payments!.id, 'channel:c0pay')
    file = leaveArea(file, webhooks!.id, true, new Date(NOW))

    // Later work: a new sibling repository, and Webhooks again
    const later = findAreas(
      signalsOf(
        tasks,
        [
          ...sessions,
          session('Ashon/payments-worker', 1),
          session('Ashon/payments-worker', 2),
        ],
        NOW
      )
    )
    const again = reconcile(file.areas, later, new Date(NOW), newId)
    const money = again.records.find((area) => area.id === payments!.id)!
    expect(money.name).toBe('Money')
    expect(money.parts.map((part) => part.label)).toEqual([
      'Ashon/payments',
      'Ashon/payments-sdk',
      'Ashon/payments-worker',
    ])
    // #payments stays out, and is not an area on its own
    expect(
      again.records.some((area) =>
        area.parts.some((part) => partKey(part) === 'channel:c0pay')
      )
    ).toBe(false)
    // Webhooks stays yours no more, and comes back as no new area
    expect(again.records).toHaveLength(3)
    expect(
      taskArea(again.records, {
        repo: 'Acme/webhooks',
        source: tasks[0]!.source,
      })
    ).toBeUndefined()

    // Merging Infra into Money keeps Money's name, and Infra goes.
    file = mergeAreas(
      { version: 1, areas: again.records },
      infra!.id,
      payments!.id
    )
    expect(file.areas.map((area) => area.name)).toEqual(['Money', 'Webhooks'])
    expect(file.areas[0]!.parts.map((part) => part.label)).toContain(
      '@infra-oncall'
    )
    // An area with its last part taken out goes
    const lone = takeOut(file, webhooks!.id, 'repo:acme/webhooks')
    expect(lone.areas.map((area) => area.name)).toEqual(['Money'])
  })

  it('says how you contribute to each area, what is open, what you did lately and who asks', () => {
    const { tasks, sessions } = work()
    const signals = signalsOf(tasks, sessions, NOW)
    const { records } = reconcile([], findAreas(signals), new Date(NOW))
    // An area you last worked in six weeks ago rests.
    records.push({
      id: 'old',
      name: 'Mobile release',
      parts: [
        {
          kind: 'repo',
          id: 'ashon/mobile-release',
          label: 'Ashon/mobile-release',
        },
      ],
      createdAt: iso(NOW - 60 * DAY),
    })
    const views = areaViews(
      records,
      [
        ...signals,
        ...signalsOf([], [session('Ashon/mobile-release', 41)], NOW),
      ],
      [],
      NOW
    )
    expect(views.map((view) => [view.name, view.state])).toEqual([
      ['Payments', 'active'],
      ['Infra', 'active'],
      ['Webhooks', 'active'],
      ['Mobile release', 'resting'],
    ])
    const [payments, infra, webhooks] = views
    expect(payments!.roles).toEqual([
      { role: 'build', evidence: 'sessions here on 3 days of the last 30' },
      { role: 'answer', evidence: 'mina and hyun asked you 5 times' },
    ])
    // Working in Claude Code: a session wrote minutes ago
    expect(payments!.working?.tool).toBe('claude')
    expect(payments!.now.map((t) => t.title)).toContain(
      'Review the payment retry PR'
    )
    expect(payments!.now).toHaveLength(4)
    expect(payments!.lately).toEqual([
      {
        id: expect.any(String),
        title: 'Shipped retry backoff',
        at: iso(NOW - 2 * DAY),
        outcome: 'Done',
      },
    ])
    expect(payments!.people).toEqual(['mina', 'hyun'])
    expect(payments!.weeks).toHaveLength(8)
    expect(payments!.weeks.reduce((a, b) => a + b, 0)).toBe(8)
    expect(infra!.roles.map((role) => role.role)).toEqual(['answer', 'on-call'])
    expect(infra!.roles[1]!.evidence).toBe('@infra-oncall asked you 2 times')
    expect(webhooks!.roles).toEqual([
      { role: 'build', evidence: 'sessions here on 2 days of the last 30' },
    ])
    expect(views[3]!.lastActiveAt).toBe(iso(NOW - 41 * DAY))
  })

  it('puts a task in its area by its repository, else its channel', () => {
    const { tasks, sessions } = work()
    const { records } = reconcile(
      [],
      findAreas(signalsOf(tasks, sessions, NOW)),
      new Date(NOW)
    )
    expect(taskArea(records, task({ repo: 'Ashon/payments-sdk' }))?.name).toBe(
      'Payments'
    )
    expect(
      taskArea(records, task({ channel: ['C0INFRA', '#infra'] }))?.name
    ).toBe('Infra')
    expect(
      taskArea(records, task({ channel: ['C0DM', 'DM with mina'] }))
    ).toBeUndefined()
  })

  it('reads where your sessions ran from their logs, and their repository', async () => {
    const home = path.join(root, 'home')
    const repo = path.join(home, 'git', 'payments')
    mkdirSync(repo, { recursive: true })
    const { execFileSync } = await import('node:child_process')
    execFileSync('git', ['init', '-q', repo])
    execFileSync('git', [
      '-C',
      repo,
      'remote',
      'add',
      'origin',
      'git@github.com:Ashon/payments.git',
    ])
    const project = path.join(home, '.claude', 'projects', '-git-payments')
    mkdirSync(project, { recursive: true })
    writeFileSync(
      path.join(project, 's1.jsonl'),
      `${JSON.stringify({ type: 'user', cwd: repo, timestamp: iso(Date.now() - 60_000), message: { content: 'hello' } })}\n`
    )
    // A session an app ran in a temporary folder is not your work.
    writeFileSync(
      path.join(project, 's2.jsonl'),
      `${JSON.stringify({ type: 'user', cwd: tmpdir(), timestamp: iso(Date.now()) })}\n`
    )
    const marks = await sessionMarks(home, { since: Date.now() - 7 * DAY })
    expect(marks).toEqual([
      expect.objectContaining({
        tool: 'claude',
        cwd: repo,
        repo: 'Ashon/payments',
      }),
    ])
  })
})

describe('my_work', () => {
  it('tells an AI tool where the user contributes', async () => {
    const data = path.join(root, 'data')
    const settings = { on: true, dms: false, exclude: [] }
    const at = Date.now() - 2 * 3_600_000
    const link = (k: number) =>
      `https://acme.slack.com/archives/C0PAY/p${Math.floor(at / 1000) + k}000100`
    const { added } = addTasks(
      data,
      [1, 2, 3].map((k) => ({
        title: `Payments task ${k}`,
        asked_by: k === 1 ? 'hyun' : 'mina',
        where: '#payments',
        link: link(k),
        confidence: 'sure' as const,
        repo: 'Ashon/payments',
      })),
      { settings }
    )
    closeTask(data, added[2]!.id, 'resolved', new Date(), {
      by: 'claude-code',
      note: 'Merged the fix',
    })
    const server = new McpServer({ name: 'pacenote', version: 'test' })
    registerTaskTools(server, { dataDir: data, settings: () => settings })
    const client = new Client({ name: 'claude-code', version: '1' })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(a), client.connect(b)])
    const result = await client.callTool({ name: 'my_work', arguments: {} })
    const body = JSON.parse(
      (result.content as { text: string }[])[0]!.text
    ) as {
      areas: {
        name: string
        parts: string[]
        roles: string[]
        open: { title: string }[]
        lately: { title: string; outcome?: string }[]
        asksMost: string[]
      }[]
    }
    expect(body.areas).toEqual([
      {
        name: 'Payments',
        parts: ['Ashon/payments', '#payments'],
        roles: ['answers for it (mina and hyun asked you 3 times)'],
        open: [
          expect.objectContaining({
            title: 'Payments task 2',
            askedBy: 'mina',
          }),
          expect.objectContaining({
            title: 'Payments task 1',
            askedBy: 'hyun',
          }),
        ],
        lately: [
          {
            title: 'Payments task 3',
            at: expect.any(String),
            outcome: 'Done in Claude Code · Merged the fix',
          },
        ],
        asksMost: ['mina', 'hyun'],
      },
    ])
    // The MCP server only reads: the areas are the app's to keep.
    expect(readYou(data).areas).toEqual([])
    await expect(
      countYou({ dataDir: data, keep: true })
    ).resolves.toMatchObject({
      firstLook: true,
      areas: [expect.objectContaining({ name: 'Payments' })],
    })
    expect(readYou(data).areas).toHaveLength(1)
    expect(YOU_FILE).toBe('you.json')
  })
})
