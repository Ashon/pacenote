import { readJson, writeJson } from '../json-file.js'
import type { Mention } from '../messengers/types.js'

/**
 * Record of in-progress mentions. When a bot restart (deploy, tsx watch, crash)
 * cuts off an answer, the next start resumes it or reports the failure.
 */
export interface InflightEntry {
  /** mentionKey(mention) */
  key: string
  mention: Mention
  /** Where it was asked, as the run history shows it ("#ops") */
  label: string
  /** Run id. When resuming, writing continues in the same run. */
  runId?: string
  /**
   * Number of times processing has started so far: 0 while it waits its turn,
   * and not counting a run cut off to shut down
   */
  attempts: number
  /** When it was taken on, across restarts */
  startedAt: number
  /**
   * How far posting the answer got. A request whose answer was posted, in part
   * or in full, is not answered again after a restart.
   */
  answer?: 'posting' | 'posted'
}

/**
 * Maximum number of times processing can start for one request (1 initial + 1
 * resume after a restart)
 */
export const MAX_ATTEMPTS = 2
/** Requests older than this are not resumed. */
export const MAX_RESUME_AGE_MS = 30 * 60_000

type ResumeDecision = 'resume' | 'give_up'

export function resumeDecision(
  entry: InflightEntry,
  now = Date.now()
): ResumeDecision {
  if (entry.attempts >= MAX_ATTEMPTS) return 'give_up'
  if (now - entry.startedAt > MAX_RESUME_AGE_MS) return 'give_up'
  return 'resume'
}

export class InflightStore {
  constructor(private readonly file: string) {}

  list(): InflightEntry[] {
    const parsed = readJson<unknown>(this.file, [])
    return Array.isArray(parsed) ? (parsed as InflightEntry[]) : []
  }

  upsert(entry: InflightEntry): void {
    this.write([...this.list().filter((e) => e.key !== entry.key), entry])
  }

  remove(key: string): void {
    const entries = this.list()
    const rest = entries.filter((e) => e.key !== key)
    if (rest.length !== entries.length) this.write(rest)
  }

  private write(entries: InflightEntry[]): void {
    writeJson(this.file, entries)
  }
}
