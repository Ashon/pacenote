import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  CodexHost,
  type CodexHostOptions,
} from '../apps/desktop/src/codex-host.js'
import type { SessionAsk } from '../src/sessions/types.js'

type Message = Record<string, unknown> & {
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { code?: number; message?: string }
}

let threads = 0
/**
 * codex app-server as the host sees it: JSON-RPC lines in and out. It
 * answers what Pacenote asks as Codex 0.163 does, and tells or asks what a
 * test has it say
 */
class FakeCodex extends EventEmitter {
  readonly pid = 4242
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  /** What Pacenote wrote to it, line by line */
  written: Message[] = []
  killed = false
  thread = `019d${String(++threads).padStart(4, '0')}-codex-thread`
  turns = 0
  /** Requests it answers with an error, by method */
  refuse = new Set<string>()
  constructor(
    readonly args: string[],
    readonly cwd: string
  ) {
    super()
    let rest = ''
    this.stdin.on('data', (chunk: Buffer) => {
      const lines = (rest + String(chunk)).split('\n')
      rest = lines.pop() ?? ''
      for (const line of lines) {
        if (!line) continue
        const message = JSON.parse(line) as Message
        this.written.push(message)
        if (message.method && message.id !== undefined) this.answer(message)
      }
    })
  }
  private answer(message: Message) {
    const { id, method, params = {} } = message
    if (this.refuse.has(method!))
      return this.say({ id, error: { code: -32600, message: 'no' } })
    switch (method) {
      case 'initialize':
        return this.say({ id, result: { userAgent: 'codex/0.163.0' } })
      case 'thread/start':
      case 'thread/resume': {
        if (method === 'thread/resume') this.thread = String(params.threadId)
        return this.say({
          id,
          result: {
            thread: {
              id: this.thread,
              path: `/home/.codex/sessions/rollout-${this.thread}.jsonl`,
            },
            model: 'gpt-6-luna',
          },
        })
      }
      case 'turn/start': {
        const turn = `turn-${++this.turns}`
        this.say({ id, result: { turn: { id: turn, status: 'inProgress' } } })
        this.tell('turn/started', { threadId: this.thread, turn: { id: turn } })
        return
      }
      default:
        return this.say({ id, result: {} })
    }
  }
  kill() {
    this.killed = true
    this.emit('exit', null)
    return true
  }
  say(message: Record<string, unknown>) {
    this.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  }
  tell(method: string, params: Record<string, unknown>) {
    this.say({ method, params })
  }
  /** Codex asking Pacenote something, with its request's id */
  ask(id: number, method: string, params: Record<string, unknown>) {
    this.say({ id, method, params })
  }
  /** What it was asked, by method */
  sent(method: string): Message[] {
    return this.written.filter((message) => message.method === method)
  }
  /** Pacenote's answer to what it asked */
  answered(id: number): Message | undefined {
    return this.written.find((message) => message.id === id && !message.method)
  }
  /** What you sent, told back as it reads it */
  reads(text: string, item = `user-${this.written.length}`) {
    const userMessage = {
      type: 'userMessage',
      id: item,
      content: [{ type: 'text', text, text_elements: [] }],
    }
    this.tell('item/started', { threadId: this.thread, item: userMessage })
    this.tell('item/completed', { threadId: this.thread, item: userMessage })
  }
  done(turn = `turn-${this.turns}`, status = 'completed', error?: string) {
    this.tell('turn/completed', {
      threadId: this.thread,
      turn: {
        id: turn,
        status,
        ...(error ? { error: { message: error } } : {}),
      },
    })
  }
}

const tick = async (times = 3) => {
  for (let i = 0; i < times; i++)
    await new Promise((resolve) => setImmediate(resolve))
}

