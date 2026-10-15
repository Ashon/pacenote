import path from 'node:path'
import { HISTORY_MS, readJson, writeJson } from './store.js'
import type { SessionSuggestion, WorkEntry, WorkFile } from './types.js'

/**
 * A task's work log: the Claude Code and Codex sessions the desktop app opened
 * (or found) for it and the replies it drafted, in tasks-work.json, which only
 * the app writes. A session keeps its id and folder; what was said stays in
 * the tool's own log. Beside the log: the sessions that look like a task's
 * work until you say whether they are, and the ones you said were not.
 */
export const WORK_FILE = 'tasks-work.json'

export function readWork(dataDir: string): WorkFile {
  const file = readJson<Partial<WorkFile>>(path.join(dataDir, WORK_FILE), {})
  return {
    version: 1,
    entries: Array.isArray(file.entries) ? file.entries : [],
    suggested: Array.isArray(file.suggested) ? file.suggested : [],
    notIt: Array.isArray(file.notIt) ? file.notIt : [],
  }
}

/** When an entry happened: a session's start, a draft's time */
export const entryAt = (entry: WorkEntry): string =>
  entry.kind === 'session' ? entry.startedAt : entry.at

function save(dataDir: string, file: WorkFile, now: number): void {
  // As long as the tasks they belong to are kept
  const kept = (at: string) => now - Date.parse(at) < HISTORY_MS
  writeJson(path.join(dataDir, WORK_FILE), {
    version: 1,
    entries: file.entries.filter((entry) => kept(entryAt(entry))),
    suggested: (file.suggested ?? []).filter((s) => kept(s.startedAt)),
    notIt: (file.notIt ?? []).filter((n) => kept(n.at)),
  } satisfies WorkFile)
}

/** Changes the work file as a whole */
export function changeWork(
  dataDir: string,
  change: (file: WorkFile) => WorkFile,
  now = Date.now()
): WorkFile {
  const next = change(readWork(dataDir))
  save(dataDir, next, now)
  return next
}

export function addWork(
  dataDir: string,
  entry: WorkEntry,
  now = Date.now()
): WorkEntry {
  changeWork(
    dataDir,
    (file) => ({ ...file, entries: [...file.entries, entry] }),
    now
  )
  return entry
}

/** Changes an entry; undefined when there is none */
export function updateWork(
  dataDir: string,
  id: string,
  change: (entry: WorkEntry) => WorkEntry,
  now = Date.now()
): WorkEntry | undefined {
  let next: WorkEntry | undefined
  changeWork(
    dataDir,
    (file) => ({
      ...file,
      entries: file.entries.map((entry) =>
        entry.id === id ? (next = change(entry)) : entry
      ),
    }),
    now
  )
  return next
}

/**
 * Answers a session that looked like a task's work: yes puts it in the
 * task's work log, no keeps it from being asked about for the task again.
 * Undefined when it is no longer waiting.
 */
export function answerSuggestion(
  dataDir: string,
  id: string,
  yes: boolean,
  now = new Date()
): SessionSuggestion | undefined {
  let answered: SessionSuggestion | undefined
  changeWork(
    dataDir,
    (file) => {
      answered = file.suggested?.find((s) => s.id === id)
      if (!answered) return file
      const { shares, ...session } = answered
      void shares
      return {
        ...file,
        suggested: file.suggested?.filter((s) => s.id !== id),
        entries: yes
          ? [
              ...file.entries,
              { ...session, kind: 'session', found: true, foundBy: 'you' },
            ]
          : file.entries,
        notIt: yes
          ? file.notIt
          : [
              ...(file.notIt ?? []),
              {
                task: answered.task,
                session: answered.session ?? '',
                at: now.toISOString(),
              },
            ],
      }
    },
    now.getTime()
  )
  return answered
}

/** A task's entries, newest first */
export function workFor(entries: WorkEntry[], task: string): WorkEntry[] {
  return entries
    .filter((entry) => entry.task === task)
    .sort((a, b) => Date.parse(entryAt(b)) - Date.parse(entryAt(a)))
}
