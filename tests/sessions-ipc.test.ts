import { EventEmitter } from 'node:events'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Desktop } from '../apps/desktop/src/ipc/context.js'
import type { Ipc, Run } from '../apps/desktop/src/ipc/gate.js'
import { SessionHost } from '../apps/desktop/src/session-host.js'
import type { SessionTalk } from '../src/sessions/types.js'
import { readRepos } from '../src/tasks/folders.js'
import { readWork } from '../src/tasks/work.js'
import { addTasks } from '../src/tasks/write.js'

// A home of its own: Claude Code's logs and your folders are read from it
const home = realpathSync(mkdtempSync(path.join(tmpdir(), 'pacenote-home-')))
vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  homedir: () => home,
}))
afterAll(() => rmSync(home, { recursive: true, force: true }))

const { registerSessionsIpc } =
  await import('../apps/desktop/src/ipc/sessions.js')

/** Claude Code as the host runs it: what it was started with and sent */
class FakeClaude extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  written = ''
  constructor(
    readonly args: string[],
    readonly cwd: string
  ) {
    super()
    this.stdin.on('data', (chunk: Buffer) => (this.written += String(chunk)))
  }
  kill() {
    this.emit('exit', null)
    return true
  }
}

const dataDir = path.join(home, 'Library', 'Pacenote')
mkdirSync(dataDir, { recursive: true })
const folder = path.join(home, 'git', 'payments')
mkdirSync(folder, { recursive: true })

let env: NodeJS.ProcessEnv = {}
const procs: FakeClaude[] = []
const host = new SessionHost({
  bin: () => 'claude',
  env: () => ({}),
  warn: () => {},
  onChange: () => {},
  spawn: (_bin, args, cwd) => {
    const proc = new FakeClaude(args, cwd)
    procs.push(proc)
    return proc
  },
})
afterAll(() => host.endAll())

/** The channels as the window would call them */
const channels = new Map<string, Run>()
const ipc = {
  windowOnly: (channel: string, _denied: unknown, run: Run) =>
    channels.set(channel, run),
} as unknown as Ipc
registerSessionsIpc(
  ipc,
  {
    dataDir,
    settings: { effectiveEnv: () => env },
    toolPath: () => '',
    cliBins: () => ({ claude: 'claude' }),
    log: { warn: () => {} },
  } as unknown as Desktop,
  {
    sessions: {
      index: {
        refresh: async () => {},
        sessions: () => [],
        session: () => undefined,
      },
      repos: { all: async () => new Map() },
      linkSoon: () => {},
    },
    openSessions: { list: async () => [] },
    host,
    todo: { hasApp: () => false },
  } as unknown as Parameters<typeof registerSessionsIpc>[2]
)
const call = (channel: string, ...args: unknown[]) =>
  Promise.resolve(channels.get(channel)!(...args)) as Promise<
    Record<string, unknown>
  >

const [task] = addTasks(
  dataDir,
  [
    {
      title: 'Fix the flaky\n webhook retry test',
      asked_by: 'hyun',
      where: '#payments',
      link: 'https://acme.slack.com/archives/C1/p1760000000000200',
      confidence: 'sure',
      action: 'code',
      repo: 'Ashon/payments',
    },
  ],
  { settings: { on: true, dms: false, exclude: [] } }
).added

beforeEach(() => {
  env = { TASKS_LINK_SESSIONS: 'on' }
})

describe('starting a session Pacenote runs', () => {
  const start = (how: Record<string, unknown>) =>
    call('pacenote:sessions:start', {
      folder,
      message: 'Look at the retry',
      ...how,
    })

  it('says why it does not start: Sessions off, no folder, no message, no task', async () => {
    env = {}
    expect((await start({})).error).toMatch(/Sessions on this Mac/)
    env = { TASKS_LINK_SESSIONS: 'on' }
    expect((await start({ folder: 'git/payments' })).error).toMatch(/folder/)
    expect((await start({ folder: path.join(home, 'gone') })).error).toMatch(
      /folder/
    )
    // A temporary folder is not your work's
    const temporary = mkdtempSync(path.join(tmpdir(), 'pacenote-tmp-'))
    expect((await start({ folder: temporary })).error).toMatch(/temporary/)
    rmSync(temporary, { recursive: true })
    expect((await start({ message: '  ' })).error).toMatch(/Type something/)
    expect((await start({ mode: 'yolo' })).error).toBeTruthy()
    expect((await start({ task: 'slack:nope' })).error).toMatch(/no such task/)
    expect(procs).toEqual([])
  })

  it("starts a task's session: named after it, its work, its folder kept", async () => {
    const marker = '0b5c7a1e-2f3d-4e5f-8a9b-0c1d2e3f4a5b'
    const started = await start({
      task: task!.id,
      mode: 'plan',
      marker,
      message: 'You are taking over a task from Pacenote',
    })
    expect(started.error).toBeUndefined()
    const proc = procs.at(-1)!
    const session = proc.args[proc.args.indexOf('--session-id') + 1]!
    expect(started.id).toBe(`claude:${session}`)
    expect(proc.cwd).toBe(folder)
    expect(proc.args[proc.args.indexOf('--name') + 1]).toBe(
      'Fix the flaky webhook retry test'
    )
    expect(proc.args[proc.args.indexOf('--permission-mode') + 1]).toBe('plan')
    expect(JSON.parse(proc.written.trim())).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: 'You are taking over a task from Pacenote',
      },
    })
    // The task's work, by the marker in its first message
    expect(
      readWork(dataDir).entries.find((entry) => entry.id === marker)
    ).toMatchObject({
      kind: 'session',
      task: task!.id,
      tool: 'claude',
      session,
      cwd: folder,
    })
    expect(readRepos(dataDir)['Ashon/payments']).toBe(folder)

    // Its page: the task's, run here, its conversation from its log
    const project = path.join(home, '.claude', 'projects', 'payments')
    mkdirSync(project, { recursive: true })
    writeFileSync(
      path.join(project, `${session}.jsonl`),
      `${JSON.stringify({
        type: 'user',
        sessionId: session,
        cwd: folder,
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: 'Look at the retry' },
      })}\n`
    )
    const talk = (await call(
      'pacenote:sessions:talk',
      started.id
    )) as unknown as SessionTalk
    expect(talk.row).toMatchObject({
      title: 'Fix the flaky webhook retry test',
      where: 'pacenote',
      task: { id: task!.id },
    })
    expect(talk.typeIn).toBe('here')
    expect(talk.live).toMatchObject({ busy: true, mode: 'plan' })
    expect(talk.items).toMatchObject([
      { role: 'user', text: 'Look at the retry' },
    ])

    // A marker already used is not used twice
    await start({ task: task!.id, marker })
    expect(
      readWork(dataDir).entries.filter((entry) => entry.task === task!.id)
    ).toHaveLength(2)
  })

  it('starts one of no task: no work entry, no name', async () => {
    const before = readWork(dataDir).entries.length
    const started = await start({})
    expect(started.id).toMatch(/^claude:/)
    expect(procs.at(-1)!.args).not.toContain('--name')
    expect(procs.at(-1)!.args).not.toContain('--permission-mode')
    expect(readWork(dataDir).entries).toHaveLength(before)
  })
})
