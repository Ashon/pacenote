import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Config } from '../config.js'
import type { HistoryStore, RunHandle } from '../history/recorder.js'
import { getLocale, localized, type Locale } from '../i18n/locale.js'
import { redactAnswer } from '../broker/redact.js'
import type { Logger } from '../logger.js'
import {
  mentionKey,
  type ContextMessage,
  type Mark,
  type Mention,
  type Messenger,
  type MessengerId,
  type Request,
  type Upload,
} from '../messengers/types.js'
import { formatTime } from '../messengers/text.js'
import type { Reasoner } from '../reasoners/types.js'
import {
  composeAnswer,
  extractDiagrams,
  type DiagramRenderer,
} from '../render/diagrams.js'
import {
  attachmentSection,
  loadAttachments,
  planAttachments,
  type LoadedDocument,
  type SavedImage,
  type SkippedFile,
} from './attachments.js'
import {
  attachmentsLog,
  contextLines,
  fileCandidates,
  recent,
} from './conversation.js'
import { failureAdvice, failureCause, failureReply } from './failure.js'
import { collectGeneratedImages } from './generated.js'
import {
  resumeDecision,
  type InflightEntry,
  type InflightStore,
} from './inflight.js'
import { ConcurrencyLimiter } from './limiter.js'
import { systemPrompt, userPrompt } from './prompt.js'
import { text } from './responder.text.js'
import { recordAttachments, recordOutputs } from './run-record.js'
import { CLI_NAMES } from '../tasks/own-ai.js'

/** Run queue limit. Beyond it, the bot replies that it is busy. */
const MAX_QUEUE = 10
/**
 * How long after it starts working a marked mention also gets the slow mark
 * (⏳)
 */
const SLOW_AFTER_MS = 90_000
/** The marks that say a request is under way, taken off once it settles */
const PROGRESS: readonly Mark[] = ['waiting', 'working', 'slow']

/**
 * The line under every answer. Everyone in the channel reads it, not only the
 * person Pace answers, so it says an AI wrote it and with what (Korea's AI
 * Basic Act, Article 31; Anthropic's Usage Policy). locale: Pace's notes
 * language.
 */
export function aiNote(
  backend: Reasoner['backend'],
  locale: Locale = 'en'
): string {
  return localized(text, locale).aiNote(CLI_NAMES[backend])
}

/** The requests being answered and answered so far (bot status file) */
type Requests = { active: number; handled: number; lastAt?: string }

interface MentionResponderDeps {
  config: Config
  /**
   * The connected messengers; each mention is answered through the one it came
   * from
   */
  messengers: readonly Messenger[]
  reasoner: Reasoner
  log: Logger
  /** Extracts PDF text (in the sandbox, when there is one) */
  extractPdfText(pdfPath: string): Promise<string>
  /**
   * When set, renders diagram/chart blocks in the answer and posts them to the
   * thread.
   */
  renderer?: DiagramRenderer
  /** Record of in-progress requests. They are resumed after a restart. */
  inflight?: InflightStore
  /** Run history. Viewed in the desktop app. */
  history?: HistoryStore
  /**
   * Secret values this Pacenote holds (secretValues in src/settings/fields.ts),
   * redacted from answers before they are posted
   */
  secrets?: readonly string[]
  /** When a mention gets the slow mark. Default SLOW_AFTER_MS (for tests) */
  slowAfterMs?: number
  /**
   * Each asker runs this Pace themselves: the team hub routes a member's
   * mentions to their own Mac. A failure then tells them what to fix.
   */
  ownMentions?: boolean
  /**
   * Why the reasoner cannot answer, for the status: a failure that lasts until
   * fixed (a rejected sign-in, a usage limit), or undefined once it answers
   * again
   */
  onReasoner?: (problem: string | undefined) => void
  /**
   * Called whenever the active/handled request counts change. (bot status file)
   */
  onActivity?: (requests: Requests) => void
}

/**
 * At startup, temporary attachment directories older than this are treated as
 * leftovers of interrupted requests and removed.
 */
