import { randomBytes } from 'node:crypto'
import { readdirSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { writeJson } from '../json-file.js'
import { clip } from './events.js'
import type { Logger } from '../logger.js'
import {
  ARTIFACTS_DIR,
  dayDirFor,
  dayDirs,
  isSafeArtifactName,
  readRunFile,
  RUN_FILE,
  runDir,
  runIdFor,
  RUNS_DIR,
} from './layout.js'
import {
  RUN_RECORD_VERSION,
  type CollectionRunRecord,
  type HistoryRecord,
  type RunEvent,
  type RunKind,
  type RunRecord,
  type RunStatus,
} from './types.js'

/**
 * Max steps recorded per run. Past it, later steps are dropped with a single
 * note.
 */
const MAX_EVENTS = 2_000
const MAX_TEXT_CHARS = 20_000
const MAX_PROMPT_CHARS = 200_000
/** Interval for writing an in-progress record to the file */
const WRITE_DELAY_MS = 400

export type RunInit = Pick<RunRecord, 'origin' | 'request' | 'backend'>

export type CollectionInit = Pick<CollectionRunRecord, 'trigger' | 'backend'>

/**
 * Writes run history files: the bot writes the answers to mentions, the desktop
 * app the task collections it runs. Each leaves the other's runs alone.
 */
export class HistoryStore {
  constructor(
    readonly root: string,
    private readonly log?: Logger
  ) {}

  start(init: RunInit, now = new Date()): RunHandle {
    const id = runIdFor(now, randomBytes(3).toString('hex'))
    const at = now.toISOString()
    const record: RunRecord = {
      version: RUN_RECORD_VERSION,
      id,
      status: 'running',
      attempts: 1,
      startedAt: at,
      updatedAt: at,
      ...init,
      request: clip(init.request, MAX_TEXT_CHARS),
      context: { messages: 0 },
      attachments: [],
      events: [],
      outputs: [],
    }
    const handle = new RunHandle(record, runDir(this.root, id)!, this.log)
    handle.flush()
    return handle
  }

  /** A task collection's run, written by the desktop app */
  startCollection(
    init: CollectionInit,
    now = new Date()
  ): RunHandle<CollectionRunRecord> {
    const id = runIdFor(now, randomBytes(3).toString('hex'))
    const at = now.toISOString()
    const record: CollectionRunRecord = {
      version: RUN_RECORD_VERSION,
      kind: 'collection',
      id,
      status: 'running',
      attempts: 1,
      startedAt: at,
      updatedAt: at,
      ...init,
      events: [],
    }
    const handle = new RunHandle(record, runDir(this.root, id)!, this.log)
    handle.flush()
    return handle
  }

  /** Reopens an answer's record when resuming after a restart. */
  reopen(id: string): RunHandle | undefined {
    const record = this.read(id)
    if (!record || record.kind === 'collection') return undefined
    return new RunHandle(record, runDir(this.root, id)!, this.log)
  }

  read(id: string): HistoryRecord | undefined {
    const dir = runDir(this.root, id)
    return dir ? readRunFile(path.join(dir, RUN_FILE)) : undefined
  }

  /**
   * At startup, marks runs of a kind still left running that will not be
   * resumed as interrupted: the bot its answers, the desktop app its
   * collections. Ids in keep belong to runs that will be resumed, so they are
   * left alone.
   */
  interruptStale(
    keep: ReadonlySet<string>,
    now = new Date(),
    kind: RunKind = 'mention'
  ): number {
    const who = kind === 'mention' ? 'bot' : 'app'
    let count = 0
    for (const day of dayDirs(this.root).slice(0, 7)) {
      const dayDir = path.join(this.root, RUNS_DIR, day)
      for (const id of readdirSync(dayDir)) {
        if (keep.has(id)) continue
        const record = this.read(id)
        if (record?.status !== 'running') continue
        if ((record.kind ?? 'mention') !== kind) continue
        const handle = new RunHandle<HistoryRecord>(
          record,
          path.join(dayDir, id),
          this.log
        )
        handle.event({
          kind: 'note',
          at: now.toISOString(),
          text: `Interrupted because the ${who} restarted`,
        })
        handle.finish(
          'interrupted',
          { error: `Interrupted by ${who} restart` },
          now
        )
        count += 1
      }
    }
    return count
  }

  /** Deletes day directories past the retention period. 0 deletes nothing. */
  prune(retentionDays: number, now = new Date()): number {
    if (retentionDays <= 0) return 0
    const cutoff = dayDirFor(
      new Date(now.getTime() - retentionDays * 86_400_000)
    )
    let removed = 0
    for (const day of dayDirs(this.root)) {
      if (day >= cutoff) continue
      rmSync(path.join(this.root, RUNS_DIR, day), {
        recursive: true,
        force: true,
      })
      removed += 1
    }
    return removed
  }
}

/**
 * The record of one run. Batches changes briefly, then rewrites run.json in
 * full.
 */
export class RunHandle<R extends HistoryRecord = RunRecord> {
  private timer?: NodeJS.Timeout
  private dropped = false
  /**
   * Retried runs prefix tool call ids with the attempt number so they do not
   * collide.
   */
  private idPrefix: string

  constructor(
    readonly record: R,
    readonly dir: string,
    private readonly log?: Logger
  ) {
    this.idPrefix = record.attempts > 1 ? `${record.attempts}:` : ''
  }

  get id(): string {
    return this.record.id
  }

  /** Resumes after a restart. */
  resume(now = new Date()): void {
    this.record.attempts += 1
    this.idPrefix = `${this.record.attempts}:`
    this.record.status = 'running'
    delete this.record.finishedAt
    delete this.record.durationMs
    delete this.record.error
    this.event({
      kind: 'note',
      at: now.toISOString(),
      text: `Resumed after a bot restart (attempt ${this.record.attempts})`,
    })
  }

  patch(fields: Partial<Omit<R, 'id' | 'version' | 'events'>>): void {
    Object.assign(this.record, fields)
    this.schedule()
  }

  setPrompt(this: RunHandle<RunRecord>, system: string, user: string): void {
    this.patch({
      prompt: { system, user: clip(user, MAX_PROMPT_CHARS) },
    })
  }

  /**
   * Adds a step. Tool/command steps with the same id merge into the earlier
   * step. (start -> done)
   */
  event(event: RunEvent): void {
    const events = this.record.events
    if (event.kind === 'tool' || event.kind === 'command') {
      const id = `${this.idPrefix}${event.id}`
      const kind = event.kind
      const index = events.findIndex(
        (e) => e.kind === kind && 'id' in e && e.id === id
      )
      if (index >= 0) {
        const merged = { ...events[index] } as Record<string, unknown>
        for (const [key, value] of Object.entries(event)) {
          // claude tool results have empty server/tool names. Keeps the values
          // from the start.
          if (
            key === 'at' ||
            key === 'id' ||
            value === undefined ||
            value === ''
          )
            continue
          merged[key] = value
        }
        events[index] = merged as RunEvent
        this.schedule()
        return
      }
      event = { ...event, id }
    } else if (
      event.kind === 'message' ||
      event.kind === 'reasoning' ||
      event.kind === 'note'
    ) {
      event = { ...event, text: clip(event.text, MAX_TEXT_CHARS) }
    }
    if (events.length >= MAX_EVENTS) {
      if (!this.dropped) {
        this.dropped = true
        events.push({
          kind: 'note',
          at: new Date().toISOString(),
          text: 'Too many steps, later steps not recorded',
        })
      }
      return
    }
    events.push(event)
    this.schedule()
  }

  /** Saves an output (PNG etc.) to artifacts/ and returns the file name. */
  async saveArtifact(name: string, data: Buffer): Promise<string> {
    if (!isSafeArtifactName(name))
      throw new Error(`Invalid output name: ${name}`)
    const dir = path.join(this.dir, ARTIFACTS_DIR)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), data)
    return name
  }

  finish(
    status: Exclude<RunStatus, 'running'>,
    fields: Partial<R> = {},
    now = new Date()
  ): void {
    Object.assign(this.record, fields)
    this.record.status = status
    this.record.finishedAt = now.toISOString()
    this.record.durationMs = now.getTime() - Date.parse(this.record.startedAt)
    this.flush()
  }

  /**
   * Writes run.json now. Writes a temp file and renames it so no half-written
   * file is left.
   */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.record.updatedAt = new Date().toISOString()
    try {
      writeJson(path.join(this.dir, RUN_FILE), this.record)
    } catch (err) {
      // A history write failure must not block the answer.
      this.log?.warn(
        `Failed to save run history ${this.id}: ${(err as Error).message}`
      )
    }
  }

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), WRITE_DELAY_MS)
    this.timer.unref()
  }
}
