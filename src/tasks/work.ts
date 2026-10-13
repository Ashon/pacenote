import path from 'node:path'
import { HISTORY_MS, readJson, writeJson } from './store.js'
import type { WorkEntry, WorkFile } from './types.js'

/**
 * A task's work log: the Claude Code and Codex sessions the desktop app opened
 * (or found) for it and the replies it drafted, in tasks-work.json, which only
 * the app writes. A session keeps its id and folder; what was said stays in
 * the tool's own log.
 */
export const WORK_FILE = 'tasks-work.json'

export function readWork(dataDir: string): WorkFile {
  const file = readJson<Partial<WorkFile>>(path.join(dataDir, WORK_FILE), {})
  return {
    version: 1,
    entries: Array.isArray(file.entries) ? file.entries : [],
  }
}

/** When an entry happened: a session's start, a draft's time */
export const entryAt = (entry: WorkEntry): string =>
  entry.kind === 'session' ? entry.startedAt : entry.at

function save(dataDir: string, entries: WorkEntry[], now: number): void {
  writeJson(path.join(dataDir, WORK_FILE), {
    version: 1,
    // As long as the tasks they belong to are kept
    entries: entries.filter(
      (entry) => now - Date.parse(entryAt(entry)) < HISTORY_MS
    ),
  } satisfies WorkFile)
}

export function addWork(
  dataDir: string,
  entry: WorkEntry,
  now = Date.now()
): WorkEntry {
  save(dataDir, [...readWork(dataDir).entries, entry], now)
  return entry
}

/** Changes an entry; undefined when there is none */
export function updateWork(
  dataDir: string,
  id: string,
  change: (entry: WorkEntry) => WorkEntry,
  now = Date.now()
): WorkEntry | undefined {
  const { entries } = readWork(dataDir)
  const index = entries.findIndex((entry) => entry.id === id)
  if (index < 0) return undefined
  const next = change(entries[index]!)
  entries[index] = next
  save(dataDir, entries, now)
  return next
}

/** A task's entries, newest first */
export function workFor(entries: WorkEntry[], task: string): WorkEntry[] {
  return entries
    .filter((entry) => entry.task === task)
    .sort((a, b) => Date.parse(entryAt(b)) - Date.parse(entryAt(a)))
}