function host(options: Partial<CodexHostOptions> = {}) {
  const procs: FakeCodex[] = []
  const changes: string[] = []
  const warnings: string[] = []
  const asks: SessionAsk[] = []
  const h = new CodexHost({
    bin: () => 'codex',
    env: () => ({}),
    version: '0.6.43',
    warn: (message) => warnings.push(message),
    onChange: (session) => changes.push(session),
    onAsk: (_session, _cwd, ask) => asks.push(ask),
    spawn: (_bin, args, cwd) => {
      const proc = new FakeCodex(args, cwd)
      procs.push(proc)
      return proc
    },
    ...options,
  })
  return { h, procs, changes, warnings, asks }
}

/** A session begun in /work/payments, its first message read */
async function begun(options: Partial<CodexHostOptions> = {}) {
  const made = host(options)
  const started = await made.h.begin('/work/payments', 'Look at the retry', {
    name: 'Fix the flaky webhook retry test',
  })
  const proc = made.procs[0]!
  return { ...made, proc, session: started.session! }
}

describe('a Codex session Pacenote runs', () => {
  it('starts codex app-server in the folder, as Pacenote, in the mode you picked', async () => {
    const { h, procs } = host()
    const started = await h.begin('/work/payments', 'Look at the retry', {
      name: 'Fix the flaky webhook retry test',
      mode: 'read-only',
    })
    const proc = procs[0]!
    expect(proc.args).toEqual(['app-server'])
    expect(proc.cwd).toBe('/work/payments')
    expect(started).toEqual({ session: proc.thread })
    // It says who it is: Codex writes it in the log as its originator
    expect(proc.sent('initialize')[0]!.params).toEqual({
      clientInfo: { name: 'pacenote', title: 'Pacenote', version: '0.6.43' },
      capabilities: null,
    })
    expect(proc.sent('initialized')).toHaveLength(1)
    expect(proc.sent('thread/start')[0]!.params).toEqual({
      cwd: '/work/payments',
      approvalPolicy: 'on-request',
      sandbox: 'read-only',
    })
    expect(proc.sent('thread/name/set')[0]!.params).toEqual({
      threadId: proc.thread,
      name: 'Fix the flaky webhook retry test',
    })
    // The mode it started with applies: the turn carries none of its own
    expect(proc.sent('turn/start')[0]!.params).toEqual({
      threadId: proc.thread,
      input: [{ type: 'text', text: 'Look at the retry', text_elements: [] }],
    })
    // Its log is where Codex says, and its model as Codex runs it
    expect(h.file(proc.thread)).toBe(
      `/home/.codex/sessions/rollout-${proc.thread}.jsonl`
    )
    expect(h.get(proc.thread)).toMatchObject({
      busy: true,
      mode: 'read-only',
      model: 'gpt-6-luna',
      queued: [{ text: 'Look at the retry' }],
    })
    expect(h.list()).toEqual([
      expect.objectContaining({
        session: proc.thread,
        cwd: '/work/payments',
        name: 'Fix the flaky webhook retry test',
        busy: true,
        pid: 4242,
      }),
    ])
    expect(h.working()).toBe(1)
    // Read: not queued anymore, once though Codex tells it twice
    proc.reads('Look at the retry', 'u1')
    await tick()
    expect(h.get(proc.thread)?.queued).toBeUndefined()
    h.endAll()
  })

  it('says why it does not start, and starts nothing', async () => {
    const spawned = host({
      spawn: () => {
        throw new Error('spawn codex ENOENT')
      },
    })
    expect(await spawned.h.begin('/work/payments', 'Hi')).toEqual({
      error: 'spawn codex ENOENT',
    })
    let refusing: FakeCodex | undefined
    const { h } = host({
      spawn: (_bin, args, cwd) => {
        refusing = new FakeCodex(args, cwd)
        refusing.refuse.add('thread/start')
        return refusing
      },
    })
    expect(await h.begin('/work/payments', 'Hi')).toEqual({ error: 'no' })
    expect(h.list()).toEqual([])
    expect(refusing!.killed).toBe(true)
  })

  it('shows what it does as it goes: thinking, a command, its answer as it writes it', async () => {
    const onLive = vi.fn()
    const { h, proc, session } = await begun({ onLive })
    proc.reads('Look at the retry')
    proc.tell('item/started', { item: { type: 'reasoning', id: 'r1' } })
    await tick()
    expect(h.get(session)?.doing).toBe('thinking')
    proc.tell('item/started', {
      item: {
        type: 'commandExecution',
        id: 'c1',
        command: "/bin/zsh -lc 'pnpm vitest run tests/retry.test.ts'",
      },
    })
    await tick()
    expect(h.get(session)).toMatchObject({
      doing: 'tool',
      step: { name: 'Shell', text: 'pnpm vitest run tests/retry.test.ts' },
    })
    proc.tell('item/completed', {
      item: { type: 'commandExecution', id: 'c1' },
    })
    proc.tell('item/started', { item: { type: 'agentMessage', id: 'a1' } })
    proc.tell('item/agentMessage/delta', { itemId: 'a1', delta: 'The retry ' })
    proc.tell('item/agentMessage/delta', { itemId: 'a1', delta: 'waits.' })
    await tick()
    expect(h.get(session)).toMatchObject({
      doing: 'writing',
      draft: 'The retry waits.',
    })
    expect(h.get(session)?.step).toBeUndefined()
    h.endAll()
  })

  it('asks before a command, with why, and remembers "in this session" as Codex does', async () => {
    const { h, proc, session, asks } = await begun()
    proc.ask(7, 'item/commandExecution/requestApproval', {
      threadId: proc.thread,
      turnId: 'turn-1',
      itemId: 'c1',
      command: "/bin/zsh -lc 'pnpm install --frozen-lockfile'",
      reason: 'It needs the network to install packages.',
    })
    await tick()
    const ask = h.get(session)?.ask
    expect(ask).toMatchObject({
      id: '7',
      kind: 'command',
      tool: 'Shell',
      what: 'pnpm install --frozen-lockfile',
      rule: 'pnpm install --frozen-lockfile',
      why: 'It needs the network to install packages.',
    })
    expect(asks).toEqual([ask])
    expect(h.answer(session, '7', 'always')).toEqual({})
    expect(proc.answered(7)!.result).toEqual({ decision: 'acceptForSession' })
    expect(h.get(session)?.ask).toBeUndefined()
    // Gone once answered
    expect(h.answer(session, '7', 'allow')).toEqual({ error: 'gone' })
    h.endAll()
  })

  it('names the files a change asks for, as its item told them', async () => {
    const { h, proc, session } = await begun()
    proc.tell('item/started', {
      item: {
        type: 'fileChange',
        id: 'f1',
        changes: [{ path: '/work/payments/src/retry.ts', kind: 'update' }],
      },
    })
    proc.ask(8, 'item/fileChange/requestApproval', {
      itemId: 'f1',
      reason: 'Write outside the sandbox',
    })
    await tick()
    expect(h.get(session)?.ask).toMatchObject({
      kind: 'edit',
      what: 'src/retry.ts',
      always: true,
      why: 'Write outside the sandbox',
    })
    h.answer(session, '8', 'allow')
    expect(proc.answered(8)!.result).toEqual({ decision: 'accept' })
    h.endAll()
  })

  it('says no, and tells Codex what to do instead', async () => {
    const { h, proc, session } = await begun()
    proc.ask(9, 'item/commandExecution/requestApproval', {
      command: 'rm -rf node_modules',
    })
    await tick()
    h.answer(session, '9', 'deny', 'Keep node_modules, run the test only')
    await tick()
    expect(proc.answered(9)!.result).toEqual({ decision: 'decline' })
    // On its turn still: what you typed goes to it as it goes
    expect(proc.sent('turn/steer').at(-1)!.params).toEqual({
      threadId: proc.thread,
      input: [
        {
          type: 'text',
          text: 'Keep node_modules, run the test only',
          text_elements: [],
        },
      ],
      expectedTurnId: 'turn-1',
    })
    h.endAll()
  })

  it('refuses what it does not answer, and says so', async () => {
    const { h, proc, session, warnings } = await begun()
    proc.ask(10, 'item/tool/requestUserInput', { questions: [] })
    await tick()
    expect(proc.answered(10)!.error).toMatchObject({ code: -32601 })
    expect(h.get(session)?.ask).toBeUndefined()
    expect(warnings).toEqual([
      expect.stringContaining('item/tool/requestUserInput'),
    ])
    h.endAll()
  })

  it('takes what you send on its turn as it goes, and starts a turn when it rests', async () => {
    const { h, proc, session } = await begun()
    proc.reads('Look at the retry')
    expect(await h.send(session, '/work/payments', 'Use fake timers')).toEqual(
      {}
    )
    expect(proc.sent('turn/steer')[0]!.params).toMatchObject({
      expectedTurnId: 'turn-1',
    })
    expect(h.get(session)?.queued).toEqual([
      expect.objectContaining({ text: 'Use fake timers' }),
    ])
    proc.done()
    await tick()
    // Its turn is over: what it never read is not waiting anymore
    expect(h.get(session)).toMatchObject({ busy: false })
    expect(h.get(session)?.queued).toBeUndefined()
    await h.send(session, '/work/payments', 'Now run it again')
    expect(proc.sent('turn/start')).toHaveLength(2)
    expect(h.get(session)?.busy).toBe(true)
    h.endAll()
  })

  it('sends the images with what you typed, as data', async () => {
    const { h, proc, session } = await begun()
    proc.done()
    await tick()
    await h.send(session, '/work/payments', 'This one', [
      { mediaType: 'image/png', data: 'iVBORw0KGgo=' },
    ])
    expect(proc.sent('turn/start').at(-1)!.params).toMatchObject({
      input: [
        { type: 'image', url: 'data:image/png;base64,iVBORw0KGgo=' },
        { type: 'text', text: 'This one', text_elements: [] },
      ],
    })
    expect(h.get(session)?.queued).toEqual([
      expect.objectContaining({ text: 'This one', images: 1 }),
    ])
    h.endAll()
  })

  it('changes how it asks from its next turn', async () => {
    const { h, proc, session } = await begun()
    expect(h.setMode(session, 'full-access')).toEqual({})
    expect(h.get(session)?.mode).toBe('full-access')
    proc.done()
    await tick()
    await h.send(session, '/work/payments', 'Go on')
    expect(proc.sent('turn/start').at(-1)!.params).toMatchObject({
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'dangerFullAccess' },
    })
    proc.done()
    await tick()
    // Applied: the next turn carries none
    await h.send(session, '/work/payments', 'And again')
    expect(proc.sent('turn/start').at(-1)!.params).not.toHaveProperty(
      'approvalPolicy'
    )
    expect(h.setMode('nope', 'workspace')).toEqual({ error: 'gone' })
    h.endAll()
  })

  it('stops the turn it is on, which is no failure, and tells nothing done', async () => {
    const onDone = vi.fn()
    const { h, proc, session } = await begun({ onDone })
    expect(h.stop(session)).toEqual({})
    await tick()
    expect(proc.sent('turn/interrupt')[0]!.params).toEqual({
      threadId: proc.thread,
      turnId: 'turn-1',
    })
    proc.done('turn-1', 'interrupted')
    await tick()
    expect(h.get(session)).toMatchObject({ busy: false })
    expect(h.get(session)?.error).toBeUndefined()
    expect(onDone).not.toHaveBeenCalled()
    // Resting: nothing to stop
    expect(h.stop(session)).toEqual({})
    expect(proc.sent('turn/interrupt')).toHaveLength(1)
    h.endAll()
  })

  it('tells when its turn is done, what it spent and how full its context is', async () => {
    const onDone = vi.fn()
    const onSpent = vi.fn()
    const { h, proc, session } = await begun({ onDone, onSpent })
    proc.tell('thread/tokenUsage/updated', {
      tokenUsage: {
        total: { totalTokens: 12_000 },
        last: {
          totalTokens: 12_000,
          inputTokens: 11_000,
          cachedInputTokens: 8_000,
          outputTokens: 1_000,
        },
        modelContextWindow: 258_400,
      },
    })
    proc.tell('item/completed', {
      item: {
        type: 'agentMessage',
        id: 'a1',
        text: '\nThe retry waits on a real timer.\nFixed it with fake ones.',
      },
    })
    proc.done()
    await tick()
    expect(h.get(session)?.context).toEqual({ used: 12_000, window: 258_400 })
    expect(onSpent).toHaveBeenCalledWith(session, {
      input: 3_000,
      cacheRead: 8_000,
      cacheWrite: 0,
      output: 1_000,
    })
    expect(onDone).toHaveBeenCalledWith(
      session,
      '/work/payments',
      'The retry waits on a real timer.'
    )
    h.endAll()
  })

  it('tells why its turn failed, until you send it something again', async () => {
    const { h, proc, session } = await begun()
    proc.done('turn-1', 'failed', 'You have hit your usage limit.')
    await tick()
    expect(h.get(session)).toMatchObject({
      busy: false,
      error: 'You have hit your usage limit.',
    })
    await h.send(session, '/work/payments', 'Try again')
    expect(h.get(session)?.error).toBeUndefined()
    h.endAll()
  })

  it('resumes a session it ran before from its log, in the mode it ran with', async () => {
    const { h, procs, proc, session } = await begun()
    h.setMode(session, 'read-only')
    h.end(session)
    expect(proc.killed).toBe(true)
    expect(h.has(session)).toBe(false)
    // Its log stays known
    expect(h.file(session)).toContain(session)
    expect(await h.send(session, '/work/payments', 'Where were we?')).toEqual(
      {}
    )
    const again = procs[1]!
    expect(again.sent('thread/resume')[0]!.params).toEqual({
      threadId: session,
      approvalPolicy: 'on-request',
      sandbox: 'read-only',
      excludeTurns: true,
    })
    expect(again.sent('turn/start')[0]!.params).not.toHaveProperty(
      'sandboxPolicy'
    )
    expect(h.has(session)).toBe(true)
    h.endAll()
  })

  it('moves on to its log as it is now once another place continued it', async () => {
    let size = 100
    const { h, procs, proc, session } = await begun({
      logSize: () => size,
      settleMs: 0,
    })
    proc.done()
    await tick()
    await new Promise((resolve) => setTimeout(resolve, 5))
    // codex resume in a terminal wrote to it meanwhile
    size = 180
    const sent = h.send(session, '/work/payments', 'Back here')
    await tick()
    expect(proc.killed).toBe(true)
    await sent
    expect(procs[1]!.sent('thread/resume')).toHaveLength(1)
    h.endAll()
  })

  it('tells why Codex stopped, and forgets the run', async () => {
    const { h, proc, session, warnings } = await begun()
    proc.stderr.write('Error: stream disconnected before completion\n')
    await tick()
    proc.emit('exit', 1)
    await tick()
    expect(h.has(session)).toBe(false)
    expect(h.get(session)).toEqual({
      busy: false,
      error: 'Error: stream disconnected before completion',
    })
    expect(warnings).toEqual([
      expect.stringContaining('stream disconnected before completion'),
    ])
  })

  it('ends a run that rests a while, its conversation kept in its log', async () => {
    const { h, proc, session } = await begun({ idleMs: 1 })
    proc.done()
    await tick()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(proc.killed).toBe(true)
    expect(h.has(session)).toBe(false)
    expect(h.get(session)).toBeUndefined()
  })
})
