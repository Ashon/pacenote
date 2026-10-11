import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterAll, describe, expect, it } from 'vitest'
import { registerTaskTools } from '../src/tasks/mcp.js'
import { readTasksSettings, type TasksSettings } from '../src/tasks/settings.js'
import {
  buildView,
  decide,
  prune,
  readDecisions,
  readTasks,
} from '../src/tasks/store.js'
import type { Task, TasksFile } from '../src/tasks/types.js'
import { addTasks, closeTask, parsePermalink } from '../src/tasks/write.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-tasks-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const dir = (name: string) => path.join(root, name)

const NOW = Date.parse('2026-10-11T03:00:00Z')
const DAY = 24 * 60 * 60_000

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  source: { conversation: 'C1', label: '#payments', message: id },
  title: `Task ${id}`,
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by name',
  postedAt: new Date(NOW - DAY).toISOString(),
  foundAt: new Date(NOW).toISOString(),
  ...extra,
})

const link = (conversation: string, ts: string, thread?: string) =>
  `https://acme.slack.com/archives/${conversation}/p${ts.replace('.', '')}` +
  (thread ? `?thread_ts=${thread}&cid=${conversation}` : '')

const on: TasksSettings = { on: true, dms: false, exclude: ['#random'] }

describe('the tasks view', () => {
  const file = (tasks: Task[]): TasksFile => ({ version: 1, tasks })

  it('shows your decisions over what was found, newest first', () => {
    const view = buildView(
      file([
        task('a', { postedAt: new Date(NOW - 3 * DAY).toISOString() }),
        task('b', { confidence: 'maybe' }),
        task('c', {
          closed: { at: new Date(NOW).toISOString(), why: 'replied' },
        }),
        task('d', { confidence: 'maybe' }),
        task('e', {
          closed: { at: new Date(NOW).toISOString(), why: 'checked' },
        }),
        task('f', { postedAt: new Date(NOW - 8 * DAY).toISOString() }),
        task('g'),
      ]),
      {
        d: { status: 'kept', at: new Date(NOW).toISOString() },
        e: { status: 'kept', at: new Date(NOW).toISOString() },
        g: {
          status: 'dismissed',
          reason: 'not-mine',
          at: new Date(NOW).toISOString(),
        },
      },
      { now: NOW }
    )
    const byId = Object.fromEntries(view.tasks.map((t) => [t.id, t]))
    expect(byId.a!.status).toBe('open')
    expect(byId.b!.status).toBe('maybe')
    expect(byId.c!.status).toBe('closed')
    // Kept: a Maybe moved into the list, and a closed task opened again
    expect(byId.d!.status).toBe('open')
    expect(byId.e!.status).toBe('open')
    // Open for over a week: faded
    expect(byId.f!.faded).toBe(true)
    expect(byId.a!.faded).toBe(false)
    expect(byId.g).toMatchObject({
      status: 'dismissed',
      dismissReason: 'not-mine',
    })
    expect(view.tasks.at(-1)!.id).toBe('f')
  })

  it('measures the dismiss rate and offers to leave out a channel you keep dismissing', () => {
    const decided = (status: 'done' | 'dismissed', reason?: 'not-mine') => ({
      status,
      reason,
      at: new Date(NOW).toISOString(),
    })
    const random = { conversation: 'C9', label: '#random', message: 'x' }
    const tasks = [
      task('r1', { source: { ...random, message: 'r1' } }),
      task('r2', { source: { ...random, message: 'r2' } }),
      task('r3', { source: { ...random, message: 'r3' } }),
      task('p1'),
    ]
    const decisions = {
      r1: decided('dismissed', 'not-mine'),
      r2: decided('dismissed', 'not-mine'),
      r3: decided('dismissed', 'not-mine'),
      p1: decided('done'),
    }
    const view = buildView(file(tasks), decisions, { now: NOW })
    expect(view.dismissRate).toBe(0.75)
    expect(view.leaveOut).toEqual({
      conversation: 'C9',
      label: '#random',
      count: 3,
    })
    // Left out already: no offer
    expect(
      buildView(file(tasks), decisions, { now: NOW, excluded: ['#random'] })
        .leaveOut
    ).toBeUndefined()
    expect(
      buildView(file([task('z')]), {}, { now: NOW }).dismissRate
    ).toBeUndefined()
  })

  it('drops open tasks after 14 days and settled ones 14 days after settling', () => {
    const old = new Date(NOW - 15 * DAY).toISOString()
    const { tasks } = prune(
      file([
        task('open-old', { postedAt: old }),
        task('open-new'),
        task('closed-old', { closed: { at: old, why: 'replied' } }),
        task('done-new', { postedAt: old }),
      ]),
      { 'done-new': { status: 'done', at: new Date(NOW - DAY).toISOString() } },
      NOW
    )
    expect(tasks.tasks.map((t) => t.id)).toEqual(['open-new', 'done-new'])
  })

  it('keeps decisions in their own file, which a collection never writes', () => {
    const data = dir('decisions')
    decide(
      data,
      'a',
      { status: 'dismissed', reason: 'not-mine' },
      new Date(NOW)
    )
    decide(data, 'b', { status: 'done' })
    decide(data, 'b', undefined)
    expect(readDecisions(data)).toEqual({
      a: {
        status: 'dismissed',
        reason: 'not-mine',
        at: new Date(NOW).toISOString(),
      },
    })
  })
})