const STALE_ATTACHMENTS_MS = 60 * 60_000

/**
 * Whether Pace answers this asker: only its owner, you. With no owner known
 * yet, no one.
 */
export function isOwner(
  mention: Pick<Mention, 'userId'>,
  owner: string | undefined
): boolean {
  return Boolean(owner) && mention.userId === owner
}

/** How a request was taken on, which says what the asker is told */
type Taking = 'now' | 'queued' | 'resumed'

interface Figure {
  figure: number
  png: Buffer
  raw: string
}

/** The attachments passed to the reasoner, and those it cannot read */
interface Attachments {
  images: SavedImage[]
  documents: LoadedDocument[]
  unreadable: SkippedFile[]
}

/** A request being answered, as the stages of answering it share it */
interface Answering {
  messenger: Messenger
  /** The request as it was taken on */
  taken: InflightEntry
  /** The request as recorded for a restart, kept up to date */
  entry: InflightEntry
  /** Marks to take off when done */
  marks: Mark[]
  /** Holds the slow mark back, or waits for it while it is being put */
  stopSlow(): Promise<void>
  /**
   * Its own folder: the attachments downloaded, the images generated and the
   * diagrams rendered. Removed when done.
   */
  dir: string
  /** Where the images the reasoner generates land, in dir */
  outputDir: string
  /** Cuts its reasoner run off, to shut down */
  cutOff: AbortController
  run?: RunHandle
  /** Only the reasoner's own errors say something about the reasoner. */
  reasoning: boolean
}

/**
 * Answers a mention from any messenger: collects the conversation, passes it to
 * the local CLI (claude or codex), and posts the answer to the same thread as
 * the bot. Everything messenger-specific goes through Messenger.
 *
 * The thread gets only answers, as new replies that notify. How Pace is doing
 * shows as reactions on the mention (📥 waiting its turn, 👀 working, ⏳ slow,
 * ⚠️ failed), and what only the asker needs (why it failed, that it is busy)
 * goes to them alone. A messenger that cannot react tells the asker it is
 * working the same way.
 *
 * A mention is recorded (InflightStore) and marked as soon as it is taken on,
 * also while it waits its turn, so a restart picks it up again.
 */
export class MentionResponder {
  private readonly limiter: ConcurrencyLimiter
  private readonly seen = new Set<string>()
  /** Cuts off the reasoner runs in progress, to shut down */
  private readonly running = new Set<AbortController>()
  /** Set once shutting down: nothing more starts */
  private stopping = false
  private readonly messengers: Map<MessengerId, Messenger>
  private readonly requests: Requests = { active: 0, handled: 0 }

  /**
   * Where attachment images are downloaded temporarily: the data folder
   * (PACENOTE_DATA_DIR), shared into the sandbox's VM.
   */
  private readonly attachmentsRoot: string

  constructor(private readonly deps: MentionResponderDeps) {
    this.attachmentsRoot = path.join(deps.config.dataDir, 'attachments')
    this.limiter = new ConcurrencyLimiter(
      deps.config.mention.concurrency,
      MAX_QUEUE
    )
    this.messengers = new Map(
      deps.messengers.map((messenger) => [messenger.id, messenger])
    )
  }

  /** What Pace says itself in the conversation, in its notes language */
  private notes() {
    return localized(text, this.deps.config.notesLocale)
  }

