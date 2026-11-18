import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  SessionHost,
  type SessionHostOptions,
} from '../apps/desktop/src/session-host.js'

/** Claude Code as the host sees it: lines in, lines out */
class FakeClaude extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  /** What Pacenote wrote to it, line by line */
  written: Record<string, unknown>[] = []
  killed = false
  constructor(
    readonly args: string[],
    readonly cwd: string
  ) {
    super()
    let rest = ''
    this.stdin.on('data', (chunk: Buffer) => {
      const lines = (rest + String(chunk)).split('\n')
      rest = lines.pop() ?? ''
      for (const line of lines)
        if (line) this.written.push(JSON.parse(line) as Record<string, unknown>)
    })
  }
  kill() {
    this.killed = true
    this.emit('exit', null)
    return true
  }
  say(event: Record<string, unknown>) {
    this.stdout.write(`${JSON.stringify(event)}\n`)
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function host(options: Partial<SessionHostOptions> = {}) {
  const procs: FakeClaude[] = []
  const changes: string[] = []
  const warnings: string[] = []
  const h = new SessionHost({
    bin: () => 'claude',
    env: () => ({}),
    warn: (message) => warnings.push(message),
    onChange: (session) => changes.push(session),
    spawn: (_bin, args, cwd) => {
      const proc = new FakeClaude(args, cwd)
      procs.push(proc)
      return proc
    },
    ...options,
  })
  return { h, procs, changes, warnings }
}

const ask = {
  type: 'control_request',
  request_id: 'r1',
  request: {
    subtype: 'can_use_tool',
    tool_name: 'Bash',
    display_name: 'Bash',
    input: { command: 'pnpm test' },
    permission_suggestions: [
      {
        type: 'addRules',
        behavior: 'allow',
        rules: [{ toolName: 'Bash', ruleContent: 'pnpm test' }],
        destination: 'localSettings',
      },
    ],
  },
}

describe('SessionHost: the Claude Code sessions Pacenote runs', () => {
  it('runs the session where it was, resuming it, and sends what you typed', async () => {
    const { h, procs } = host()
    await expect(h.send('s1', '/w/pay', 'Make it 5')).resolves.toEqual({})
    const [proc] = procs
    expect(proc!.cwd).toBe('/w/pay')
    expect(proc!.args.slice(0, 3)).toEqual(['-p', '--resume', 's1'])
    await tick()
    expect(proc!.written).toEqual([
      { type: 'user', message: { role: 'user', content: 'Make it 5' } },
    ])
    expect(h.get('s1')).toMatchObject({ busy: true })
    proc!.say({
      type: 'system',
      subtype: 'init',
      session_id: 's1',
      permissionMode: 'default',
    })
    proc!.say({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } },
        ],
      },
    })
    await tick()
    expect(h.get('s1')).toMatchObject({
      busy: true,
      mode: 'default',
      step: { name: 'Edit', text: 'a.ts' },
    })
    // A second message goes to the same run
    h.send('s1', '/w/pay', 'And a test')
    expect(procs).toHaveLength(1)
    proc!.say({ type: 'result', subtype: 'success', is_error: false })
    await tick()
    expect(h.get('s1')).toEqual({ busy: false, mode: 'default' })
    expect(h.list()).toMatchObject([
      { session: 's1', cwd: '/w/pay', busy: false },
    ])
  })

  it('tells what it does this moment: thinks, writes as it comes, runs a step', async () => {
    vi.useFakeTimers()
    try {
      const lives: { session: string; draft?: string }[] = []
      const { h, procs } = host({
        onLive: (session, live) => lives.push({ session, draft: live.draft }),
      })
      h.send('s1', '/w', 'Explain the retry')
      const proc = procs[0]!
      const since = h.get('s1')?.since
      expect(since).toBeTruthy()
      const stream = (event: Record<string, unknown>) =>
        proc.say({ type: 'stream_event', event })
      stream({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking' },
      })
      await vi.advanceTimersByTimeAsync(1)
      expect(h.get('s1')).toMatchObject({
        busy: true,
        doing: 'thinking',
        since,
      })
      stream({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '' },
      })
      for (const text of ['It tries ', 'three times', '.'])
        stream({
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text },
        })
      await vi.advanceTimersByTimeAsync(1)
      expect(h.get('s1')).toMatchObject({
        doing: 'writing',
        draft: 'It tries three times.',
      })
      // Told once for the three, a moment after
      expect(lives).toEqual([])
      await vi.advanceTimersByTimeAsync(200)
      expect(lives).toEqual([{ session: 's1', draft: 'It tries three times.' }])
      // Written in full: its log has it, no draft left
      proc.say({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'It tries three times.' }] },
      })
      await vi.advanceTimersByTimeAsync(1)
      expect(h.get('s1')?.draft).toBeUndefined()
      expect(h.get('s1')?.doing).toBeUndefined()
      stream({
        type: 'content_block_start',
        index: 2,
        content_block: { type: 'tool_use', name: 'Read' },
      })
      await vi.advanceTimersByTimeAsync(1)
      expect(h.get('s1')).toMatchObject({
        doing: 'tool',
        step: { name: 'Read', text: '' },
      })
      proc.say({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } },
          ],
        },
      })
      await vi.advanceTimersByTimeAsync(1)
      expect(h.get('s1')?.step).toEqual({ name: 'Read', text: 'a.ts' })
      // The step came back: on to the next
      proc.say({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'x' }] },
      })
      await vi.advanceTimersByTimeAsync(1)
      expect(h.get('s1')?.doing).toBeUndefined()
      expect(h.get('s1')?.step).toBeUndefined()
      proc.say({ type: 'result', is_error: false })
      await vi.advanceTimersByTimeAsync(1)
      expect(h.get('s1')).toEqual({ busy: false })
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows what it asks, answers it, and keeps a rule for the session', async () => {
    const asked = vi.fn()
    const { h, procs } = host({ onAsk: asked })
    h.send('s1', '/w/pay', 'Run the tests')
    const proc = procs[0]!
    proc.say(ask)
    await tick()
    expect(h.get('s1')?.ask).toMatchObject({
      id: 'r1',
      kind: 'command',
      what: 'pnpm test',
      rule: 'pnpm test',
    })
    expect(h.list()[0]?.asks).toBe('command')
    expect(asked).toHaveBeenCalledWith(
      's1',
      '/w/pay',
      expect.objectContaining({ id: 'r1' })
    )
    expect(h.answer('s1', 'r1', 'always')).toEqual({})
    await tick()
    expect(proc.written.at(-1)).toMatchObject({
      type: 'control_response',
      response: {
        request_id: 'r1',
        response: {
          behavior: 'allow',
          updatedPermissions: [{ destination: 'session' }],
        },
      },
    })
    expect(h.get('s1')?.ask).toBeUndefined()
    // Asked again of an answered ask: gone
    expect(h.answer('s1', 'r1', 'allow')).toEqual({ error: 'gone' })
  })

  it('turns down an ask it does not answer', async () => {
    const { h, procs } = host()
    h.send('s1', '/w', 'hi')
    procs[0]!.say({
      type: 'control_request',
      request_id: 'x1',
      request: { subtype: 'hook_callback' },
    })
    await tick()
    expect(procs[0]!.written.at(-1)).toMatchObject({
      type: 'control_response',
      response: { subtype: 'error', request_id: 'x1' },
    })
  })

  it('stops a turn with no error, and tells why one stopped short', async () => {
    const { h, procs } = host()
    h.send('s1', '/w', 'Count to 200')
    const proc = procs[0]!
    expect(h.stop('s1')).toEqual({})
    await tick()
    expect(proc.written.at(-1)).toMatchObject({
      type: 'control_request',
      request: { subtype: 'interrupt' },
    })
    proc.say({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
    })
    await tick()
    expect(h.get('s1')).toMatchObject({ busy: false })
    expect(h.get('s1')?.error).toBeUndefined()
    h.send('s1', '/w', 'Again')
    proc.say({
      type: 'result',
      is_error: true,
      result: 'Credit balance is too low',
    })
    await tick()
    expect(h.get('s1')?.error).toBe('Credit balance is too low')
    expect(h.working()).toBe(0)
  })

  it('starts a new session with its id, name and mode, and sends its first message', async () => {
    const { h, procs, changes } = host()
    expect(
      h.begin('n1', '/w/pay', 'You are taking over a task', {
        name: 'Retry the webhook',
        mode: 'plan',
      })
    ).toEqual({})
    const proc = procs[0]!
    expect(proc.cwd).toBe('/w/pay')
    expect(proc.args.slice(0, 7)).toEqual([
      '-p',
      '--session-id',
      'n1',
      '--name',
      'Retry the webhook',
      '--permission-mode',
      'plan',
    ])
    await tick()
    expect(proc.written).toEqual([
      {
        type: 'user',
        message: { role: 'user', content: 'You are taking over a task' },
      },
    ])
    // Known by its id at once, listed with its name until its log has one
    expect(h.has('n1')).toBe(true)
    expect(h.get('n1')).toMatchObject({ busy: true, mode: 'plan' })
    expect(h.list()).toMatchObject([
      { session: 'n1', cwd: '/w/pay', name: 'Retry the webhook', busy: true },
    ])
    expect(changes).toContain('n1')
    // Claude Code says the same id: it stays
    proc.say({ type: 'system', subtype: 'init', session_id: 'n1' })
    await tick()
    expect(h.has('n1')).toBe(true)
    // An id already running is not started twice
    expect(h.begin('n1', '/w/pay', 'Again')).toEqual({ error: 'taken' })
    expect(procs).toHaveLength(1)
  })

  it('continues a session in a copy, known by its own id once named', async () => {
    const { h, procs } = host()
    const copied = h.copy('s1', '/w', 'Try it the other way')
    const proc = procs[0]!
    expect(proc.args).toContain('--fork-session')
    expect(h.has('s1')).toBe(false)
    proc.say({ type: 'system', subtype: 'init', session_id: 's2' })
    expect(await copied).toEqual({ session: 's2' })
    expect(h.has('s2')).toBe(true)
    expect(h.has('s1')).toBe(false)
  })

  it('says why a run stopped, and forgets one you ended', async () => {
    const { h, procs, warnings } = host()
    h.send('s1', '/w', 'hi')
    procs[0]!.stderr.write('Error: not signed in\n')
    await tick()
    procs[0]!.emit('exit', 1)
    expect(h.has('s1')).toBe(false)
    expect(h.get('s1')).toEqual({ busy: false, error: 'Error: not signed in' })
    expect(warnings).toHaveLength(1)
    // Sent again: run again, the error gone
    h.send('s1', '/w', 'hi again')
    expect(procs).toHaveLength(2)
    expect(h.get('s1')?.error).toBeUndefined()
    h.end('s1')
    expect(procs[1]!.killed).toBe(true)
    expect(h.get('s1')).toBeUndefined()
    expect(warnings).toHaveLength(1)
  })

  it('resumes again from its log when it was continued somewhere else since its turn here', async () => {
    let size = 100
    const { h, procs } = host({ logSize: () => size, settleMs: 1 })
    const done = async (proc: FakeClaude) => {
      proc.say({ type: 'result', subtype: 'success', is_error: false })
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    h.send('s1', '/w', 'hi')
    procs[0]!.say({
      type: 'system',
      subtype: 'init',
      session_id: 's1',
      permissionMode: 'acceptEdits',
    })
    await done(procs[0]!)
    // Its log as its turn left it: the same run goes on
    await h.send('s1', '/w', 'and then')
    expect(procs).toHaveLength(1)
    size = 140
    await done(procs[0]!)
    // Another place wrote to it since: run again from its log, asking as before
    size = 220
    await expect(h.send('s1', '/w', 'Go on')).resolves.toEqual({})
    expect(procs[0]!.killed).toBe(true)
    expect(procs).toHaveLength(2)
    expect(procs[1]!.args.slice(0, 3)).toEqual(['-p', '--resume', 's1'])
    expect(procs[1]!.args).toEqual(
      expect.arrayContaining(['--permission-mode', 'acceptEdits'])
    )
    await tick()
    expect(procs[1]!.written).toEqual([
      { type: 'user', message: { role: 'user', content: 'Go on' } },
    ])
    expect(h.get('s1')).toMatchObject({ busy: true, mode: 'acceptEdits' })
  })

  it('lets go of a session another place opened, but not on a turn or an ask', async () => {
    const { h, procs } = host()
    h.send('s1', '/w', 'hi')
    expect(h.letGo('s1')).toBe(false)
    procs[0]!.say(ask)
    procs[0]!.say({ type: 'result', is_error: false })
    await tick()
    expect(h.letGo('s1')).toBe(true)
    expect(procs[0]!.killed).toBe(true)
    expect(h.has('s1')).toBe(false)
    expect(h.letGo('s1')).toBe(false)
  })

  it('ends a run that has had nothing to do for a while', async () => {
    vi.useFakeTimers()
    try {
      const { h, procs } = host({ idleMs: 1000 })
      h.send('s1', '/w', 'hi')
      procs[0]!.say({ type: 'result', is_error: false })
      await vi.advanceTimersByTimeAsync(10)
      expect(h.has('s1')).toBe(true)
      await vi.advanceTimersByTimeAsync(1000)
      expect(h.has('s1')).toBe(false)
      expect(procs[0]!.killed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