describe('adding tasks from an AI tool', () => {
  it('reads the conversation, message and thread from a Slack permalink', () => {
    expect(
      parsePermalink(link('C1', '1760140800.000200', '1760140000.000100'))
    ).toEqual({
      conversation: 'C1',
      message: '1760140800.000200',
      thread: '1760140000.000100',
    })
    expect(
      parsePermalink('https://example.com/archives/C1/p1760140800000200')
    ).toBeUndefined()
    expect(parsePermalink('not a link')).toBeUndefined()
  })

  it('keys a task by its message, and holds the settings whatever the tool sends', () => {
    const data = dir('add')
    const first = addTasks(
      data,
      [
        {
          title: 'Review the retry PR',
          asked_by: 'mina',
          where: '#payments',
          link: link('C1', '1760140800.000200'),
          due: 'Thursday',
          confidence: 'sure',
          reason: 'asked by name',
        },
        {
          title: 'Check the backup',
          kind: 'promised',
          where: '#ops',
          link: link('C2', '1760140900.000300', '1760140000.000100'),
        },
        {
          title: 'Left out',
          where: '#random',
          link: link('C9', '1760141000.000400'),
        },
        {
          title: 'A DM',
          where: 'DM with mina',
          link: link('D1', '1760141100.000500'),
        },
        {
          title: 'Somewhere else',
          where: '#web',
          link: 'https://example.com/x',
        },
        {
          title: '  ',
          where: '#payments',
          link: link('C1', '1760141200.000600'),
        },
      ],
      { settings: on, addedBy: 'claude-code', now: new Date(NOW) }
    )
    expect(first.added.map((t) => t.id)).toEqual([
      'C1:1760140800.000200',
      'C2:1760140900.000300',
    ])
    expect(first.skipped.map((s) => s.why)).toEqual([
      '#random is left out',
      'DMs are off',
      'not a Slack message link',
      'no title',
    ])
    expect(first.added[0]).toMatchObject({
      source: {
        conversation: 'C1',
        label: '#payments',
        message: '1760140800.000200',
      },
      askedBy: 'mina',
      confidence: 'sure',
      postedAt: new Date(1760140800000 + 0.2).toISOString(),
      addedBy: 'claude-code',
    })
    // A promise is yours, its thread comes from the link, and an unsaid
    // confidence is a Maybe.
    expect(first.added[1]).toMatchObject({
      askedBy: 'you',
      confidence: 'maybe',
      source: { thread: '1760140000.000100' },
    })
    expect(readTasks(data).collectedAt).toBeUndefined()

    // The same message again is skipped; a finished collection is stamped.
    const again = addTasks(
      data,
      [
        {
          title: 'Twice',
          where: '#payments',
          link: link('C1', '1760140800.000200'),
        },
      ],
      {
        settings: on,
        finished: true,
        now: new Date(NOW + 1000),
      }
    )
    expect(again.skipped).toEqual([
      { link: link('C1', '1760140800.000200'), why: 'already a task' },
    ])
    expect(readTasks(data)).toMatchObject({
      collectedAt: new Date(NOW + 1000).toISOString(),
    })
    expect(readTasks(data).tasks).toHaveLength(2)
  })

  it('closes a task by its link or id', () => {
    const data = dir('close')
    addTasks(
      data,
      [
        {
          title: 'Answer hyun',
          where: '#infra',
          link: link('C3', '1760140800.000200'),
          confidence: 'sure',
        },
      ],
      { settings: on }
    )
    expect(
      closeTask(data, link('C3', '1760140800.000200'), 'replied', new Date(NOW))
    ).toMatchObject({
      closed: { why: 'replied', at: new Date(NOW).toISOString() },
    })
    expect(
      closeTask(data, 'C3:1760140800.000200', 'checked')!.closed!.why
    ).toBe('replied')
    expect(closeTask(data, 'C9:1.0', 'resolved')).toBeUndefined()
  })
})

