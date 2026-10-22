import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { readCollections } from '../tasks/collections.js'
import { readRecapSpend } from '../you/spent.js'
import type { RelatedRun } from '../tasks/types.js'
import {
  ARTIFACTS_DIR,
  dayDirFor,
  dayOf,
  isDayDir,
  isSafeArtifactName,
  RUN_FILE,
  RUNS_DIR,
} from './layout.js'
import {
  isCollection,
  normalizeHistoryRecord,
  summarize,
  type CollectionRunRecord,
  type HistoryRecord,
  type RunQuery,
  type RunStats,
  type RunStatus,
  type RunSummary,
} from './types.js'
import { addUsage, NO_USAGE, runUsage, type TokenUsage } from './usage.js'

/**
 * The first day folder a run started at or after a time can be in: its folder
 * is the day where it started, which time zones (and clocks) put a day or two
 * either side of the day here
 */
const firstDayFrom = (from: number) =>
  dayDirFor(new Date(from - 3 * 86_400_000))

/**
 * Reads run history. Used by the desktop app. Uses the cache when a file has
 * not changed.
 */
export class HistoryReader {
  private readonly cache = new Map<
    string,
    { mtimeMs: number; record: HistoryRecord }
  >()
  /** The oldest day folder when the runs were last read */
  private oldest?: string

  constructor(readonly root: string) {}

