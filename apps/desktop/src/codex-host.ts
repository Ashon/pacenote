import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import {
  CODEX_DEFAULT_MODE,
  CODEX_ORIGINATOR,
  codexAnswer,
  codexAskOf,
  codexContext,
  codexInput,
  codexPolicy,
  codexSaid,
  codexSpend,
  codexStep,
  isCodexMode,
} from '../../../src/sessions/codex.js'
import type { SessionImage } from '../../../src/sessions/images.js'
import { QUEUED_CHARS } from '../../../src/sessions/sent.js'
import type {
  CodexMode,
  SessionAsk,
  SessionLive,
} from '../../../src/sessions/types.js'
import {
  addUsage,
  NO_USAGE,
  type TokenUsage,
} from '../../../src/history/usage.js'
import { MINUTE, SECOND } from '../../../src/time.js'
import type { HostedSession, HostProcess } from './session-host.js'

/**
 * The Codex sessions Pacenote runs on this Mac (Z2): each is the installed
 * codex app-server, one per session, with your own ChatGPT sign-in, on a
 * thread Codex starts (thread/start) or resumes from its log (thread/resume)
 * for what you type on its page, its asks coming back to be answered there
 * (Z3). Codex keeps the conversation in its own log, as for any session, and
 * names Pacenote as the one that runs it (its originator); Pacenote keeps
 * nothing of it. It has the shape of SessionHost (Claude Code's), so the
 * sessions IPC tells them apart by the session's tool alone.
 *
 * One conversation, typed into in one place at a time: a session the Codex
 * app or a terminal runs goes on there (Z7). One continued somewhere else
 * since its turn here resumes again from its log before what you type goes
 * to it.
 */

export interface CodexHostOptions {
  /** Codex's command (CODEX_BIN) */
  bin: () => string
  /** What it runs with: your environment, with the tools' PATH */
  env: () => NodeJS.ProcessEnv
  /** Pacenote's version, told to Codex as it starts */
  version: string
  warn: (message: string) => void
  /** Something about a session changed: its page and the list read again */
  onChange: (session: string) => void
  /** What it does this moment changed: at most every LIVE_MS */
  onLive?: (session: string, live: SessionLive) => void
  /** A session asks something: told as a notification when out of sight */
  onAsk?: (session: string, cwd: string, ask: SessionAsk) => void
  /** A session's turn is done: told as a notification when out of sight */
  onDone?: (session: string, cwd: string, did: string) => void
  /** What a turn spent, for the Overview's tokens per day */
  onSpent?: (session: string, usage: TokenUsage) => void
  /** How long a session with nothing to do keeps running */
  idleMs?: number
  /**
   * How big a session's log is now: grown since its turn here ended, it was
   * continued somewhere else in the meantime
   */
  logSize?: (file: string) => number | undefined
  /** How long after its turn its log has had all of it written */
  settleMs?: number
  /** How long Codex has to answer what Pacenote asks it */
  answerMs?: number
  /** Tests stand in for Codex */
  spawn?: (bin: string, args: string[], cwd: string) => HostProcess
}

type RpcId = number | string

interface Pending {
  resolve: (result: Record<string, unknown>) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface Hosted {
  /** The thread's id, once Codex starts it */
  session: string
  cwd: string
  name?: string
  proc: HostProcess
  live: SessionLive
  /** Its asks, in the order they came, with what answering needs */
  asks: Map<
    string,
    {
      ask: SessionAsk
      rpc: RpcId
      method: string
      params: Record<string, unknown>
    }
  >
  startedAt: string
  /** Its log, as Codex says where it keeps it */
  file?: string
  /** The turn it is on */
  turn?: string
  /** A turn being started, until Codex says its id */
  starting?: Promise<unknown>
  /** Its thread opened (or resumed), for what you send meanwhile */
  ready?: Promise<{ error?: string }>
  /** The mode Codex runs the thread with now */
  applied?: CodexMode
  /** A file change's files by its item, for its ask */
  files: Map<string, string[]>
  /** The messages of yours Codex told back, by their item */
  taken: Set<string>
  /** The answer it wrote last on this turn, for a notification */
  said?: string
  /** What this turn spent so far */
  spent?: TokenUsage
  pending: Map<RpcId, Pending>
  next: number
  idle?: NodeJS.Timeout
  liveSoon?: NodeJS.Timeout
  settled?: number
  settle?: NodeJS.Timeout
  /** You stopped its turn: the turn's end is no error */
  stopping?: boolean
  /** You ended it, or Pacenote is quitting */
  ending?: boolean
  stderr: string
}

const IDLE_MS = 30 * MINUTE
const ANSWER_MS = 60 * SECOND
const STDERR_CHARS = 2000
const LIVE_MS = 120
const DRAFT_CHARS = 12_000
const SETTLE_MS = 5 * SECOND
const GONE_MS = 5 * SECOND

export class CodexHost {
  private readonly hosted = new Map<string, Hosted>()
  /** Why a session's run stopped short, until you send it something again */
  private readonly failed = new Map<string, string>()
  /** The mode a session ran with, to resume it with again */
  private readonly modes = new Map<string, CodexMode>()
  /** Each session's log, as Codex said, once its run here ended */
  private readonly logs = new Map<string, string>()