  async handle(mention: Mention): Promise<void> {
    const { log } = this.deps
    const messenger = this.messengers.get(mention.messenger)
    if (!messenger) return

    // Handles redelivered events only once.
    const key = mentionKey(mention)
    if (this.seen.has(key)) return
    this.seen.add(key)
    if (this.seen.size > 1000)
      this.seen.delete(this.seen.values().next().value!)

    const t = this.notes()
    const say = (markdown: string) => messenger.render(markdown)[0] ?? ''
    if (!isOwner(mention, messenger.owner)) {
      log.info(
        `Ignoring mention from someone other than the owner: ${mention.userId}${mention.external ? ' (outside the workspace)' : ''} in ${mention.conversation}`
      )
      await messenger.notice(mention, say(t.notOwner))
      return
    }
    const venue = await messenger.venue(mention)
    if (!venue.answerable) {
      await messenger.notice(mention, say(venue.refusal ?? t.notHere))
      return
    }

    // Only the asker needs to know, so the conversation stays as it was.
    if (this.limiter.full) {
      await messenger.notice(mention, say(t.busy))
      return
    }
    const entry: InflightEntry = {
      key,
      mention,
      label: venue.label,
      attempts: 0,
      startedAt: Date.now(),
    }
    this.record(entry)
    // While shutting down, it is kept for the next start.
    const waits = this.stopping || this.limiter.saturated
    const taken = this.take(messenger, entry, waits ? 'queued' : 'now', waits)
    if (!this.stopping)
      this.limiter.tryRun(async () =>
        this.respond(messenger, entry, await taken)
      )
    await taken
  }

  /**
   * Shows the asker the request is taken on: the waiting or working mark, or
   * where the messenger cannot react, a notice. Returns the mark it put.
   */
  private async take(
    messenger: Messenger,
    entry: InflightEntry,
    taking: Taking,
    waits: boolean
  ): Promise<Mark | undefined> {
    const { reasoner } = this.deps
    const { mention } = entry
    const t = this.notes()
    const mark: Mark = waits ? 'waiting' : 'working'
    const marked = Boolean(
      await messenger.mark?.(mention, mark).catch(() => false)
    )
    // Picked up again after a restart, it starts over: marks it had then go.
    if (taking === 'resumed')
      for (const stale of PROGRESS)
        if (stale !== mark) await messenger.unmark?.(mention, stale)
    if (!marked) {
      const where = `\`${reasoner.backend}@${reasoner.sandbox}\``
      await messenger
        .notice(mention, messenger.render(t.taking[taking](where))[0] ?? '')
        .catch(() => undefined)
    }
    return marked ? mark : undefined
  }

  /** Records a request so a restart picks it up again. */
  private record(entry: InflightEntry): void {
    try {
      this.deps.inflight?.upsert(entry)
    } catch (err) {
      this.deps.log.warn(
        `Could not record ${entry.key} for a restart: ${(err as Error).message}`
      )
    }
  }

  /**
   * Answers a request once its turn comes, stage by stage: reads the
   * conversation, loads the attachments, runs the reasoner and posts the
   * answer. Cut off to shut down, it stays for the next start; any other
   * failure is the asker's to know.
   */
  private async respond(
    messenger: Messenger,
    taken: InflightEntry,
    put: Mark | undefined
  ) {
    // Taken on while shutting down: it stays recorded for the next start.
    if (this.stopping) return
    const job = await this.begin(messenger, taken, put)
    /** Whether it was cut off to shut down, and stays for the next start */
    let kept = false
    try {
      const { request, context, lines } = await this.gather(job)
      const attachments = await this.attach(job, context)
      const answer = await this.reason(job, request, lines, attachments)
      await this.post(job, answer)
      job.run?.finish('succeeded')
    } catch (err) {
      kept = job.reasoning && job.cutOff.signal.aborted
      if (kept) this.keep(job)
      else await this.reportFailure(job, err)
    } finally {
      await this.settle(job, kept)
    }
  }

