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
import { DeviceAnswers } from '../apps/desktop/src/device-answers.js'
import type { OpenClaude } from '../apps/desktop/src/open-sessions.js'
import type { Desktop } from '../apps/desktop/src/ipc/context.js'
import type { Ipc, Run } from '../apps/desktop/src/ipc/gate.js'
import { SessionHost } from '../apps/desktop/src/session-host.js'
import type { HistoryReader } from '../src/history/reader.js'
import { DEVICE_ASKS } from '../src/macs/asks.js'
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

let pids = 90_000
/** Claude Code as the host runs it: what it was started with and sent */
class FakeClaude extends EventEmitter {
  readonly pid = ++pids
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
/** The sessions open on the Mac, as Claude Code lists them */
let open: OpenClaude[] = []
/** The processes ended, by pid */
const ended: number[] = []
/** Where each ended process ran, in the same order */
const endedIn: string[] = []
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
/** And as your devices ask for them (DeviceAnswers), the ones they may */
const logged: string[] = []
const devices = new DeviceAnswers({
  reader: {} as HistoryReader,
  peerName: () => 'iPhone',
  log: (line) => logged.push(line),
})
const windowOnly = new Set<string>()
const ipc = {
  windowOnly: (channel: string, _denied: unknown, run: Run) => {
    windowOnly.add(channel)
    channels.set(channel, run)
  },
  handleDenying: (channel: string, _denied: unknown, run: Run) => {
    devices.bridge(channel, run)
    channels.set(channel, run)
  },
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
    openSessions: {
      list: async () => open,
      end: async (pid: number, where: string) => {
        ended.push(pid)
        endedIn.push(where)
        open = open.filter((agent) => agent.pid !== pid)
        return true
      },
    },
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
  open = []
  ended.length = 0
  endedIn.length = 0
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

describe('a session from your phone', () => {
  it('answers the sessions asks a device may make, and opens none on the Mac', () => {
    const asked = Object.entries(DEVICE_ASKS)
      .filter(([what]) => what.startsWith('sessions.'))
      .map(([, channel]) => channel)
    expect(asked.length).toBeGreaterThan(5)
    for (const channel of asked) {
      expect(channels.has(channel)).toBe(true)
      expect(windowOnly.has(channel)).toBe(false)
    }
    // Where it runs, a terminal or an app on the Mac, is the window's
    expect(windowOnly.has('pacenote:sessions:open')).toBe(true)
    expect(Object.hasOwn(DEVICE_ASKS, 'sessions.open')).toBe(false)
  })

  it('starts one in a folder of your work, and talks to it, as the Mac does', async () => {
    const before = procs.length
    // Not anywhere on the Mac: a folder of your work, as on the Mac
    await expect(
      devices.answer(
        'sessions.start',
        [{ folder: path.join(home, 'gone'), message: 'Look' }],
        'phone-1'
      )
    ).resolves.toMatchObject({ error: expect.stringMatching(/folder/) })
    const started = (await devices.answer(
      'sessions.start',
      [{ folder, message: 'Look at the retry from my phone' }],
      'phone-1'
    )) as { id: string }
    expect(started.id).toMatch(/^claude:/)
    expect(procs).toHaveLength(before + 1)
    const proc = procs.at(-1)!
    expect(proc.cwd).toBe(folder)
    expect(JSON.parse(proc.written.trim()).message.content).toBe(
      'Look at the retry from my phone'
    )
    // Its page, and what you type next, from the phone
    const talk = (await devices.answer(
      'sessions.talk',
      [started.id],
      'phone-1'
    )) as SessionTalk
    expect(talk.row.where).toBe('pacenote')
    expect(talk.typeIn).toBe('here')
    // A change goes in the log, by the device's name; what it reads does not
    expect(logged).toContain('iPhone asked: sessions.start')
    expect(logged.some((line) => line.includes('sessions.talk'))).toBe(false)
  })
})

describe('one conversation, typed into in one place at a time', () => {
  const resting = (session: string, more: Partial<OpenClaude> = {}) => ({
    session,
    cwd: folder,
    busy: false,
    where: 'terminal' as const,
    terminal: 'iTerm',
    pid: 4242,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    ...more,
  })
  const talk = async (id: string) =>
    (await call('pacenote:sessions:talk', id)) as unknown as SessionTalk

  it('moves a session resting in a terminal or the Claude app here as you send', async () => {
    open = [resting('rest-1')]
    expect((await talk('claude:rest-1')).typeIn).toBe('move')
    open = [resting('rest-1', { where: 'claude-app', terminal: undefined })]
    expect((await talk('claude:rest-1')).typeIn).toBe('move')
    const before = procs.length
    await expect(
      call('pacenote:sessions:send', 'claude:rest-1', 'Pick it up here')
    ).resolves.toEqual({})
    // Its process there ended first, then the same session resumed here
    expect(ended).toEqual([4242])
    expect(endedIn).toEqual(['claude-app'])
    expect(procs).toHaveLength(before + 1)
    const proc = procs.at(-1)!
    expect(proc.args.slice(0, 3)).toEqual(['-p', '--resume', 'rest-1'])
    expect(proc.args).not.toContain('--fork-session')
    expect(JSON.parse(proc.written.trim()).message.content).toBe(
      'Pick it up here'
    )
    // Its page says it runs here now, before the list is read again
    expect((await talk('claude:rest-1')).row.where).toBe('pacenote')
    host.end('rest-1')
  })

  it('waits while it works there, and leaves claude.ai its own', async () => {
    open = [resting('busy-1', { busy: true })]
    expect((await talk('claude:busy-1')).typeIn).toBe('elsewhere')
    await expect(
      call('pacenote:sessions:send', 'claude:busy-1', 'Now')
    ).resolves.toMatchObject({ error: expect.any(String) })
    open = [resting('web-1', { where: 'web', terminal: undefined })]
    expect((await talk('claude:web-1')).typeIn).toBe('elsewhere')
    expect(ended).toEqual([])
  })

  it('leaves one with work in the background where it is, which moving would stop', async () => {
    open = [
      resting('bg-1', {
        where: 'claude-app',
        terminal: undefined,
        background: 1,
      }),
    ]
    const page = await talk('claude:bg-1')
    expect(page.typeIn).toBe('elsewhere')
    expect(page.row.background).toBe(1)
    await expect(
      call('pacenote:sessions:send', 'claude:bg-1', 'Now')
    ).resolves.toMatchObject({ error: expect.stringMatching(/background/) })
    expect(ended).toEqual([])
  })

  it('lets go of a session it runs once another place opens it', async () => {
    const { id } = (await call('pacenote:sessions:start', {
      folder,
      message: 'Start here',
    })) as { id: string }
    const session = id.slice('claude:'.length)
    const proc = procs.at(-1)!
    proc.stdout.write(
      `${JSON.stringify({ type: 'result', is_error: false })}\n`
    )
    await new Promise((resolve) => setImmediate(resolve))
    expect(host.has(session)).toBe(true)
    const view = () => call('pacenote:sessions:view')
    // Opened in a terminal before Pacenote ran it: Pacenote keeps it
    open = [resting(session, { pid: 5151 })]
    await view()
    expect((await talk(id)).typeIn).toBe('here')
    expect(host.has(session)).toBe(true)
    // Opened there since: Pacenote lets go, and you type there or move it back
    const since = new Date(Date.now() + 1000).toISOString()
    open = [resting(session, { pid: 5151, startedAt: since })]
    await view()
    expect((await talk(id)).typeIn).toBe('move')
    expect(host.has(session)).toBe(false)
  })

  it('takes the process it let go for none open elsewhere while it quits', async () => {
    const { id } = (await call('pacenote:sessions:start', {
      folder,
      message: 'Start here',
    })) as { id: string }
    const session = id.slice('claude:'.length)
    const proc = procs.at(-1)!
    proc.stdout.write(
      `${JSON.stringify({ type: 'result', is_error: false })}\n`
    )
    await new Promise((resolve) => setImmediate(resolve))
    // Claude Code lists the process Pacenote runs it in, under Pacenote
    const ours = resting(session, { pid: proc.pid, terminal: 'Pacenote' })
    open = [ours]
    await call('pacenote:sessions:view')
    expect((await talk(id)).row.where).toBe('pacenote')
    // The Claude app takes it up again: Pacenote lets go, and its process
    // stays on the list as it quits
    const app = resting(session, {
      pid: 7171,
      where: 'claude-app',
      terminal: undefined,
      startedAt: new Date(Date.now() + 1000).toISOString(),
    })
    open = [ours, app]
    await call('pacenote:sessions:view')
    expect(host.has(session)).toBe(false)
    await call('pacenote:sessions:view')
    const back = await talk(id)
    expect(back.row.where).toBe('claude-app')
    expect(back.typeIn).toBe('move')
    // Moved here again, only the app's process ends
    ended.length = 0
    await expect(
      call('pacenote:sessions:send', id, 'Back here')
    ).resolves.toEqual({})
    expect(ended).toEqual([7171])
    host.end(session)
  })

  it('moves one it runs here again as you send, when it was opened there too', async () => {
    const { id } = (await call('pacenote:sessions:start', {
      folder,
      message: 'Start here',
    })) as { id: string }
    const session = id.slice('claude:'.length)
    const proc = procs.at(-1)!
    // Opened in a terminal while Pacenote ran it, before the list said so
    open = [resting(session, { pid: 6161 })]
    await expect(
      call('pacenote:sessions:send', id, 'And one more')
    ).resolves.toEqual({})
    expect(ended).toEqual([6161])
    expect(procs.at(-1)).toBe(proc)
    expect(proc.written).toContain('And one more')
    host.end(session)
  })
})