  constructor(private readonly options: CodexHostOptions) {}

  get(session: string): SessionLive | undefined {
    const h = this.hosted.get(session)
    if (h) return { ...h.live }
    const error = this.failed.get(session)
    return error ? { busy: false, error } : undefined
  }

  has(session: string): boolean {
    return this.hosted.has(session)
  }

  /** Its log, as Codex said where it keeps it */
  file(session: string): string | undefined {
    return this.hosted.get(session)?.file ?? this.logs.get(session)
  }

  list(): HostedSession[] {
    return [...this.hosted.values()].map((h) => ({
      session: h.session,
      cwd: h.cwd,
      ...(h.name ? { name: h.name } : {}),
      busy: h.live.busy,
      ...(h.live.ask ? { asks: h.live.ask.kind } : {}),
      startedAt: h.startedAt,
      ...(h.proc.pid ? { pid: h.proc.pid } : {}),
    }))
  }

  /** How many are on a turn: Pacenote asks before it quits on one */
  working(): number {
    return [...this.hosted.values()].filter((h) => h.live.busy).length
  }

  /**
   * Starts a new session in the folder, with its first message and the
   * images with it: the thread's id, once Codex starts it
   */
  async begin(
    cwd: string,
    text: string,
    options: {
      name?: string
      mode?: CodexMode
      images?: readonly SessionImage[]
    } = {}
  ): Promise<{ session?: string; error?: string }> {
    const mode = options.mode ?? CODEX_DEFAULT_MODE
    const h = this.make('', cwd, mode, options.name)
    if ('error' in h) return h
    try {
      await this.open(h, mode)
    } catch (error) {
      this.kill(h)
      return { error: (error as Error).message }
    }
    this.hosted.set(h.session, h)
    if (options.name)
      void this.request(h, 'thread/name/set', {
        threadId: h.session,
        name: options.name,
      }).catch(() => {
        // Its name stays the one Codex gives it
      })
    const sent = await this.turn(h, text, options.images ?? [])
    if (sent.error) {
      this.end(h.session)
      return sent
    }
    return { session: h.session }
  }

  /**
   * Sends it what you typed, running it here first when it is not: while it
   * is on a turn it reads it after the step it is on (turn/steer)
   */
  async send(
    session: string,
    cwd: string,
    text: string,
    images: readonly SessionImage[] = []
  ): Promise<{ error?: string }> {
    let h = this.hosted.get(session)
    // Continued somewhere else since its turn here: it resumes again from
    // its log as it is now, in the mode it ran with
    if (h && this.movedOn(h)) {
      await this.ended(h)
      // Another send may have run it again while this one waited
      h = this.hosted.get(session)
    }
    if (!h) {
      const mode = this.modes.get(session) ?? CODEX_DEFAULT_MODE
      const made = this.make(session, cwd, mode)
      if ('error' in made) return made
      h = made
      this.hosted.set(session, h)
      const opening = h
      h.ready = this.open(h, mode, session).then(
        () => ({}),
        (error: Error) => {
          this.kill(opening)
          this.failed.set(session, error.message)
          return { error: error.message }
        }
      )
    }
    const ready = await h.ready
    if (ready?.error) return ready
    return this.turn(h, text, images)
  }

  /** Your answer to what it asks; deny's message goes to it as what to do */
  answer(
    session: string,
    ask: string,
    answer: 'allow' | 'always' | 'deny',
    message?: string
  ): { error?: string } {
    const h = this.hosted.get(session)
    const asked = h?.asks.get(ask)
    if (!h || !asked) return { error: 'gone' }
    h.asks.delete(ask)
    h.live.ask = h.asks.values().next().value?.ask
    const wrote = this.respond(
      h,
      asked.rpc,
      codexAnswer(asked.method, asked.params, answer)
    )
    this.options.onChange(h.session)
    // Codex has no reason with a no: what you typed instead goes to it
    if (!wrote.error && answer === 'deny' && message?.trim())
      void this.send(h.session, h.cwd, message.trim()).then((sent) => {
        if (sent.error)
          this.options.warn(`Could not tell Codex what to do: ${sent.error}`)
      })
    return wrote
  }

