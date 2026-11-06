import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Desktop } from '../apps/desktop/src/ipc/context.js'
import type { Ipc, Run } from '../apps/desktop/src/ipc/gate.js'
import type { TaskView } from '../src/tasks/types.js'
import { addTasks } from '../src/tasks/write.js'

// The window's Electron side is not here: the handlers are called directly.
vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
}))
// A session is not opened for real: what it would open is recorded.
const opened = vi.hoisted(() => [] as { tool: string; folder: string }[])
vi.mock('../apps/desktop/src/handoff.js', async (original) => ({
  ...(await original<typeof import('../apps/desktop/src/handoff.js')>()),
  openSession: vi.fn(
    async (
      _options: unknown,
      task: TaskView,
      _context: string,
      tool: string,
      folder: string
    ) => {
      opened.push({ tool, folder })
      return {
        entry: {
          id: `work-${opened.length}`,
          kind: 'session',
          task: task.id,
          tool,
          folder,
          cwd: folder,
          startedAt: new Date().toISOString(),
        },
      }
    }
  ),
}))

const { registerTaskWorkIpc } =
  await import('../apps/desktop/src/ipc/task-work.js')

const dataDir = mkdtempSync(path.join(tmpdir(), 'pacenote-task-work-ipc-'))
afterAll(() => rmSync(dataDir, { recursive: true, force: true }))

/** The channels as the window would call them */
const channels = new Map<string, Run>()
const ipc = {
  handle: (channel: string, _denied: unknown, run: Run) =>
    channels.set(channel, run),
  handleDenying: (channel: string, _denied: unknown, run: Run) =>
    channels.set(channel, run),
  handleOrError: (channel: string, run: Run) => channels.set(channel, run),
} as unknown as Ipc

let cli = 'claude'
registerTaskWorkIpc(
  ipc,
  {
    dataDir,
    settings: { effectiveEnv: () => ({ TASKS_CLI: cli }) },
    reader: { inThread: () => [] },
    cliBins: () => ({}),
  } as unknown as Desktop,
  {
    todo: { hasApp: () => false },
    sessions: { linkSoon: () => {}, sessionNow: () => ({}) },
    opencodeSessions: {},
    macs: () => undefined,
    historyMcp: '/dev/null',
  } as unknown as Parameters<typeof registerTaskWorkIpc>[2]
)

const [task] = addTasks(
  dataDir,
  [
    {
      title: 'Look into the failing deploy',
      asked_by: 'mina',
      where: '#ops',
      link: 'https://acme.slack.com/archives/C1/p1760000000000100',
      confidence: 'sure',
    },
  ],
  { settings: { on: true, dms: false, exclude: [] } }
).added

const continueIn = (tool: unknown) =>
  channels.get('pacenote:tasks:continue')!(task!.id, {
    tool,
    folder: '/work/shop',
  })

beforeEach(() => {
  opened.length = 0
  cli = 'claude'
})

describe('continuing a task from the window', () => {
  it('opens the tool picked, opencode included', async () => {
    // Continue in opencode once opened Claude Code
    for (const tool of ['opencode', 'codex', 'claude']) await continueIn(tool)
    expect(opened.map((o) => o.tool)).toEqual(['opencode', 'codex', 'claude'])
    expect(opened[0]!.folder).toBe('/work/shop')
  })

  it('opens the CLI set for tasks when the window names none it knows', async () => {
    cli = 'codex'
    await continueIn(undefined)
    await continueIn('vim')
    expect(opened.map((o) => o.tool)).toEqual(['codex', 'codex'])
  })

  it('asks for a folder first, and says when there is no such task', async () => {
    const run = channels.get('pacenote:tasks:continue')!
    expect(await run(task!.id, { tool: 'claude' })).toHaveProperty('error')
    expect(
      await run('slack:nope', { tool: 'claude', folder: '/w' })
    ).toHaveProperty('error')
    expect(opened).toEqual([])
  })
})