  /**
   * Starts answering a request whose turn came: the mention shows it working
   * instead of waiting, the slow mark is set to come, and it counts as active.
   */
  private async begin(
    messenger: Messenger,
    taken: InflightEntry,
    put: Mark | undefined
  ): Promise<Answering> {
    const { mention } = taken
    // Its turn came: the mention shows it working instead of waiting.
    let working = put === 'working'
    if (put === 'waiting') {
      const [marked] = await Promise.all([
        messenger.mark?.(mention, 'working').catch(() => false),
        messenger.unmark?.(mention, 'waiting'),
      ])
      working = Boolean(marked)
    }
    // Marks to take off when done. The slow mark comes once the answer takes
    // long, counted from when it started working.
    const marks: Mark[] = working ? ['working'] : []
    let slowing: Promise<void> | undefined
    const slow = working
      ? setTimeout(() => {
          slowing = messenger
            .mark?.(mention, 'slow')
            .then((ok) => {
              if (ok) marks.push('slow')
            })
            .catch(() => undefined)
        }, this.deps.slowAfterMs ?? SLOW_AFTER_MS)
      : undefined
    this.requests.active += 1
    this.requests.lastAt = new Date().toISOString()
    this.deps.onActivity?.({ ...this.requests })
    const dir = path.join(this.attachmentsRoot, randomUUID())
    const cutOff = new AbortController()
    this.running.add(cutOff)
    return {
      messenger,
      taken,
      entry: taken,
      marks,
      stopSlow: async () => {
        clearTimeout(slow)
        await slowing
      },
      dir,
      outputDir: path.join(dir, 'generated'),
      cutOff,
      reasoning: false,
    }
  }

  /**
   * Reads the request and the conversation it is in, and opens its run (or
   * reopens it, resumed after a restart).
   */
  private async gather(job: Answering) {
    const { messenger, taken } = job
    const { mention, label } = taken
    // Read alongside the request and the run; a failure surfaces where it
    // is awaited.
    const reading = messenger.context(mention, [mention.message])
    reading.catch(() => undefined)
    const request = await messenger.request(mention)
    job.run = this.openRun(messenger, mention, label, request, taken.runId)
    this.note(job, { runId: job.run?.id, attempts: taken.attempts + 1 })
    const { context, left } = recent(await reading)
    job.run?.patch({ context: { messages: context.length } })
    return {
      request,
      context,
      lines: contextLines(context, left, this.deps.config.timezone),
    }
  }

  /**
   * Loads the files attached to the request and the conversation: images for
   * the reasoner to see, documents as text, and those it cannot read.
   */
  private async attach(
    job: Answering,
    context: readonly ContextMessage[]
  ): Promise<Attachments> {
    const { messenger, taken, run } = job
    // Passes the request message attachments first, then recent attachments
    // in the thread.
    const candidates = fileCandidates(
      taken.mention.files,
      context,
      this.deps.config.timezone
    )
    const files = await messenger.resolveFiles(candidates.map((c) => c.file))
    const resolved = candidates.map((candidate, i) => ({
      ...candidate,
      file: files[i]!,
    }))
    const { planned, skipped } = planAttachments(resolved)
    const { images, documents, failed } = await loadAttachments(planned, {
      dir: job.dir,
      download: (file) => messenger.download(file),
      extractPdfText: this.deps.extractPdfText,
    })
    const unreadable = [...skipped, ...failed]
    if (run) await recordAttachments(run, images, documents, skipped, failed)
    if (resolved.length > 0) {
      this.deps.log.info(
        attachmentsLog(
          resolved.length,
          images.length,
          documents.length,
          unreadable
        )
      )
    }
    return { images, documents, unreadable }
  }