  /** Stops the turn it is on; it keeps running, for what you say next */
  stop(session: string): { error?: string } {
    const h = this.hosted.get(session)
    if (!h) return { error: 'gone' }
    if (!h.live.busy) return {}
    h.stopping = true
    void (async () => {
      await h.starting?.catch(() => undefined)
      if (!h.turn) return
      await this.request(h, 'turn/interrupt', {
        threadId: h.session,
        turnId: h.turn,
      }).catch((error: Error) =>
        this.options.warn(`Could not stop a Codex turn: ${error.message}`)
      )
    })()
    return {}
  }

  /** Changes how it asks before it acts: from its next turn (Z4) */
  setMode(session: string, mode: CodexMode): { error?: string } {
    const h = this.hosted.get(session)
    if (!h) return { error: 'gone' }
    h.live.mode = mode
    this.options.onChange(h.session)
    return {}
  }

  /** Ends its run: the conversation stays in Codex's log, to resume anywhere */
  end(session: string): void {
    const h = this.hosted.get(session)
    if (h) this.kill(h)
  }

  /** Ends them all: Pacenote is quitting */
  endAll(): void {
    for (const session of [...this.hosted.keys()]) this.end(session)
  }

  /** Starts codex app-server in the folder */
  private make(
    session: string,
    cwd: string,
    mode: CodexMode,
    name?: string
  ): Hosted | { error: string } {
    this.failed.delete(session)
    let proc: HostProcess
    try {
      proc = this.options.spawn
        ? this.options.spawn(this.options.bin(), ['app-server'], cwd)
        : spawn(this.options.bin(), ['app-server'], {
            cwd,
            env: this.options.env(),
            stdio: ['pipe', 'pipe', 'pipe'],
          })
    } catch (error) {
      return { error: (error as Error).message }
    }
    const h: Hosted = {
      session,
      cwd,
      ...(name ? { name } : {}),
      proc,
      live: { busy: false, mode },
      asks: new Map(),
      startedAt: new Date().toISOString(),
      files: new Map(),
      taken: new Set(),
      pending: new Map(),
      next: 1,
      stderr: '',
    }
    proc.stdin?.on('error', () => {
      // It went: its exit says why
    })
    if (proc.stdout)
      createInterface({ input: proc.stdout }).on('line', (line) =>
        this.read(h, line)
      )
    proc.stderr?.on('data', (chunk: Buffer) => {
      h.stderr = (h.stderr + String(chunk)).slice(-STDERR_CHARS)
    })
    proc.on('error', (error) => this.gone(h, error.message))
    proc.on('exit', (code) =>
      this.gone(
        h,
        code ? lastLine(h.stderr) || `Codex stopped (${code}).` : undefined
      )
    )
    return h
  }

  /**
   * Says who Pacenote is, then starts its thread in the mode, or resumes the
   * session's from its log
   */
  private async open(h: Hosted, mode: CodexMode, resume?: string) {
    await this.request(h, 'initialize', {
      clientInfo: {
        name: CODEX_ORIGINATOR,
        title: 'Pacenote',
        version: this.options.version,
      },
      capabilities: null,
    })
    this.notify(h, 'initialized')
    const policy = codexPolicy(mode)
    const opened = resume
      ? await this.request(h, 'thread/resume', {
          threadId: resume,
          approvalPolicy: policy.approvalPolicy,
          sandbox: policy.sandbox,
          excludeTurns: true,
        })
      : await this.request(h, 'thread/start', {
          cwd: h.cwd,
          approvalPolicy: policy.approvalPolicy,
          sandbox: policy.sandbox,
        })
    const thread = opened.thread as { id?: unknown; path?: unknown } | undefined
    if (typeof thread?.id !== 'string') throw new Error('Codex did not start.')
    h.session = thread.id
    if (typeof thread.path === 'string' && thread.path) h.file = thread.path
    if (typeof opened.model === 'string') h.live.model = opened.model
    h.applied = mode
  }