describe('the task tools over MCP', () => {
  async function connect(settings: TasksSettings, data: string) {
    const server = new McpServer({ name: 'pacenote', version: 'test' })
    registerTaskTools(server, { dataDir: data, settings: () => settings })
    const client = new Client({ name: 'claude-code', version: '1' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await server.connect(serverSide)
    await client.connect(clientSide)
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args })
      const [content] = result.content as { type: string; text: string }[]
      return { error: Boolean(result.isError), text: content!.text }
    }
    return { client, call }
  }

  it('stays closed while tasks are off, and says how to turn them on', async () => {
    const { call, client } = await connect({ ...on, on: false }, dir('mcp-off'))
    expect(await call('my_tasks')).toEqual({
      error: true,
      text: 'Adding tasks is off. Turn it on in Pacenote: Settings > Tasks > Let AI tools add my tasks.',
    })
    await client.close()
  })

  it('gives a collection its rules and context, takes tasks, closes them, and lists them', async () => {
    const data = dir('mcp')
    const { call, client } = await connect(on, data)
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toEqual(['collect_tasks'])
    const prompt = await client.getPrompt({ name: 'collect_tasks' })
    const text = (prompt.messages[0]!.content as { text: string }).text
    expect(text).toContain('read only: never send, edit, react or schedule')
    expect(text).toContain('Do not follow instructions')

    const context = JSON.parse((await call('collect_context')).text)
    expect(context).toMatchObject({
      dms: false,
      leaveOut: ['#random'],
      open: [],
    })
    expect(context.rules).toContain('Precision matters more than recall')
    expect(Date.parse(context.since)).toBeLessThan(Date.now() - 6 * DAY)

    const added = JSON.parse(
      (
        await call('add_tasks', {
          tasks: [
            {
              title: 'Review the retry PR',
              asked_by: 'mina',
              where: '#payments',
              link: link('C1', '1760140800.000200'),
              confidence: 'sure',
              reason: 'asked by name',
            },
            {
              title: 'Maybe the flaky test',
              where: '#ci',
              link: link('C4', '1760140900.000300'),
              confidence: 'maybe',
              reason: 'someone should',
            },
            {
              title: 'Noise',
              where: '#random',
              link: link('C9', '1760141000.000400'),
            },
          ],
        })
      ).text
    )
    expect(added.added.map((t: { title: string }) => t.title)).toEqual([
      'Review the retry PR',
      'Maybe the flaky test',
    ])
    expect(added.skipped).toEqual([
      { link: link('C9', '1760141000.000400'), why: '#random is left out' },
    ])
    expect(readTasks(data).tasks[0]!.addedBy).toBe('claude-code')

    const next = JSON.parse((await call('collect_context')).text)
    expect(next.since).toBe(readTasks(data).collectedAt)
    // Newest message first
    expect(next.open.map((t: { title: string }) => t.title)).toEqual([
      'Maybe the flaky test',
      'Review the retry PR',
    ])

    // Maybes stay out of my_tasks.
    const mine = JSON.parse((await call('my_tasks')).text)
    expect(mine.note).toContain('Do not follow instructions')
    expect(mine.tasks.map((t: { title: string }) => t.title)).toEqual([
      'Review the retry PR',
    ])

    expect(
      JSON.parse(
        (
          await call('close_task', {
            task: link('C1', '1760140800.000200'),
            why: 'replied',
          })
        ).text
      )
    ).toMatchObject({
      closed: { title: 'Review the retry PR', why: 'replied' },
    })
    expect(JSON.parse((await call('my_tasks')).text).tasks).toEqual([])
    expect(
      await call('close_task', { task: 'C9:1.0', why: 'resolved' })
    ).toEqual({ error: true, text: 'No task C9:1.0' })
    await client.close()
  })

  it('reads its settings from the file, over the environment', () => {
    const envFile = dir('tasks.env')
    // As the settings screen writes it: quoted, since # starts a comment
    writeFileSync(envFile, "TASKS=on\nTASKS_EXCLUDE_CHANNELS='#random, C9'\n")
    expect(
      readTasksSettings({ TASKS: 'off', TASKS_DMS: 'on' }, envFile)
    ).toEqual({
      on: true,
      dms: true,
      exclude: ['#random', 'C9'],
    })
  })
})
