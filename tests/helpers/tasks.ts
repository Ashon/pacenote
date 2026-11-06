import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterAll } from 'vitest'
import { registerTaskTools } from '../../src/tasks/mcp.js'
import type { TasksSettings } from '../../src/tasks/settings.js'
import type { Task } from '../../src/tasks/types.js'

/**
 * What the task tests share (tasks-view, tasks-collect and tasks-session): a
 * pinned clock, a task and a Slack link to make, the settings with tasks on,
 * a data folder for each test, and an AI tool connected to the task tools.
 */

export const NOW = Date.parse('2026-10-11T03:00:00Z')
export const DAY = 24 * 60 * 60_000

export const task = (id: string, extra: Partial<Task> = {}): Task => ({
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

export const link = (conversation: string, ts: string, thread?: string) =>
  `https://acme.slack.com/archives/${conversation}/p${ts.replace('.', '')}` +
  (thread ? `?thread_ts=${thread}&cid=${conversation}` : '')

export const on: TasksSettings = { on: true, dms: false, exclude: ['#random'] }

/**
 * A folder for a test file's data, removed once its tests are done; what it
 * returns gives each test its own folder in it, by name
 */
export function dataDirs(): (name: string) => string {
  const root = mkdtempSync(path.join(tmpdir(), 'pacenote-tasks-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  return (name: string) => path.join(root, name)
}

/**
 * The task tools on a server with the clock pinned to NOW, and Claude Code
 * connected to them: call gives a tool's text and whether it is an error
 */
export async function connect(settings: TasksSettings, data: string) {
  const server = new McpServer({ name: 'pacenote', version: 'test' })
  registerTaskTools(server, {
    dataDir: data,
    settings: () => settings,
    now: () => NOW,
  })
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