  /**
   * What you typed, to the turn it is on, or as a new turn: queued until
   * Codex says it read it
   */
  private async turn(
    h: Hosted,
    text: string,
    images: readonly SessionImage[]
  ): Promise<{ error?: string }> {
    if (!h.proc.stdin?.writable) return { error: 'gone' }
    const input = codexInput(text, images)
    const onTurn = h.live.busy
    h.live.queued = [
      ...(h.live.queued ?? []),
      {
        text: text.slice(0, QUEUED_CHARS),
        at: new Date().toISOString(),
        ...(images.length ? { images: images.length } : {}),
      },
    ]
    clearTimeout(h.idle)
    clearTimeout(h.settle)
    h.settled = undefined
    if (!h.live.busy) h.live.since = new Date().toISOString()
    h.live.busy = true
    h.live.error = undefined
    this.options.onChange(h.session)
    if (onTurn) {
      await h.starting?.catch(() => undefined)
      if (h.turn)
        try {
          await this.request(h, 'turn/steer', {
            threadId: h.session,
            input,
            expectedTurnId: h.turn,
          })
          return {}
        } catch {
          // Its turn ended meanwhile: what you typed starts the next
        }
    }
    const mode = isCodexMode(h.live.mode) ? h.live.mode : CODEX_DEFAULT_MODE
    const policy = codexPolicy(mode)
    const starting = this.request(h, 'turn/start', {
      threadId: h.session,
      input,
      // The mode you picked since the last turn, from this one on
      ...(mode !== h.applied
        ? {
            approvalPolicy: policy.approvalPolicy,
            sandboxPolicy: policy.sandboxPolicy,
          }
        : {}),
    })
    h.starting = starting
    try {
      const started = await starting
      const id = (started.turn as { id?: unknown } | undefined)?.id
      if (typeof id === 'string') h.turn ??= id
      h.applied = mode
      return {}
    } catch (error) {
      h.live.queued = h.live.queued?.slice(0, -1)
      if (!h.live.queued?.length) h.live.queued = undefined
      if (!h.turn) {
        h.live.busy = false
        h.live.since = undefined
      }
      this.options.onChange(h.session)
      return { error: (error as Error).message }
    } finally {
      if (h.starting === starting) h.starting = undefined
    }
  }

