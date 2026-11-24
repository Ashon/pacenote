import { EventEmitter } from 'node:events'
import {
  chmodSync,
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
import { CodexHost } from '../apps/desktop/src/codex-host.js'
import { DeviceAnswers } from '../apps/desktop/src/device-answers.js'
import type { OpenClaude } from '../apps/desktop/src/open-sessions.js'
import type { Desktop } from '../apps/desktop/src/ipc/context.js'
import type { Ipc, Run } from '../apps/desktop/src/ipc/gate.js'
import { SessionHost } from '../apps/desktop/src/session-host.js'
import type { HistoryReader } from '../src/history/reader.js'
import { DEVICE_ASKS } from '../src/macs/asks.js'
import { readClosed } from '../src/sessions/closed.js'
import type { SessionTalk, SessionWrapDraft } from '../src/sessions/types.js'
import { allTaskViews } from '../src/tasks/store.js'
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

/** codex app-server as the Codex host runs it: what it was asked */
class FakeCodex extends EventEmitter {
  readonly pid = ++pids
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  asked: { method: string; params?: Record<string, unknown> }[] = []
  readonly thread = `019d${pids}-0000-7000-8000-codexthread`
  constructor(
    readonly args: string[],
    readonly cwd: string
  ) {
    super()
    let rest = ''
    this.stdin.on('data', (chunk: Buffer) => {
      const lines = (rest + String(chunk)).split('\n')
      rest = lines.pop() ?? ''
      for (const line of lines.filter(Boolean)) {
        const message = JSON.parse(line) as {
          id?: number
          method: string
          params?: Record<string, unknown>
        }
        this.asked.push(message)
        if (message.id === undefined) continue
        const result =
          message.method === 'thread/start' ||
          message.method === 'thread/resume'
            ? { thread: { id: this.thread }, model: 'gpt-6-luna' }
            : message.method === 'turn/start'
              ? { turn: { id: 'turn-1' } }
              : {}
        this.stdout.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`
        )
      }
    })
  }
  kill() {
    this.emit('exit', null)
    return true
  }
}
const codexProcs: FakeCodex[] = []
const codex = new CodexHost({
  bin: () => 'codex',
  env: () => ({}),
  version: '0.6.43',
  warn: () => {},
  onChange: () => {},
  spawn: (_bin, args, cwd) => {
    const proc = new FakeCodex(args, cwd)
    codexProcs.push(proc)
    return proc
  },
})
afterAll(() => codex.endAll())
/** codex as Pacenote checks it: new enough, signed in, or not */
const codexBin = path.join(home, 'bin', 'codex')
mkdirSync(path.dirname(codexBin), { recursive: true })
const fakeCodexBin = (version: string, login = 'Logged in using ChatGPT') => {
  writeFileSync(
    codexBin,
    `#!/bin/sh\ncase "$1" in\n  --version) echo "codex-cli ${version}" ;;\n  login) echo "${login}" ;;\nesac\n`
  )
  chmodSync(codexBin, 0o755)
}
fakeCodexBin('0.163.0')

/** What your AI was asked to wrap up, and what it answers */
const judged: { task: string; items: number; branch?: string }[] = []
let judgement: SessionWrapDraft = {
  done: true,
  summary: 'Raised the retry limit to 5 and fixed the test.',
  left: ['Tell hyun it is fixed', 'Watch the retries for a day'],
  by: 'Claude Code',
}

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
    cliBins: () => ({ claude: 'claude', codex: codexBin }),
    log: { warn: () => {}, info: () => {} },
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
      judgeNow: async (
        judgedTask: { id: string },
        items: unknown[],
        branch?: string
      ) => {
        judged.push({ task: judgedTask.id, items: items.length, branch })
        return judgement
      },
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
    codex,
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

  it("starts a task's session with Codex, in the mode you picked, and talks to it here", async () => {
    expect(await call('pacenote:sessions:tools')).toEqual({
      codex: { ready: true },
    })
    // A Codex mode is Codex's; Claude Code's is not
    expect((await start({ tool: 'codex', mode: 'plan' })).error).toBeTruthy()
    expect((await start({ tool: 'gemini' })).error).toBeTruthy()
    const started = await start({
      tool: 'codex',
      task: task!.id,
      mode: 'read-only',
      message: 'You are taking over a task from Pacenote',
    })
    expect(started.error).toBeUndefined()
    const proc = codexProcs.at(-1)!
    expect(started.id).toBe(`codex:${proc.thread}`)
    expect(proc.args).toEqual(['app-server'])
    expect(proc.cwd).toBe(folder)
    expect(
      proc.asked.find((each) => each.method === 'thread/start')!.params
    ).toMatchObject({ cwd: folder, sandbox: 'read-only' })
    expect(
      proc.asked.find((each) => each.method === 'thread/name/set')!.params
    ).toMatchObject({ name: 'Fix the flaky webhook retry test' })
    expect(
      readWork(dataDir).entries.find(
        (entry) => entry.kind === 'session' && entry.session === proc.thread
      )
    ).toMatchObject({ task: task!.id, tool: 'codex', cwd: folder })

    // Its page before Codex wrote its log: here, as it goes
    const talk = (await call(
      'pacenote:sessions:talk',
      started.id
    )) as unknown as SessionTalk
    expect(talk.row).toMatchObject({ tool: 'codex', where: 'pacenote' })
    expect(talk.typeIn).toBe('here')
    expect(talk.live).toMatchObject({ busy: true, mode: 'read-only' })
    expect(talk.error).toBeUndefined()

    // What you type next, and how it asks from its next turn
    expect(await call('pacenote:sessions:mode', started.id, 'plan')).toEqual({
      error: expect.any(String),
    })
    expect(
      await call('pacenote:sessions:mode', started.id, 'full-access')
    ).toEqual({})
    expect(
      await call('pacenote:sessions:send', started.id, 'Use fake timers')
    ).toEqual({})
    expect(
      proc.asked.filter((each) => each.method === 'turn/steer')
    ).toHaveLength(1)
    expect(await call('pacenote:sessions:stop', started.id)).toEqual({})
    expect(await call('pacenote:sessions:end', started.id)).toEqual({})
    expect(codex.has(proc.thread)).toBe(false)
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

  it('sends the images you attached, refuses others, and gives each back from its log', async () => {
    open = [resting('img-1')]
    const shot = { mediaType: 'image/png', data: 'QUJD' }
    await expect(
      call('pacenote:sessions:send', 'claude:img-1', {
        text: 'Why is this red?',
        images: [shot],
      })
    ).resolves.toEqual({})
    expect(JSON.parse(procs.at(-1)!.written.trim()).message.content).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
      },
      { type: 'text', text: 'Why is this red?' },
    ])
    // Images alone go too; another kind does not, nor nothing at all
    await expect(
      call('pacenote:sessions:send', 'claude:img-1', { images: [shot] })
    ).resolves.toEqual({})
    await expect(
      call('pacenote:sessions:send', 'claude:img-1', {
        text: 'x',
        images: [{ ...shot, mediaType: 'image/heic' }],
      })
    ).resolves.toEqual({ error: expect.stringContaining('PNG') })
    await expect(
      call('pacenote:sessions:send', 'claude:img-1', { text: ' ' })
    ).resolves.toEqual({ error: expect.any(String) })
    // Its page reads the image from Claude Code's log
    const project = path.join(home, '.claude', 'projects', 'payments')
    mkdirSync(project, { recursive: true })
    writeFileSync(
      path.join(project, 'img-1.jsonl'),
      `${JSON.stringify({
        type: 'user',
        uuid: 'line-1',
        sessionId: 'img-1',
        cwd: folder,
        message: {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
            },
            { type: 'text', text: 'Why is this red?' },
          ],
        },
      })}\n`
    )
    expect((await talk('claude:img-1')).items).toMatchObject([
      { role: 'user', images: 1, ref: 'line-1' },
    ])
    await expect(
      call('pacenote:sessions:image', 'claude:img-1', 'line-1', 0)
    ).resolves.toBe('data:image/png;base64,QUJD')
    await expect(
      call('pacenote:sessions:image', 'claude:img-1', 'line-1', 1)
    ).resolves.toBeNull()
    await expect(
      call('pacenote:sessions:image', 'claude:img-1', 'line-1', '0')
    ).resolves.toBeNull()
    host.end('img-1')
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

describe('closing a session, and wrapping up its task', () => {
  /** A task of its own, and a session Pacenote runs for it, with a log */
  const started = async (title: string) => {
    const [own] = addTasks(
      dataDir,
      [
        {
          title,
          asked_by: 'hyun',
          where: '#payments',
          link: `https://acme.slack.com/archives/C1/p17600000${Date.now() % 100_000_000}`,
          confidence: 'sure',
          action: 'code',
          repo: 'Ashon/payments',
        },
      ],
      { settings: { on: true, dms: false, exclude: [] } }
    ).added
    const { id } = (await call('pacenote:sessions:start', {
      folder,
      task: own!.id,
      message: 'You are taking over a task from Pacenote',
    })) as { id: string }
    const session = id.slice('claude:'.length)
    const project = path.join(home, '.claude', 'projects', 'payments')
    mkdirSync(project, { recursive: true })
    writeFileSync(
      path.join(project, `${session}.jsonl`),
      [
        {
          type: 'user',
          sessionId: session,
          cwd: folder,
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: 'Fix the retry' },
        },
        {
          type: 'assistant',
          sessionId: session,
          cwd: folder,
          timestamp: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Raised the limit to 5.' }],
          },
        },
      ]
        .map((line) => JSON.stringify(line))
        .join('\n')
    )
    return { id, session, task: own! }
  }

  it('closes one it runs: its run ends, and it is kept as closed', async () => {
    const { id, session } = await started('Close the retry session')
    expect(host.has(session)).toBe(true)
    expect(await call('pacenote:sessions:close', id)).toEqual({})
    expect(host.has(session)).toBe(false)
    expect(readClosed(dataDir).get(id)).toEqual(expect.any(String))
    expect(await call('pacenote:sessions:close', 'claude:gone')).toEqual({
      error: expect.any(String),
    })
  })

  it('drafts how it ended from its log, then closes its task with what you kept', async () => {
    const { id, session, task: own } = await started('Wrap up the retry')
    judged.length = 0
    const draft = await call('pacenote:sessions:wrap-draft', id)
    expect(draft).toEqual(judgement)
    expect(judged).toEqual([{ task: own.id, items: 2, branch: undefined }])

    const before = allTaskViews(dataDir).length
    expect(
      await call('pacenote:sessions:wrap-up', id, {
        summary: 'Raised the retry limit to 5.',
        keep: ['Tell hyun it is fixed', '  '],
        close: true,
      })
    ).toEqual({ kept: 1 })
    const tasks = allTaskViews(dataDir)
    expect(tasks.find((each) => each.id === own.id)!.status).not.toBe('open')
    // The one thing left you kept, a task after it; the blank one not
    expect(tasks).toHaveLength(before + 1)
    expect(tasks.some((each) => each.title === 'Tell hyun it is fixed')).toBe(
      true
    )
    expect(host.has(session)).toBe(false)
    expect(readClosed(dataDir).has(id)).toBe(true)
  })

  it('keeps the session open when you say so, and says why your AI could not write it', async () => {
    const { id, session } = await started('Wrap up and keep it open')
    judgement = { error: 'Claude Code did not answer in 2 minutes.' }
    expect(await call('pacenote:sessions:wrap-draft', id)).toEqual({
      error: expect.stringMatching(/could not write/),
    })
    expect(
      await call('pacenote:sessions:wrap-up', id, {
        summary: '',
        keep: [],
        close: false,
      })
    ).toEqual({ kept: 0 })
    expect(host.has(session)).toBe(true)
    expect(readClosed(dataDir).has(id)).toBe(false)
    // Its task is closed now: nothing left to wrap up
    expect(await call('pacenote:sessions:wrap-draft', id)).toEqual({
      error: 'Its task is closed already.',
    })
    host.end(session)
  })

  it("wraps up no session that is not a task's work", async () => {
    const { id } = (await call('pacenote:sessions:start', {
      folder,
      message: 'Just looking',
    })) as { id: string }
    expect(await call('pacenote:sessions:wrap-draft', id)).toEqual({
      error: 'This session is not the work of a task.',
    })
    host.end(id.slice('claude:'.length))
  })
})