  /**
   * Runs the reasoner with its tools on the request, the conversation and the
   * attachments, and returns its answer as it is to be posted.
   */
  private async reason(
    job: Answering,
    request: Request,
    lines: string[],
    { images, documents, unreadable }: Attachments
  ): Promise<string> {
    const { config, reasoner, log } = this.deps
    const { messenger, taken, run } = job
    const { key, mention, label } = taken
    const prompt = userPrompt({
      venue: label,
      context: lines,
      author: request.author,
      request: request.text,
      attachments: attachmentSection(images, documents, unreadable),
    })
    const readOnlyDir = reasoner.canReadFiles
      ? config.mention.workspace
      : undefined
    // Images generated by codex land here, so the folder must exist before
    // it is shared into the VM.
    await mkdir(job.outputDir, { recursive: true })
    const started = Date.now()
    const requester = {
      user: mention.userId,
      conversation: mention.conversation,
      label,
      thread: mention.thread,
      run: run?.id,
      message: mention.message,
      permalink: messenger.permalink(mention, mention.message),
    }
    const system = systemPrompt(messenger.profile, {
      canReadWorkspace: readOnlyDir !== undefined,
      opsTools: reasoner.mcpServerNames.includes('ops'),
      ownTools: reasoner.mcpServerNames.includes('pacenote'),
      yourServers: reasoner
        .yourServers?.(requester)
        .map((server) => server.name),
      diagrams: this.deps.renderer !== undefined,
      imageGeneration: reasoner.backend === 'codex',
      // The app tells Pace its language (PACENOTE_LOCALE, src/index.ts)
      language: getLocale(),
    })
    run?.setPrompt(system, prompt)
    job.reasoning = true
    const written = await reasoner.complete({
      system,
      prompt,
      readOnlyDir,
      images: images.map(({ path, mimetype }) => ({ path, mimetype })),
      outputDir: job.outputDir,
      signal: job.cutOff.signal,
      onEvent: run ? (step) => run?.event(step) : undefined,
      requester,
    })
    job.reasoning = false
    this.deps.onReasoner?.(undefined)
    // The thread is public: secrets go before anything is posted, and the
    // run keeps the answer as posted.
    const answer = this.redact(job, written)
    run?.patch({ answer })
    log.info(
      `Answered mention ${key} (${reasoner.backend}@${reasoner.sandbox}, ${Date.now() - started}ms)`
    )
    return answer
  }

  /**
   * The answer without the secrets this Pacenote holds; how many went is in
   * the log and the run.
   */
  private redact(job: Answering, written: string): string {
    const { text: answer, count: redacted } = redactAnswer(
      written,
      this.deps.secrets
    )
    if (redacted > 0) {
      this.deps.log.warn(
        `Redacted ${redacted} ${redacted === 1 ? 'secret' : 'secrets'} from the answer to ${job.taken.key}`
      )
      job.run?.event({
        kind: 'note',
        at: new Date().toISOString(),
        text: `Redacted ${redacted} ${redacted === 1 ? 'secret' : 'secrets'} from the answer before posting it.`,
      })
    }
    return answer
  }

  /**
   * Posts the answer to the thread with the line under it, then the images
   * the reasoner generated and the diagrams rendered from the answer.
   */
  private async post(job: Answering, answer: string): Promise<void> {
    const { config, reasoner, log } = this.deps
    const { messenger, run } = job
    const { mention } = job.taken
    const { text, figures } = await this.renderDiagrams(answer, job.dir)
    // Once any of it is in the thread, a restart does not answer again.
    this.note(job, { answer: 'posting' })
    const said = text.trim() ? `${text}\n\n` : ''
    for (const chunk of messenger.render(
      said + aiNote(reasoner.backend, config.notesLocale)
    ))
      await messenger.post(mention, chunk)
    this.note(job, { answer: 'posted' })
    const generated = await this.shrinkImages(
      await collectGeneratedImages(job.outputDir),
      job.dir
    )
    if (run) await recordOutputs(run, generated, figures, log)
    if (!(await this.postImages(messenger, mention, generated, figures))) {
      run?.event({
        kind: 'error',
        at: new Date().toISOString(),
        message: 'Image upload failed (check files:write)',
      })
    }
  }

  /** Notes a request cut off to shut down, which resumes on the next start */
  private keep(job: Answering): void {
    // The run stays open: the next start resumes it, or marks it
    // interrupted.
    this.deps.log.info(
      `Stopped answering ${job.taken.key} to shut down; it resumes on the next start.`
    )
    job.run?.event({
      kind: 'note',
      at: new Date().toISOString(),
      text: 'Stopped to shut down; resumes on the next start.',
    })
  }