  list(query: RunQuery = {}): RunSummary[] {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000)
    const q = query.q?.trim().toLowerCase()
    const { since } = query
    const firstDay = since === undefined ? '' : firstDayFrom(since)
    const result: RunSummary[] = []
    let matched = 0
    for (const record of this.records()) {
      if ((dayOf(record.id) ?? '') < firstDay) break
      if (query.kind && (record.kind ?? 'mention') !== query.kind) continue
      if (query.status && record.status !== query.status) continue
      if (q && !matches(record, q)) continue
      if (since !== undefined) {
        if (++matched > 1000) break
        if (Date.parse(record.startedAt) < since) continue
      }
      result.push(summarize(record))
      if (result.length >= limit) break
    }
    return result
  }

  /** Task collection runs started since, newest first */
  collections(since: Date): CollectionRunRecord[] {
    const from = since.getTime()
    const firstDay = dayDirFor(since)
    const result: CollectionRunRecord[] = []
    for (const record of this.records()) {
      if ((dayOf(record.id) ?? '') < firstDay) break
      if (isCollection(record) && Date.parse(record.startedAt) >= from)
        result.push(record)
    }
    return result
  }

  /**
   * Pace's answers in a Slack thread, newest first: the earlier work a task
   * from that thread follows on
   */
  inThread(conversation: string, thread: string, limit = 3): RelatedRun[] {
    // Its runs started after its first message, whose Slack ts is the thread's
    const firstDay = /^\d+\.\d+$/.test(thread)
      ? firstDayFrom(Number(thread) * 1000)
      : ''
    const result: RelatedRun[] = []
    for (const record of this.records()) {
      if ((dayOf(record.id) ?? '') < firstDay) break
      if (isCollection(record)) continue
      const { origin } = record
      if (origin.conversation !== conversation || origin.thread !== thread)
        continue
      result.push({
        id: record.id,
        request: record.request,
        at: record.startedAt,
        status: record.status,
      })
      if (result.length >= limit) break
    }
    return result
  }

  /**
   * Pace's answers in a conversation, newest first, with the text to look for
   * in the request or the answer: what was already said there, for Pace to
   * pick up from (src/pace/tools.ts)
   */
  inConversation(
    conversation: string,
    options: { q?: string; limit?: number; except?: string } = {}
  ): {
    id: string
    at: string
    thread: string
    request: string
    answer?: string
    permalink?: string
  }[] {
    const q = options.q?.trim().toLowerCase()
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 20)
    const result = []
    for (const record of this.records()) {
      if (isCollection(record) || record.id === options.except) continue
      if (record.origin.conversation !== conversation) continue
      if (record.status !== 'succeeded' || !record.answer) continue
      if (q && !`${record.request}\n${record.answer}`.toLowerCase().includes(q))
        continue
      result.push({
        id: record.id,
        at: record.startedAt,
        thread: record.origin.thread,
        request: record.request,
        answer: record.answer,
        permalink: record.origin.permalink,
      })
      if (result.length >= limit) break
    }
    return result
  }

  get(id: string): HistoryRecord | undefined {
    const dir = this.runDir(id)
    return dir ? this.load(path.join(dir, RUN_FILE)) : undefined
  }

  /**
   * Absolute path of an output file. undefined if the name is unsafe or the
   * file is missing
   */
  artifactPath(id: string, name: string): string | undefined {
    const dir = this.runDir(id)
    if (!dir || !isSafeArtifactName(name)) return undefined
    const file = path.join(dir, ARTIFACTS_DIR, name)
    return existsSync(file) ? file : undefined
  }

  stats(now = new Date()): RunStats {
    const byStatus: Record<RunStatus, number> = {
      running: 0,
      succeeded: 0,
      failed: 0,
      interrupted: 0,
    }
    const daily = new Map<string, { runs: number; failed: number }>()
    for (let i = 13; i >= 0; i -= 1) {
      daily.set(dayDirFor(new Date(now.getTime() - i * 86_400_000)), {
        runs: 0,
        failed: 0,
      })
    }
    const tokenDays = new Map(
      [...daily.keys()].map((day) => [
        day,
        { mentions: NO_USAGE, collections: NO_USAGE, recaps: NO_USAGE },
      ])
    )
    const mentions = { runs: 0, usage: NO_USAGE }
    const tools = new Map<string, number>()
    let total = 0
    let durationSum = 0
    let durationCount = 0
    // Collections the app logged before they were runs
    // (tasks-collections.json, no longer written): read until they age out.
    const collections = { count: 0, found: 0, usage: NO_USAGE }
    const addCollection = (
      startedAt: string,
      found: number,
      usage: TokenUsage | undefined
    ) => {
      const tokenDay = tokenDays.get(dayDirFor(new Date(startedAt)))
      if (!tokenDay) return
      collections.count += 1
      collections.found += found
      if (!usage) return
      tokenDay.collections = addUsage(tokenDay.collections, usage)
      collections.usage = addUsage(collections.usage, usage)
    }
    for (const entry of readCollections(this.root))
      addCollection(
        entry.startedAt,
        entry.ok ? entry.added + entry.maybe : 0,
        entry.usage
      )
    // Write it up, each write-up in the desktop app
    const recaps = { count: 0, usage: NO_USAGE }
    for (const spend of readRecapSpend(this.root)) {
      const tokenDay = tokenDays.get(dayDirFor(new Date(spend.at)))
      if (!tokenDay) continue
      tokenDay.recaps = addUsage(tokenDay.recaps, spend.usage)
      recaps.count += 1
      recaps.usage = addUsage(recaps.usage, spend.usage)
    }
    for (const record of this.records()) {
      // The run figures (status, days, duration, tools) are the answers';
      // collections count only toward tokens.
      if (isCollection(record)) {
        addCollection(
          record.startedAt,
          record.found ? record.found.added + record.found.maybe : 0,
          runUsage(record.events)
        )
        continue
      }
      total += 1
      byStatus[record.status] += 1
      const day = daily.get(dayOf(record.id) ?? '')
      if (day) {
        day.runs += 1
        if (record.status === 'failed') day.failed += 1
      }
      const usage = runUsage(record.events)
      const tokenDay = tokenDays.get(dayOf(record.id) ?? '')
      if (usage && tokenDay) {
        tokenDay.mentions = addUsage(tokenDay.mentions, usage)
        mentions.runs += 1
        mentions.usage = addUsage(mentions.usage, usage)
      }
      if (record.status === 'succeeded' && record.durationMs !== undefined) {
        durationSum += record.durationMs
        durationCount += 1
      }
      for (const event of record.events) {
        if (event.kind !== 'tool') continue
        const name = `${event.server}.${event.tool}`
        tools.set(name, (tools.get(name) ?? 0) + 1)
      }
    }
    return {
      total,
      byStatus,
      daily: [...daily].map(([day, value]) => ({ day, ...value })),
      avgDurationMs: durationCount
        ? Math.round(durationSum / durationCount)
        : undefined,
      topTools: [...tools]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, calls]) => ({ name, calls })),
      tokens: {
        daily: [...tokenDays].map(([day, value]) => ({ day, ...value })),
        mentions,
        collections,
        recaps,
      },
    }
  }

  /** Newest runs first */
  private *records(): Generator<HistoryRecord> {
    const runsDir = path.join(this.root, RUNS_DIR)
    const days = existsSync(runsDir)
      ? readdirSync(runsDir).filter(isDayDir).sort().reverse()
      : []
    this.forgetBefore(days.at(-1))
    for (const day of days) {
      const ids = readdirSync(path.join(runsDir, day))
        .filter((id) => dayOf(id) === day)
        .sort()
        .reverse()
      for (const id of ids) {
        const record = this.load(path.join(runsDir, day, id, RUN_FILE))
        if (record) yield record
      }
    }
  }

  /**
   * Drops the cached runs of the days before the oldest day folder left: the
   * bot prunes the oldest days, and the app keeps its reader open
   */
  private forgetBefore(oldest: string | undefined): void {
    if (oldest === this.oldest) return
    this.oldest = oldest
    for (const file of this.cache.keys()) {
      // <root>/runs/<day>/<run id>/run.json
      const day = path.basename(path.dirname(path.dirname(file)))
      if (oldest === undefined || day < oldest) this.cache.delete(file)
    }
  }

  private load(file: string): HistoryRecord | undefined {
    try {
      const { mtimeMs } = statSync(file)
      const cached = this.cache.get(file)
      if (cached?.mtimeMs === mtimeMs) return cached.record
      const record = normalizeHistoryRecord(
        JSON.parse(readFileSync(file, 'utf8')) as HistoryRecord
      )
      this.cache.set(file, { mtimeMs, record })
      return record
    } catch {
      return undefined
    }
  }

  private runDir(id: string): string | undefined {
    const day = dayOf(id)
    return day ? path.join(this.root, RUNS_DIR, day, id) : undefined
  }
}

function matches(record: HistoryRecord, q: string): boolean {
  if (isCollection(record))
    return [summarize(record).request, record.error ?? '', record.id].some(
      (value) => value.toLowerCase().includes(q)
    )
  return [
    record.request,
    record.origin.conversationLabel,
    record.origin.userName ?? '',
    record.answer ?? '',
    record.error ?? '',
    record.id,
  ].some((value) => value.toLowerCase().includes(q))
}
