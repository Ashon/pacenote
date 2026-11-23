import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import {
  answerLine,
  askOf,
  type CanUseTool,
  contextOf,
  hostArgs,
  type HostStart,
  interruptLine,
  isSessionMode,
  modeLine,
  refuseLine,
  userLine,
} from '../../../src/sessions/live.js'
import type {
  SessionAsk,
  SessionAskKind,
  SessionLive,
  SessionMode,
} from '../../../src/sessions/types.js'
import { turnSpend } from '../../../src/history/spent.js'
import type { TokenUsage } from '../../../src/history/usage.js'
import { MINUTE, SECOND } from '../../../src/time.js'
import { stepLine } from './handoff.js'

/**
 * The Claude Code sessions Pacenote runs on this Mac (V2): each is the
 * installed claude, with your own sign-in, resuming the session's own
 * conversation (claude -p --resume, stream-json in and out) or starting a new
 * one with the id Pacenote gives it (--session-id, V5), so what you type
 * on its page goes to it and its asks come back to be answered there. Claude
 * Code keeps the conversation in its own log, as for any session; Pacenote
 * keeps nothing of it. A session runs while Pacenote does, the window closed
 * or not, until you end it or it has had nothing to do for a while.
 *
 * One conversation, typed into in one place at a time: Claude Code lets two
 * processes write one session, and then each goes on from what it knew, so
 * the conversation splits in two. Pacenote lets go of a session another place
 * opens while it rests (letGo), and one continued somewhere else since its
 * turn here resumes again from its log before what you type goes to it.
 */