  /**
   * Records why a request failed and tells the asker alone what it means. A
   * failure that lasts until fixed also goes to the status.
   */
  private async reportFailure(job: Answering, err: unknown): Promise<void> {
    const { config, reasoner, log } = this.deps
    const { messenger, run } = job
    const { key, mention } = job.taken
    log.error(`Failed to answer mention ${key}`, err)
    const error = (err as Error).message
    const cause = job.reasoning ? failureCause(error) : 'other'
    run?.finish('failed', {
      error,
      ...(cause === 'other' ? {} : { cause }),
    })
    const advice = failureAdvice(cause, reasoner.backend, reasoner.sandbox)
    // The status is the app's, so it is in the app's language.
    if (advice?.lasting)
      this.deps.onReasoner?.(
        localized(text).lastAt(
          advice.text,
          formatTime(Date.now(), config.timezone)
        )
      )
    // ⚠️ on the mention, and what it means to the asker alone; the error
    // itself stays in the log and the run history.
    await this.fail(
      messenger,
      mention,
      failureReply(cause, reasoner.backend, {
        own: this.deps.ownMentions,
        timeoutMs: config.reasoner.timeoutMs,
        locale: config.notesLocale,
      })
    )
  }

  /**
   * Settles a request once answering it ends. Kept for the next start, its
   * marks and its record stay; otherwise they go, and it counts as handled.
   * Its folder goes either way.
   */
  private async settle(job: Answering, kept: boolean): Promise<void> {
    const { messenger, taken } = job
    this.running.delete(job.cutOff)
    await job.stopSlow()
    if (kept) {
      // The marks stay, and the attempt it did not get to finish does not
      // count.
      this.note(job, { attempts: taken.attempts })
    } else {
      await Promise.all(
        job.marks.map((mark) => messenger.unmark?.(taken.mention, mark))
      )
      this.forget(taken.key)
      this.requests.handled += 1
    }
    await rm(job.dir, { recursive: true, force: true })
    this.requests.active -= 1
    this.deps.onActivity?.({ ...this.requests })
  }

  /** Keeps the restart record of a request being answered up to date */
  private note(job: Answering, patch: Partial<InflightEntry>): void {
    job.entry = { ...job.entry, ...patch }
    this.record(job.entry)
  }

  private forget(key: string): void {
    try {
      this.deps.inflight?.remove(key)
    } catch (err) {
      this.deps.log.warn(
        `Could not clear ${key} from the restart record: ${(err as Error).message}`
      )
    }
  }

  /**
   * Cleans up interrupted requests at startup. Each is resumed once, and
   * requests that were already retried or are too old are reported as failed.
   * One whose answer was already posting is not answered again.
   */
  async resumePending(): Promise<void> {
    const { inflight, log, history } = this.deps
    await this.cleanupStaleAttachments()
    const entries = inflight?.list() ?? []
    const resumable = (entry: InflightEntry) =>
      this.messengers.has(entry.mention.messenger) &&
      !entry.answer &&
      resumeDecision(entry) === 'resume'
    // Keeps the runs of requests to resume or that were answered, and marks
    // the other runs still left as running as interrupted.
    const keep = new Set(
      entries.flatMap((entry) =>
        entry.runId && (entry.answer === 'posted' || resumable(entry))
          ? [entry.runId]
          : []
      )
    )
    const interrupted = history?.interruptStale(keep) ?? 0
    if (interrupted > 0)
      log.info(
        `Marked ${interrupted} ${interrupted === 1 ? 'run' : 'runs'} as interrupted.`
      )
    if (!inflight) return
    for (const entry of entries) {
      const interrupt = (error: string) =>
        entry.runId &&
        history?.reopen(entry.runId)?.finish('interrupted', { error })
      this.seen.add(entry.key)
      const messenger = this.messengers.get(entry.mention.messenger)
      if (!messenger) {
        // Asked in a messenger the bot no longer connects to: nothing to answer
        // through.
        this.forget(entry.key)
        log.warn(
          `Dropping interrupted request ${entry.key}: ${entry.mention.messenger} is not connected`
        )
        continue
      }
      if (entry.answer) {
        this.forget(entry.key)
        await this.clearMarks(messenger, entry.mention)
        if (entry.answer === 'posted') {
          // Only the images, if any, and the cleanup were left.
          log.info(`Already answered ${entry.key} before the restart`)
          const run = entry.runId ? history?.read(entry.runId) : undefined
          if (run?.status === 'running')
            history?.reopen(run.id)?.finish('succeeded')
          continue
        }
        log.warn(`Restarted while posting the answer to ${entry.key}`)
        await this.fail(messenger, entry.mention, this.notes().cutShort)
        continue
      }
      // Waiting since before Pace answered only you: not taken up for anyone
      // else.
      if (!isOwner(entry.mention, messenger.owner)) {
        this.forget(entry.key)
        await this.clearMarks(messenger, entry.mention)
        interrupt('Not resumed: Pace answers only the person it works for')
        log.warn(
          `Dropping ${entry.key}: it was asked by someone other than the owner`
        )
        continue
      }
      if (resumeDecision(entry) === 'give_up') {
        this.forget(entry.key)
        log.warn(
          `Giving up on interrupted request ${entry.key} (${entry.attempts} ${entry.attempts === 1 ? 'attempt' : 'attempts'})`
        )
        await this.giveUp(messenger, entry.mention)
        continue
      }
      if (this.limiter.full) {
        this.forget(entry.key)
        await this.giveUp(messenger, entry.mention)
        interrupt('Could not resume because the queue was full')
        continue
      }
      log.info(
        entry.attempts === 0
          ? `Taking up ${entry.key}, which was waiting its turn`
          : `Resuming interrupted request ${entry.key} (attempt ${entry.attempts + 1})`
      )
      const taken = this.take(
        messenger,
        entry,
        'resumed',
        this.limiter.saturated
      )
      this.limiter.tryRun(async () =>
        this.respond(messenger, entry, await taken)
      )
      await taken
    }
  }

