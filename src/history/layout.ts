import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeHistoryRecord, type HistoryRecord } from './types.js'

/**
 * Run history storage layout. Shared by the bot (writes) and the desktop app
 * (reads).
 *   <root>/runs/<YYYY-MM-DD>/<run id>/run.json
 *   <root>/runs/<YYYY-MM-DD>/<run id>/artifacts/<file>
 * The run id holds the start time (local time), so the id alone locates the day
 * directory.
 */
export const RUNS_DIR = 'runs'
export const RUN_FILE = 'run.json'
export const ARTIFACTS_DIR = 'artifacts'

const RUN_ID = /^(\d{4})(\d{2})(\d{2})-\d{6}-[0-9a-f]{4,}$/
const DAY_DIR = /^\d{4}-\d{2}-\d{2}$/
const ARTIFACT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

const pad = (n: number) => String(n).padStart(2, '0')

export function runIdFor(date: Date, suffix: string): string {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${day}-${time}-${suffix}`
}

/** Day directory name for a run id. undefined if the format is wrong */
export function dayOf(id: string): string | undefined {
  const match = RUN_ID.exec(id)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined
}

export function dayDirFor(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const isDayDir = (name: string) => DAY_DIR.test(name)

/** A run's directory. undefined if the id's format is wrong */
export function runDir(root: string, id: string): string | undefined {
  const day = dayOf(id)
  return day ? path.join(root, RUNS_DIR, day, id) : undefined
}

/** Day directory names (newest first) */
export function dayDirs(root: string): string[] {
  const dir = path.join(root, RUNS_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(isDayDir).sort().reverse()
}

/** A run.json in the current shape. undefined if it is missing or broken */
export function readRunFile(file: string): HistoryRecord | undefined {
  try {
    return normalizeHistoryRecord(
      JSON.parse(readFileSync(file, 'utf8')) as HistoryRecord
    )
  } catch {
    return undefined
  }
}

export const isSafeArtifactName = (name: string) =>
  ARTIFACT_NAME.test(name) && !name.includes('..')
