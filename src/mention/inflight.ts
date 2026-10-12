import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { Mention } from '../messengers/types.js'

/**
 * Record of in-progress mentions. When a bot restart (deploy, tsx watch, crash)
 * cuts off an answer, the next start resumes it (in the same placeholder
 * message, if it had one) or reports the failure.
 */
export interface InflightEntry {
  /** mentionKey(mention) */
  key: string
  mention: Mention
  /** Where it was asked, as the run history shows it ("#ops") */
  label: string
  /**
   * A placeholder message ("Working on it...") from an older version, which a
   * resume takes away. Entries written now have none.
   */
  placeholder?: string
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

export type ResumeDecision = 'resume' | 'give_up'

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
    if (!existsSync(this.file)) return []
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as unknown
      return Array.isArray(parsed) ? (parsed as InflightEntry[]) : []
    } catch {
      return []
    }
  }

  upsert(entry: InflightEntry): void {
    this.write([...this.list().filter((e) => e.key !== entry.key), entry])
  }

  remove(key: string): void {
    const entries = this.list()
    const rest = entries.filter((e) => e.key !== key)
    if (rest.length !== entries.length) this.write(rest)
  }

  /**
   * Writes to a temporary file and renames it so no half-written file is left
   * behind.
   */
  private write(entries: InflightEntry[]): void {
    mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, `${JSON.stringify(entries, null, 2)}\n`)
    renameSync(tmp, this.file)
  }
}
