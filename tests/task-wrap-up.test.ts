import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterAll, describe, expect, it } from 'vitest'
import { taskContext } from '../src/tasks/context.js'
import { collectPrompt, registerTaskTools } from '../src/tasks/mcp.js'
import type { TasksSettings } from '../src/tasks/settings.js'
import { allTaskViews, decide, readTasks } from '../src/tasks/store.js'
import {
  addTasks,
  closeTask,
  wrapUpTask,
  type NewTask,
} from '../src/tasks/write.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-task-wrap-up-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const dir = (name: string) => path.join(root, name)

// collect_context reads the clock, so these are from now
const NOW = Date.now()
const HOUR = 3600_000
const DAY = 24 * HOUR
const on: TasksSettings = { on: true, dms: false, exclude: [] }
const link = (conversation: string, at: number) =>
  `https://acme.slack.com/archives/${conversation}/p${(at / 1000).toFixed(6).replace('.', '')}`

function add(data: string, conversation: string, title: string) {
  const task: NewTask = {
    title,
    asked_by: 'mina',
    where: '#payments',
    link: link(conversation, NOW - 10 * DAY),
    confidence: 'sure',
    repo: 'Ashon/payments',
    summary: `mina asked: ${title}.`,
  }
  return addTasks(data, [task], { settings: on, now: new Date(NOW - 9 * DAY) })
    .added[0]!
}

describe('wrapping up a task', () => {
  it('writes how a task you did, or that closed, ended', () => {
    const data = dir('write')
    const done = add(data, 'C1', 'Review the retry PR')
    const closed = add(data, 'C2', 'Share the rollout plan')
    const open = add(data, 'C3', 'Look at the alert')
    const dismissed = add(data, 'C4', 'Join the offsite')
    decide(data, done.id, { status: 'done' })
    closeTask(data, closed.id, 'replied')
    decide(data, dismissed.id, { status: 'dismissed' })

    const result = wrapUpTask(
      data,
      done.source.permalink!,
      '  Merged after mina looked again; retries stop at five.  ',
      new Date(NOW),
      'claude-code'
    )
    expect(result).toEqual({ task: expect.anything() })
    expect(readTasks(data).tasks.find((t) => t.id === done.id)!.wrapUp).toEqual(
      {
        at: new Date(NOW).toISOString(),
        text: 'Merged after mina looked again; retries stop at five.',
        by: 'claude-code',
      }
    )
    expect(wrapUpTask(data, closed.id, 'ana took it as is.')).toEqual({
      task: expect.anything(),
    })

    // Open, dismissed or empty: left as it is
    expect(wrapUpTask(data, open.id, 'x')).toMatchObject({
      refused: 'it is open',
    })
    expect(wrapUpTask(data, dismissed.id, 'x')).toMatchObject({
      refused: 'it is dismissed',
    })
    expect(wrapUpTask(data, done.id, '  ')).toMatchObject({
      refused: 'the wrap-up is empty',
    })
    expect(wrapUpTask(data, 'C9:1.0', 'x')).toBeUndefined()
    expect(
      readTasks(data)
        .tasks.filter((t) => t.wrapUp)
        .map((t) => t.id)
        .sort()
    ).toEqual([done.id, closed.id].sort())
  })

  it('closes a task with how it ended, and gives it to the next task', () => {
    const data = dir('close')
    const earlier = add(data, 'C1', 'Review the retry config')
    closeTask(data, earlier.id, 'replied', new Date(NOW - DAY), {
      wrapUp: 'mina merged it; the backoff stays at 2s.',
    })
    const next = add(data, 'C2', 'Review the retry PR')
    const views = allTaskViews(data)
    const context = taskContext(
      views.find((t) => t.id === next.id)!,
      views,
      []
    )
    expect(context.repo?.tasks[0]).toMatchObject({
      id: earlier.id,
      outcome: 'You replied in the thread',
      wrapUp: 'mina merged it; the backoff stays at 2s.',
    })
  })
})

describe('wrap-ups over MCP', () => {
  async function connect(data: string) {
    const server = new McpServer({ name: 'pacenote', version: 'test' })
    registerTaskTools(server, { dataDir: data, settings: () => on })
    const client = new Client({ name: 'claude-code', version: '1' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await server.connect(serverSide)
    await client.connect(clientSide)
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args })
      const [content] = result.content as { type: string; text: string }[]
      return JSON.parse(content!.text)
    }
    return { client, call }
  }

  it('gives a collection the tasks done or closed lately to wrap up, five at a time', async () => {
    const data = dir('mcp')
    // Done or closed 1 to 7 hours ago: the five newest are given
    const settled = Array.from({ length: 7 }, (_, i) => {
      const task = add(data, `C${i + 1}`, `Task ${i + 1}`)
      const at = new Date(NOW - (i + 1) * HOUR)
      if (i === 1) closeTask(data, task.id, 'checked', at)
      else decide(data, task.id, { status: 'done' }, at)
      return task
    })
    const old = add(data, 'C20', 'Done last week')
    decide(data, old.id, { status: 'done' }, new Date(NOW - 8 * DAY))
    const dismissed = add(data, 'C21', 'Not mine')
    decide(data, dismissed.id, { status: 'dismissed' })
    add(data, 'C22', 'Still open')
    const wrapped = add(data, 'C23', 'Wrapped already')
    decide(data, wrapped.id, { status: 'done' })
    wrapUpTask(data, wrapped.id, 'Done.')

    const { call, client } = await connect(data)
    const context = await call('collect_context')
    expect(context.wrapUp.map((task: { id: string }) => task.id)).toEqual(
      settled.slice(0, 5).map((task) => task.id)
    )
    expect(context.wrapUp[1]).toMatchObject({
      title: 'Task 2',
      outcome: 'Marked with a check',
      summary: 'mina asked: Task 2.',
      link: settled[1]!.source.permalink,
    })
    expect(collectPrompt()).toContain('wrap_up_task')
    expect(collectPrompt()).toContain('give close_task a wrap_up too')

    expect(
      await call('wrap_up_task', {
        task: settled[0]!.source.permalink,
        wrap_up: 'mina merged it.',
      })
    ).toMatchObject({
      wrappedUp: {
        id: settled[0]!.id,
        title: 'Task 1',
        wrapUp: 'mina merged it.',
      },
    })
    expect(
      await call('wrap_up_task', { task: dismissed.id, wrap_up: 'x' })
    ).toMatchObject({ unchanged: { why: 'Left as it is: it is dismissed' } })
    // Wrapped up: not given again
    expect(
      (await call('collect_context')).wrapUp.map(
        (task: { id: string }) => task.id
      )
    ).not.toContain(settled[0]!.id)

    // Closing from the thread says how it ended at once.
    const open = add(data, 'C30', 'Answer ana')
    expect(
      await call('close_task', {
        task: open.id,
        why: 'replied',
        wrap_up: 'You answered; ana is unblocked.',
      })
    ).toMatchObject({
      closed: { id: open.id, wrapUp: 'You answered; ana is unblocked.' },
    })
    expect((await call('task_context', { task: open.id })).task).toMatchObject({
      wrapUp: 'You answered; ana is unblocked.',
    })
    await client.close()
  })
})