  /**
   * Waits for active requests to finish. Returns whether they all did.
   */
  async drain(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (this.limiter.busy && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return !this.limiter.busy
  }

  /**
   * Stops to shut down. Nothing waiting starts, requests being answered get
   * graceMs to finish, and the rest are cut off, their reasoner runs stopped.
   * Requests not answered stay recorded and resume on the next start. Returns
   * whether every request settled in time.
   */
  async stop(graceMs: number, cutOffMs = 8_000): Promise<boolean> {
    this.stopping = true
    this.limiter.clear()
    if (await this.drain(graceMs)) return true
    for (const run of this.running) run.abort()
    return this.drain(cutOffMs)
  }

  /**
   * Starts a run, or reopens the existing run when resuming after a restart.
   */
  private openRun(
    messenger: Messenger,
    mention: Mention,
    label: string,
    request: Request,
    runId?: string
  ): RunHandle | undefined {
    const { history, reasoner, config, log } = this.deps
    if (!history) return undefined
    try {
      const reopened = runId ? history.reopen(runId) : undefined
      if (reopened) {
        reopened.resume()
        return reopened
      }
      return history.start({
        origin: {
          messenger: mention.messenger,
          conversation: mention.conversation,
          conversationLabel: label,
          thread: mention.thread,
          message: mention.message,
          permalink: messenger.permalink(mention, mention.message),
          userId: mention.userId,
          userName: request.userName,
        },
        request: request.text,
        backend: {
          reasoner: reasoner.backend,
          sandbox: reasoner.sandbox,
          model: config.reasoner.model,
        },
      })
    } catch (err) {
      log.warn(`Failed to start a run: ${(err as Error).message}`)
      return undefined
    }
  }

  /** ⚠️ on the mention, and what it says to the asker alone */
  private async fail(
    messenger: Messenger,
    mention: Mention,
    markdown: string
  ): Promise<void> {
    await messenger.mark?.(mention, 'failed').catch(() => false)
    await messenger
      .notice(mention, messenger.render(markdown)[0] ?? '')
      .catch(() => undefined)
  }

  /** A request cut off by a restart that will not be answered after all */
  private async giveUp(messenger: Messenger, mention: Mention): Promise<void> {
    await this.clearMarks(messenger, mention)
    await this.fail(messenger, mention, this.notes().cutOff)
  }

  /** Takes the marks off a mention that will not be answered after all */
  private async clearMarks(
    messenger: Messenger,
    mention: Mention
  ): Promise<void> {
    for (const mark of PROGRESS) await messenger.unmark?.(mention, mark)
  }

  private async cleanupStaleAttachments(): Promise<void> {
    const now = Date.now()
    for (const name of await readdir(this.attachmentsRoot).catch(
      () => [] as string[]
    )) {
      const dir = path.join(this.attachmentsRoot, name)
      const info = await stat(dir).catch(() => undefined)
      if (info?.isDirectory() && now - info.mtimeMs > STALE_ATTACHMENTS_MS) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  }

  /**
   * Renders the diagram blocks in the answer. Failed blocks keep their source,
   * and without a renderer the answer is unchanged.
   */
  private async renderDiagrams(
    answer: string,
    workDir: string
  ): Promise<{ text: string; figures: Figure[] }> {
    const { renderer, log } = this.deps
    const blocks = renderer ? extractDiagrams(answer) : []
    if (!renderer || blocks.length === 0) return { text: answer, figures: [] }

    const dir = path.join(workDir, 'renders')
    const figures: Figure[] = []
    const results: { block: (typeof blocks)[number]; figure?: number }[] = []
    for (const [i, block] of blocks.entries()) {
      try {
        const png = await renderer.render(block, dir, `figure-${i + 1}`)
        const figure = figures.length + 1
        figures.push({ figure, png, raw: block.raw })
        results.push({ block, figure })
      } catch (err) {
        log.warn(
          `Failed to render diagram ${i + 1} (${block.format}): ${(err as Error).message.slice(0, 300)}`
        )
        results.push({ block })
      }
    }
    return {
      text: composeAnswer(answer, results, this.deps.config.notesLocale),
      figures,
    }
  }

  /**
   * Shrinks generated images to the configured size (long edge). Uses the
   * original without a renderer or on failure.
   */
  private async shrinkImages(
    images: Buffer[],
    workDir: string
  ): Promise<Buffer[]> {
    const { renderer, config, log } = this.deps
    const maxPx = config.render.generatedMaxPx
    if (!renderer || maxPx === 0) return images
    const dir = path.join(workDir, 'resized')
    return Promise.all(
      images.map((image, i) =>
        renderer
          .resize(image, dir, `image-${i + 1}`, maxPx)
          .catch((err: unknown) => {
            log.warn(
              `Failed to resize generated image ${i + 1}, posting the original: ${(err as Error).message}`
            )
            return image
          })
      )
    )
  }

  /**
   * Posts generated images and rendered diagrams to the thread. When the upload
   * fails, posts the diagram sources instead and returns false.
   */
  private async postImages(
    messenger: Messenger,
    mention: Mention,
    generated: Buffer[],
    figures: Figure[]
  ): Promise<boolean> {
    const t = this.notes()
    const uploads: (Upload & { raw?: string })[] = [
      ...generated.map((data, i) => ({
        data,
        filename: `image-${i + 1}.png`,
        title: t.generatedImage(i + 1),
      })),
      ...figures.map(({ figure, png, raw }) => ({
        data: png,
        filename: `figure-${figure}.png`,
        title: t.figure(figure),
        raw,
      })),
    ]
    if (uploads.length === 0) return true
    try {
      await messenger.upload(mention, uploads)
      return true
    } catch (err) {
      this.deps.log.error('Image upload failed (check files:write)', err)
      const sources = uploads
        .filter((upload) => upload.raw)
        .map(
          (upload) =>
            `${t.sourceOf(upload.title)}\n\`\`\`\n${upload.raw}\n\`\`\``
        )
        .join('\n\n')
      // The sources are part of the answer; that the upload failed is the
      // asker's to know.
      await messenger
        .notice(
          mention,
          messenger.render(
            sources ? t.uploadFailedSources : t.uploadFailed
          )[0] ?? ''
        )
        .catch(() => undefined)
      if (sources)
        for (const chunk of messenger.render(sources))
          await messenger.post(mention, chunk).catch(() => undefined)
      return false
    }
  }
}
