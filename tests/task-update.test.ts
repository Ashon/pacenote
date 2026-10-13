import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterAll, describe, expect, it } from 'vitest'
import { collectPrompt, registerTaskTools } from '../src/tasks/mcp.js'
import type { TasksSettings } from '../src/tasks/settings.js'
import { decide, readTasks, tasksView } from '../src/tasks/store.js'
import {
  addTasks,
  closeTask,
  updateTask,
  type NewTask,
} from '../src/tasks/write.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-task-update-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const dir = (name: string) => path.join(root, name)

const NOW = Date.parse('2026-10-14T03:00:00Z')
const HOUR = 3600_000
const on: TasksSettings = { on: true, dms: false, exclude: [] }
const link = (conversation: string, at: number) =>
  `https://acme.slack.com/archives/${conversation}/p${(at / 1000).toFixed(6).replace('.', '')}`

function seed(data: string) {
  const add = (task: NewTask) =>
    addTasks(data, [task], { settings: on, now: new Date(NOW - 2 * HOUR) })
      .added[0]!
  const review = add({
    title: 'Review the payment retry PR',
    asked_by: 'mina',
    where: '#payments',
    link: link('C1', NOW - 3 * HOUR),
    confidence: 'sure',
    action: 'code',
    repo: 'Ashon/payments',
    summary: 'mina wants a review of PR #482 before Thursday.',
    due: 'Thursday',
  })
  // Collected before tasks had an action or a summary
  const older = add({
    title: 'Look at the flaky deploy check',
    asked_by: 'jun',
    where: '#deploys',
    link: link('C2', NOW - 5 * HOUR),
    confidence: 'sure',
  })
  const maybe = add({
    title: 'Someone should look at the backup alert',
    where: '#ops',
    link: link('C3', NOW - 4 * HOUR),
    confidence: 'maybe',
  })
  return { review, older, maybe }
}

describe('a task its thread changed', () => {
  it('keeps only what changed, with why and who changed it', () => {
    const data = dir('changed')
    const { review } = seed(data)
    const result = updateTask(
      data,
      review.source.permalink!,
      { due: 'Wednesday', title: 'Review the payment retry PR' },
      'mina moved it to Wednesday',
      new Date(NOW),
      'claude-code'
    )
    expect(result && 'changed' in result && result.changed).toEqual([
      { field: 'due', from: 'Thursday', to: 'Wednesday' },
    ])
    const task = readTasks(data).tasks.find((t) => t.id === review.id)!
    expect(task.due).toBe('Wednesday')
    expect(task.updates).toEqual([
      {
        at: new Date(NOW).toISOString(),
        why: 'mina moved it to Wednesday',
        by: 'claude-code',
        changed: [{ field: 'due', from: 'Thursday', to: 'Wednesday' }],
      },
    ])

    // Nothing that differs: nothing written
    expect(
      updateTask(data, review.id, { due: 'Wednesday' }, 'same', new Date(NOW))
    ).toMatchObject({ changed: [] })
    expect(
      readTasks(data).tasks.find((t) => t.id === review.id)!.updates
    ).toHaveLength(1)

    // null clears a due date; a repository that is not owner/name is ignored
    updateTask(data, review.id, { due: null, repo: 'not a repo' }, 'no rush')
    const cleared = readTasks(data).tasks.find((t) => t.id === review.id)!
    expect(cleared.due).toBeUndefined()
    expect(cleared.repo).toBe('Ashon/payments')
    expect(updateTask(data, 'C9:1.0', { due: 'x' }, 'none')).toBeUndefined()
  })

  it('fills in what an older task lacks', () => {
    const data = dir('filled')
    const { older } = seed(data)
    const result = updateTask(
      data,
      older.id,
      {
        action: 'code',
        repo: 'Ashon/deploys',
        summary: 'jun asked why the deploy check fails on main.',
      },
      'filled in'
    )
    expect(result && 'changed' in result && result.changed).toEqual([
      { field: 'summary', from: undefined, to: expect.any(String) },
      { field: 'action', from: undefined, to: 'code' },
      { field: 'repo', from: undefined, to: 'Ashon/deploys' },
    ])
  })

  it('makes a Maybe a task when the user is asked by name, unless you kept it', () => {
    const data = dir('maybe')
    const { maybe, review } = seed(data)
    updateTask(data, maybe.id, { confidence: 'sure' }, 'ana asked you by name')
    const views = tasksView(data, []).tasks
    expect(views.find((t) => t.id === maybe.id)!.status).toBe('open')

    // A Maybe you kept stays yours.
    decide(data, review.id, { status: 'kept' })
    expect(
      updateTask(data, review.id, { confidence: 'maybe' }, 'unclear now')
    ).toMatchObject({ changed: [] })
  })

  it('leaves a task you settled, or that closed, as it is', () => {
    const data = dir('settled')
    const { review, older } = seed(data)
    decide(data, review.id, { status: 'done' })
    expect(
      updateTask(data, review.id, { due: 'Friday' }, 'moved')
    ).toMatchObject({ refused: 'it is done' })
    closeTask(data, older.id, 'replied')
    expect(
      updateTask(data, older.id, { due: 'Friday' }, 'moved')
    ).toMatchObject({ refused: 'it is closed' })
    expect(readTasks(data).tasks.every((t) => !t.updates)).toBe(true)
  })
})

describe('update_task over MCP', () => {
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
      return { error: Boolean(result.isError), body: content!.text }
    }
    return { client, call }
  }

  it('gives a collection the open tasks as they are, to update or fill in', async () => {
    const data = dir('mcp')
    const { review, older } = seed(data)
    const { call, client } = await connect(data)

    const context = JSON.parse((await call('collect_context')).body)
    expect(context.open).toContainEqual({
      id: review.id,
      title: 'Review the payment retry PR',
      kind: 'asked',
      confidence: 'sure',
      due: 'Thursday',
      action: 'code',
      repo: 'Ashon/payments',
      summary: 'mina wants a review of PR #482 before Thursday.',
      link: review.source.permalink,
    })
    expect(collectPrompt()).toContain('update_task with only what changed')
    expect(collectPrompt()).toContain('fill them in with update_task')

    const updated = JSON.parse(
      (
        await call('update_task', {
          task: review.source.permalink,
          why: 'mina moved it to Wednesday',
          due: 'Wednesday',
        })
      ).body
    )
    expect(updated).toMatchObject({
      updated: {
        id: review.id,
        title: 'Review the payment retry PR',
        why: 'mina moved it to Wednesday',
        changed: ['due'],
      },
    })
    expect(
      readTasks(data).tasks.find((t) => t.id === review.id)!.updates![0]!.by
    ).toBe('claude-code')

    // A session working on it reads what changed.
    const task = JSON.parse(
      (await call('task_context', { task: review.id })).body
    ).task
    expect(task).toMatchObject({
      due: 'Wednesday',
      changes: [{ why: 'mina moved it to Wednesday', changed: ['due'] }],
    })

    decide(data, older.id, { status: 'dismissed' })
    expect(
      JSON.parse(
        (await call('update_task', { task: older.id, why: 'x', due: 'Fri' }))
          .body
      )
    ).toMatchObject({ unchanged: { why: 'Left as it is: it is dismissed' } })
    expect(
      (await call('update_task', { task: 'C9:1.0', why: 'x' })).error
    ).toBe(true)
    await client.close()
  })
})