  private request(
    h: Hosted,
    method: string,
    params: unknown
  ): Promise<Record<string, unknown>> {
    if (!h.proc.stdin?.writable) return Promise.reject(new Error('gone'))
    const id = h.next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        h.pending.delete(id)
        reject(new Error(`Codex did not answer ${method}.`))
      }, this.options.answerMs ?? ANSWER_MS)
      timer.unref?.()
      h.pending.set(id, { resolve, reject, timer })
      h.proc.stdin!.write(line({ jsonrpc: '2.0', id, method, params }))
    })
  }

  private notify(h: Hosted, method: string, params?: unknown) {
    if (h.proc.stdin?.writable)
      h.proc.stdin.write(
        line({ jsonrpc: '2.0', method, ...(params ? { params } : {}) })
      )
  }

  private respond(
    h: Hosted,
    id: RpcId,
    result: Record<string, unknown>
  ): { error?: string } {
    if (!h.proc.stdin?.writable) return { error: 'gone' }
    h.proc.stdin.write(line({ jsonrpc: '2.0', id, result }))
    return {}
  }

  private read(h: Hosted, raw: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    const id = message.id as RpcId | undefined
    const method =
      typeof message.method === 'string' ? message.method : undefined
    const params = (message.params ?? {}) as Record<string, unknown>
    if (id !== undefined && !method) {
      const pending = h.pending.get(id)
      if (!pending) return
      h.pending.delete(id)
      clearTimeout(pending.timer)
      const error = message.error as { message?: unknown } | undefined
      if (error)
        pending.reject(
          new Error(
            typeof error.message === 'string' ? error.message : 'Codex said no.'
          )
        )
      else pending.resolve((message.result ?? {}) as Record<string, unknown>)
      return
    }
    if (!method) return
    if (id !== undefined) {
      this.asked(h, id, method, params)
      return
    }
    this.told(h, method, params)
  }

  /** Codex asks something: on its page to answer, or refused (Z3) */
  private asked(
    h: Hosted,
    id: RpcId,
    method: string,
    params: Record<string, unknown>
  ) {
    const item = typeof params.itemId === 'string' ? params.itemId : undefined
    const ask = codexAskOf(
      String(id),
      method,
      params,
      new Date().toISOString(),
      {
        cwd: h.cwd,
        ...(item && h.files.has(item) ? { files: h.files.get(item) } : {}),
      }
    )
    if (!ask) {
      // Its other questions (an MCP server's form, a tool of the client's)
      if (h.proc.stdin?.writable)
        h.proc.stdin.write(
          line({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Pacenote does not answer ${method}.`,
            },
          })
        )
      this.options.warn(
        `A Codex session asked what Pacenote does not answer: ${method}`
      )
      return
    }
    h.asks.set(ask.id, { ask, rpc: id, method, params })
    h.live.ask ??= ask
    this.options.onChange(h.session)
    this.options.onAsk?.(h.session, h.cwd, ask)
  }

  /** What Codex tells as the session goes */
  private told(h: Hosted, method: string, params: Record<string, unknown>) {
    switch (method) {
      case 'turn/started': {
        const id = (params.turn as { id?: unknown } | undefined)?.id
        if (typeof id === 'string') h.turn = id
        h.live.busy = true
        h.live.since ??= new Date().toISOString()
        this.options.onChange(h.session)
        return
      }
      case 'item/started':
      case 'item/completed':
        this.item(
          h,
          (params.item ?? {}) as Record<string, unknown>,
          method === 'item/completed'
        )
        return
      case 'item/agentMessage/delta':
        if (!h.live.busy || typeof params.delta !== 'string') return
        h.live.doing = 'writing'
        h.live.draft = ((h.live.draft ?? '') + params.delta).slice(-DRAFT_CHARS)
        this.liveSoon(h)
        return
      case 'thread/tokenUsage/updated': {
        const usage = params.tokenUsage as
          | (Parameters<typeof codexContext>[0] & {
              last?: Parameters<typeof codexSpend>[0]
            })
          | undefined
        const context = codexContext(usage)
        if (context) h.live.context = context
        if (h.live.busy && usage?.last)
          h.spent = addUsage(h.spent ?? NO_USAGE, codexSpend(usage.last))
        return
      }
      case 'turn/completed':
        this.turnDone(h, (params.turn ?? {}) as Record<string, unknown>)
        return
      case 'serverRequest/resolved': {
        // Answered another way: the turn it was on stopped
        for (const [key, asked] of h.asks)
          if (asked.rpc === params.requestId) h.asks.delete(key)
        h.live.ask = h.asks.values().next().value?.ask
        this.options.onChange(h.session)
        return
      }
      case 'error': {
        const error = params.error as { message?: unknown } | undefined
        if (params.willRetry !== true && typeof error?.message === 'string')
          h.live.error = error.message
        return
      }
      case 'thread/name/updated':
        if (typeof params.threadName === 'string' && params.threadName)
          h.name = params.threadName
        this.options.onChange(h.session)
        return
      case 'model/rerouted':
        if (typeof params.toModel === 'string') h.live.model = params.toModel
        return
    }
  }

  /** An item of its turn started or completed: what it does this moment */
  private item(h: Hosted, item: Record<string, unknown>, completed: boolean) {
    if (item.type === 'userMessage') {
      // Told as it starts and as it completes: read once
      const id = typeof item.id === 'string' ? item.id : undefined
      if (id && h.taken.has(id)) return
      if (id) h.taken.add(id)
      this.taken(h, codexSaid(item.content))
      return
    }
    if (item.type === 'reasoning') {
      if (completed) {
        if (h.live.doing === 'thinking') h.live.doing = undefined
      } else h.live.doing = 'thinking'
      this.options.onChange(h.session)
      return
    }
    if (item.type === 'agentMessage') {
      if (completed) {
        // Written in full: its log has it from now on
        if (typeof item.text === 'string' && item.text.trim())
          h.said = item.text
        h.live.step = undefined
        h.live.draft = undefined
        h.live.doing = undefined
      } else {
        h.live.doing = 'writing'
        h.live.draft = ''
      }
      this.options.onChange(h.session)
      return
    }
    const step = codexStep(item, h.cwd)
    if (!step) return
    if (item.type === 'fileChange' && typeof item.id === 'string' && !completed)
      h.files.set(
        item.id,
        ((item.changes ?? []) as { path?: unknown }[])
          .map((change) => change?.path)
          .filter((file): file is string => typeof file === 'string')
      )
    if (completed) {
      h.live.step = undefined
      h.live.doing = undefined
    } else {
      h.live.step = step
      h.live.doing = 'tool'
    }
    this.options.onChange(h.session)
  }

  /** Something you sent, told back as Codex reads it */
  private taken(h: Hosted, said: string) {
    const queued = h.live.queued ?? []
    if (!queued.length) return
    const text = said.slice(0, QUEUED_CHARS)
    const at = queued.findIndex((sent) => sent.text === text)
    const left = queued.filter((_, index) => index !== (at < 0 ? 0 : at))
    h.live.queued = left.length ? left : undefined
    this.options.onChange(h.session)
  }

  private turnDone(h: Hosted, turn: Record<string, unknown>) {
    const status = turn.status
    h.live.busy = false
    h.live.step = undefined
    h.live.doing = undefined
    h.live.draft = undefined
    h.live.since = undefined
    clearTimeout(h.liveSoon)
    h.liveSoon = undefined
    h.asks.clear()
    h.live.ask = undefined
    const error = (turn.error as { message?: unknown } | null | undefined)
      ?.message
    h.live.error =
      status === 'failed' && !h.stopping
        ? typeof error === 'string' && error
          ? error
          : (h.live.error ?? 'Codex stopped short.')
        : undefined
    if (h.spent && h.spent.input + h.spent.cacheRead + h.spent.output > 0)
      this.options.onSpent?.(h.session, h.spent)
    h.spent = undefined
    // What it never read is not waiting anymore: its turn is over
    h.live.queued = undefined
    if (status === 'completed' && !h.stopping)
      this.options.onDone?.(h.session, h.cwd, firstLine(h.said ?? ''))
    h.said = undefined
    h.stopping = false
    h.turn = undefined
    h.files.clear()
    h.taken.clear()
    this.idleEnd(h)
    this.settleSoon(h)
    this.options.onChange(h.session)
  }

  private settleSoon(h: Hosted): void {
    clearTimeout(h.settle)
    h.settled = undefined
    if (!this.options.logSize || !h.file) return
    const file = h.file
    h.settle = setTimeout(() => {
      h.settled = this.options.logSize?.(file)
    }, this.options.settleMs ?? SETTLE_MS)
    h.settle.unref?.()
  }

  /** Continued somewhere else since its turn here, while it rested */
  private movedOn(h: Hosted): boolean {
    if (h.live.busy || h.live.ask || h.settled === undefined || !h.file)
      return false
    const size = this.options.logSize?.(h.file)
    return size !== undefined && size !== h.settled
  }

  /** Ends its run and waits for it to go, so it writes no more to its log */
  private ended(h: Hosted): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, GONE_MS)
      h.proc.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      this.kill(h)
    })
  }

  private liveSoon(h: Hosted): void {
    if (h.liveSoon || !this.options.onLive) return
    h.liveSoon = setTimeout(() => {
      h.liveSoon = undefined
      if (this.hosted.get(h.session) === h)
        this.options.onLive?.(h.session, { ...h.live })
    }, LIVE_MS)
    h.liveSoon.unref?.()
  }

  private idleEnd(h: Hosted): void {
    clearTimeout(h.idle)
    h.idle = setTimeout(() => {
      if (!h.live.busy && !h.live.ask) this.end(h.session)
    }, this.options.idleMs ?? IDLE_MS)
    h.idle.unref?.()
  }

  private kill(h: Hosted): void {
    h.ending = true
    h.proc.stdin?.end()
    h.proc.kill('SIGTERM')
    this.forget(h)
  }

  private gone(h: Hosted, error: string | undefined): void {
    for (const pending of h.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(error ?? 'Codex stopped.'))
    }
    h.pending.clear()
    if (this.hosted.get(h.session) !== h) return
    if (error && !h.ending) {
      this.options.warn(`A Codex session Pacenote ran stopped: ${error}`)
      this.failed.set(h.session, error)
    }
    this.forget(h)
  }

  private forget(h: Hosted): void {
    clearTimeout(h.idle)
    clearTimeout(h.liveSoon)
    clearTimeout(h.settle)
    if (!h.session) return
    if (isCodexMode(h.live.mode)) this.modes.set(h.session, h.live.mode)
    if (h.file) this.logs.set(h.session, h.file)
    if (this.hosted.get(h.session) === h) {
      this.hosted.delete(h.session)
      this.options.onChange(h.session)
    }
  }
}

const line = (value: unknown) => `${JSON.stringify(value)}\n`

/** The first line said, for a notification */
const firstLine = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((each) => each.trim())
    .find(Boolean)
    ?.slice(0, 200) ?? ''

const lastLine = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((each) => each.trim())
    .filter(Boolean)
    .pop()