/** A process as the host uses it: Node's, or a stand-in in tests */
export interface HostProcess {
  /** Its process id, as Claude Code lists it (claude agents) */
  pid?: number
  stdin: Writable | null
  stdout: Readable | null
  stderr: Readable | null
  kill(signal?: NodeJS.Signals): boolean
  on(event: 'exit', listener: (code: number | null) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

export interface SessionHostOptions {
  /** Claude Code's command (CLAUDE_BIN) */
  bin: () => string
  /** What it runs with: your environment, with the tools' PATH */
  env: () => NodeJS.ProcessEnv
  warn: (message: string) => void
  /** Something about a session changed: its page and the list read again */
  onChange: (session: string) => void
  /**
   * What it does this moment changed (the answer it writes grew): its page
   * shows it as it is, without reading again; at most every LIVE_MS
   */
  onLive?: (session: string, live: SessionLive) => void
  /** A session asks something: told as a notification when out of sight */
  onAsk?: (session: string, cwd: string, ask: SessionAsk) => void
  /**
   * A session's turn is done, with nothing more you sent left for it: told
   * as a notification when out of sight, with what it did in a line
   */
  onDone?: (session: string, cwd: string, did: string) => void
  /** What a turn spent, for the Overview's tokens per day */
  onSpent?: (session: string, usage: TokenUsage) => void
  /** How long a session with nothing to do keeps running */
  idleMs?: number
  /**
   * How big the session's log is now: grown since its turn here ended, it
   * was continued somewhere else in the meantime
   */
  logSize?: (session: string) => number | undefined
  /** How long after its turn its log has had all of it written */
  settleMs?: number
  /** Tests stand in for Claude Code */
  spawn?: (bin: string, args: string[], cwd: string) => HostProcess
}

/** A session Pacenote runs, as the list shows it */
export interface HostedSession {
  session: string
  cwd: string
  /** The name it started with: a task's title, until its log says one */
  name?: string
  busy: boolean
  asks?: SessionAskKind
  startedAt: string
  /** Its process, told apart from another that has the session open */
  pid?: number
}

interface Hosted {
  /** Its id: the copy's own once Claude Code names it */
  session: string
  cwd: string
  name?: string
  proc: HostProcess
  live: SessionLive
  /** Its asks, in the order they came, with what answering needs */
  asks: Map<string, { ask: SessionAsk; request: CanUseTool }>
  startedAt: string
  idle?: NodeJS.Timeout
  /** You stopped its turn: the turn's end is no error */
  stopping?: boolean
  /** You ended it, or Pacenote is quitting */
  ending?: boolean
  /** The end of what it wrote to stderr, for why it stopped */
  stderr: string
  /** A copy's id, once Claude Code names it */
  named?: (session: string) => void
  /** onLive, due once LIVE_MS is up */
  liveSoon?: NodeJS.Timeout
  /** Its log's size once its turn here was all written */
  settled?: number
  settle?: NodeJS.Timeout
  /** What Claude Code says its turn did, in a line, as the turn ends */
  did?: string
  /**
   * It told back something you sent: what is still queued at a turn's end
   * waits for its next. One that never does read it all (an older Claude Code)
   */
  replays?: boolean
}

/** How long a session with nothing to do keeps running */
const IDLE_MS = 30 * MINUTE
/** How long a copy has to say its id */
const NAMED_MS = 60 * SECOND
const STDERR_CHARS = 2000
/** How often the answer it writes is told at most, as it grows */
const LIVE_MS = 120
/** How much of the answer it writes is told: its page shows the end */
const DRAFT_CHARS = 12_000
/** How long after its turn Claude Code may still add to its log */
const SETTLE_MS = 5 * SECOND
/** How long an ended run has to go */
const GONE_MS = 5 * SECOND
/** How much of a message you sent its page shows while it waits */
const QUEUED_CHARS = 4000

export class SessionHost {
  private readonly hosted = new Map<string, Hosted>()
  /** Why a session's run stopped short, until you send it something again */
  private readonly failed = new Map<string, string>()

  constructor(private readonly options: SessionHostOptions) {}

  /** The session as Pacenote runs it; why its run failed; or none */
  get(session: string): SessionLive | undefined {
    const h = this.hosted.get(session)
    if (h) return { ...h.live }
    const error = this.failed.get(session)
    return error ? { busy: false, error } : undefined
  }

  has(session: string): boolean {
    return this.hosted.has(session)
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
   * Sends it what you typed, running it here first when it is not: it reads
   * it once the step it is on is done
   */
  async send(
    session: string,
    cwd: string,
    text: string
  ): Promise<{ error?: string }> {
    let running = this.hosted.get(session)
    let mode: SessionMode | undefined
    // Continued somewhere else since its turn here: what it knows is behind,
    // so it resumes again from its log as it is now, asking as it did
    if (running && this.movedOn(running)) {
      mode = isSessionMode(running.live.mode) ? running.live.mode : undefined
      await this.ended(running)
      running = undefined
    }
    const h =
      running ??
      this.start(session, cwd, { kind: 'resume', ...(mode ? { mode } : {}) })
    if ('error' in h) return h
    if (mode) h.live.mode = mode
    return this.write(h, userLine(text), true, text)
  }

  /**
   * Lets go of it while it rests, for another place that opened it: one
   * place types into a conversation at a time. Not while it is on a turn or
   * asks something
   */
  letGo(session: string): boolean {
    const h = this.hosted.get(session)
    if (!h || h.live.busy || h.live.ask) return false
    this.end(session)
    return true
  }

  /**
   * Starts a new session with the id given, in the folder, and sends it its
   * first message (V5): a task's, for one started from Todo
   */
  begin(
    session: string,
    cwd: string,
    text: string,
    options: { name?: string; mode?: SessionMode } = {}
  ): { error?: string } {
    if (this.hosted.has(session)) return { error: 'taken' }
    const h = this.start(session, cwd, { kind: 'new', ...options })
    if ('error' in h) return h
    if (options.mode) h.live.mode = options.mode
    return this.write(h, userLine(text), true, text)
  }

  /**
   * Continues a session open elsewhere in a copy run here (--fork-session):
   * the copy's id, once Claude Code names it
   */
  async copy(
    session: string,
    cwd: string,
    text: string
  ): Promise<{ session?: string; error?: string }> {
    const h = this.start(session, cwd, { kind: 'copy' })
    if ('error' in h) return h
    const named = new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), NAMED_MS)
      h.named = (id) => {
        clearTimeout(timer)
        resolve(id)
      }
    })
    const wrote = this.write(h, userLine(text), true, text)
    if (wrote.error) return wrote
    const id = await named
    if (!id) {
      this.end(h.session)
      return { error: this.failed.get(session) ?? 'Claude Code did not start.' }
    }
    return { session: id }
  }

  /** Your answer to what it asks; deny's message is what it reads why */
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
    const wrote = this.write(
      h,
      answerLine(ask, asked.request, answer, message),
      false
    )
    this.options.onChange(h.session)
    return wrote
  }

  /** Stops the turn it is on; it keeps running, for what you say next */
  stop(session: string): { error?: string } {
    const h = this.hosted.get(session)
    if (!h) return { error: 'gone' }
    if (!h.live.busy) return {}
    h.stopping = true
    return this.write(h, interruptLine(randomUUID()), false)
  }

  /** Changes how it asks before it acts */
  setMode(session: string, mode: SessionMode): { error?: string } {
    const h = this.hosted.get(session)
    if (!h) return { error: 'gone' }
    h.live.mode = mode
    this.options.onChange(h.session)
    return this.write(h, modeLine(randomUUID(), mode), false)
  }

  /**
   * Ends its run: the conversation stays in Claude Code's log, to resume
   * anywhere
   */
  end(session: string): void {
    const h = this.hosted.get(session)
    if (!h) return
    h.ending = true
    h.proc.stdin?.end()
    h.proc.kill('SIGTERM')
    this.forget(h)
  }

  /** Ends them all: Pacenote is quitting */
  endAll(): void {
    for (const session of [...this.hosted.keys()]) this.end(session)
  }

  private start(
    session: string,
    cwd: string,
    start: HostStart
  ): Hosted | { error: string } {
    this.failed.delete(session)
    let proc: HostProcess
    try {
      const args = hostArgs(session, start)
      proc = this.options.spawn
        ? this.options.spawn(this.options.bin(), args, cwd)
        : spawn(this.options.bin(), args, {
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
      ...(start.kind === 'new' && start.name ? { name: start.name } : {}),
      proc,
      live: { busy: false },
      asks: new Map(),
      startedAt: new Date().toISOString(),
      stderr: '',
    }
    // A copy is known by its own id once Claude Code names it
    if (start.kind !== 'copy') this.hosted.set(session, h)
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
        code
          ? lastLine(h.stderr) || `Claude Code stopped (${code}).`
          : undefined
      )
    )
    return h
  }

  /**
   * Writes a line to it; one you typed (said) waits as queued until Claude
   * Code reads it and tells it back (--replay-user-messages)
   */
  private write(
    h: Hosted,
    line: string,
    typed: boolean,
    said?: string
  ): { error?: string } {
    if (!h.proc.stdin?.writable) return { error: 'gone' }
    h.proc.stdin.write(line)
    if (said !== undefined)
      h.live.queued = [
        ...(h.live.queued ?? []),
        {
          text: said.slice(0, QUEUED_CHARS),
          at: new Date().toISOString(),
        },
      ]
    if (typed) {
      clearTimeout(h.idle)
      clearTimeout(h.settle)
      h.settled = undefined
      if (!h.live.busy) h.live.since = new Date().toISOString()
      h.live.busy = true
      h.live.error = undefined
      this.options.onChange(h.session)
    }
    return {}
  }

  private read(h: Hosted, raw: string): void {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    switch (event.type) {
      case 'system':
        if (event.subtype === 'init') {
          const id = event.session_id
          if (typeof id === 'string' && !this.hosted.has(id)) {
            // A copy, named: from now on known by its own id
            this.hosted.delete(h.session)
            h.session = id
            this.hosted.set(id, h)
            h.named?.(id)
            h.named = undefined
          }
          if (typeof event.permissionMode === 'string')
            h.live.mode = event.permissionMode
          if (typeof event.model === 'string') h.live.model = event.model
          h.live.busy = true
          h.live.since ??= new Date().toISOString()
          this.options.onChange(h.session)
        } else if (
          event.subtype === 'status' &&
          typeof event.permissionMode === 'string'
        ) {
          h.live.mode = event.permissionMode
          this.options.onChange(h.session)
        } else if (
          event.subtype === 'post_turn_summary' &&
          typeof event.status_detail === 'string'
        )
          h.did = event.status_detail
        return
      case 'assistant': {
        const content = (event.message as { content?: unknown } | undefined)
          ?.content
        if (!Array.isArray(content)) return
        for (const block of content as Record<string, unknown>[])
          if (block.type === 'tool_use') {
            h.live.step = {
              name: String(block.name ?? ''),
              text: stepLine(block.input),
            }
            h.live.doing = 'tool'
          } else if (block.type === 'text') {
            // Written in full: its log has it from now on
            h.live.step = undefined
            h.live.draft = undefined
            h.live.doing = undefined
          }
        h.live.busy = true
        this.options.onChange(h.session)
        return
      }
      case 'user':
        // What you sent, read now: no longer queued
        if (event.isReplay === true) {
          this.taken(h, event)
          return
        }
        // A step came back: on to the next
        if (h.live.doing === 'tool') {
          h.live.doing = undefined
          h.live.step = undefined
          this.options.onChange(h.session)
        }
        return
      case 'stream_event':
        this.streamed(h, event.event as Record<string, unknown> | undefined)
        return
      case 'control_request': {
        const id = event.request_id
        const request = event.request as { subtype?: string } | undefined
        if (typeof id !== 'string') return
        if (request?.subtype !== 'can_use_tool') {
          h.proc.stdin?.write(
            refuseLine(id, `Pacenote does not answer ${request?.subtype}.`)
          )
          return
        }
        const ask = askOf(id, request as CanUseTool, new Date().toISOString())
        h.asks.set(id, { ask, request: request as CanUseTool })
        h.live.ask ??= ask
        this.options.onChange(h.session)
        this.options.onAsk?.(h.session, h.cwd, ask)
        return
      }
      case 'result': {
        h.live.busy = false
        h.live.step = undefined
        h.live.doing = undefined
        h.live.draft = undefined
        h.live.since = undefined
        clearTimeout(h.liveSoon)
        h.liveSoon = undefined
        h.asks.clear()
        h.live.ask = undefined
        h.live.error =
          event.is_error && !h.stopping
            ? typeof event.result === 'string' && event.result
              ? event.result
              : String(event.subtype ?? 'error')
            : undefined
        const context = contextOf(event, h.live.model)
        if (context) h.live.context = context
        const spent = turnSpend(event)
        if (spent) this.options.onSpent?.(h.session, spent)
        if (!h.replays) h.live.queued = undefined
        // Done, with nothing you sent left for it to read
        if (!h.live.error && !h.stopping && !h.live.queued?.length)
          this.options.onDone?.(
            h.session,
            h.cwd,
            sentence(
              h.did ??
                (typeof event.result === 'string'
                  ? firstLine(event.result)
                  : '')
            )
          )
        h.did = undefined
        h.stopping = false
        this.idleEnd(h)
        this.settleSoon(h)
        this.options.onChange(h.session)
        return
      }
    }
  }

  /** Something you sent, told back as Claude Code reads it */
  private taken(h: Hosted, event: Record<string, unknown>): void {
    h.replays = true
    const queued = h.live.queued ?? []
    const content = (event.message as { content?: unknown } | undefined)
      ?.content
    const said =
      typeof content === 'string' ? content.slice(0, QUEUED_CHARS) : ''
    const at = queued.findIndex((sent) => sent.text === said)
    const left = queued.filter((_, index) => index !== (at < 0 ? 0 : at))
    h.live.queued = left.length ? left : undefined
    this.options.onChange(h.session)
  }

  /**
   * Keeps its log's size once Claude Code has written all of its turn: a log
   * that grew past it was continued somewhere else
   */
  private settleSoon(h: Hosted): void {
    clearTimeout(h.settle)
    h.settled = undefined
    if (!this.options.logSize) return
    h.settle = setTimeout(() => {
      h.settled = this.options.logSize?.(h.session)
    }, this.options.settleMs ?? SETTLE_MS)
    h.settle.unref?.()
  }

  /** Continued somewhere else since its turn here, while it rested */
  private movedOn(h: Hosted): boolean {
    if (h.live.busy || h.live.ask || h.settled === undefined) return false
    const size = this.options.logSize?.(h.session)
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
      this.end(h.session)
    })
  }

  /**
   * What the answer it writes says so far, and what it does this moment
   * (claude --include-partial-messages)
   */
  private streamed(
    h: Hosted,
    event: Record<string, unknown> | undefined
  ): void {
    if (!h.live.busy) return
    if (event?.type === 'content_block_start') {
      const block = event.content_block as Record<string, unknown> | undefined
      if (block?.type === 'thinking' || block?.type === 'redacted_thinking')
        h.live.doing = 'thinking'
      else if (block?.type === 'text') {
        h.live.doing = 'writing'
        h.live.draft = ''
      } else if (block?.type === 'tool_use') {
        h.live.doing = 'tool'
        h.live.step = { name: String(block.name ?? ''), text: '' }
      } else return
      this.options.onChange(h.session)
      return
    }
    if (event?.type !== 'content_block_delta') return
    const delta = event.delta as { type?: string; text?: unknown } | undefined
    if (delta?.type !== 'text_delta' || typeof delta.text !== 'string') return
    h.live.doing = 'writing'
    h.live.draft = ((h.live.draft ?? '') + delta.text).slice(-DRAFT_CHARS)
    this.liveSoon(h)
  }

  /** Tells what it does this moment, at most every LIVE_MS */
  private liveSoon(h: Hosted): void {
    if (h.liveSoon || !this.options.onLive) return
    h.liveSoon = setTimeout(() => {
      h.liveSoon = undefined
      if (this.hosted.get(h.session) === h)
        this.options.onLive?.(h.session, { ...h.live })
    }, LIVE_MS)
    h.liveSoon.unref?.()
  }

  /** Ends it once it has had nothing to do for a while */
  private idleEnd(h: Hosted): void {
    clearTimeout(h.idle)
    h.idle = setTimeout(() => {
      if (!h.live.busy && !h.live.ask) this.end(h.session)
    }, this.options.idleMs ?? IDLE_MS)
    h.idle.unref?.()
  }

  private gone(h: Hosted, error: string | undefined): void {
    if (this.hosted.get(h.session) !== h && !h.named) return
    if (error && !h.ending) {
      this.options.warn(`A session Pacenote ran stopped: ${error}`)
      this.failed.set(h.session, error)
    }
    h.named?.('')
    this.forget(h)
  }

  private forget(h: Hosted): void {
    clearTimeout(h.idle)
    clearTimeout(h.liveSoon)
    clearTimeout(h.settle)
    if (this.hosted.get(h.session) === h) this.hosted.delete(h.session)
    this.options.onChange(h.session)
  }
}

/** Claude Code's summary as a sentence, with a capital to start */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The first line said, for a notification */
const firstLine = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 200) ?? ''

const lastLine = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .pop()
