import path from 'node:path'
import type { CollectionRunRecord } from '../history/types.js'
import { runUsage } from '../history/usage.js'
import { localized } from '../i18n/locale.js'
import { text } from './collections.text.js'
import { isOwnCli } from './own-ai.js'
import { readJson } from './store.js'
import type { CollectionRecord } from './types.js'

/**
 * The log the desktop app kept of its collections before they became runs in
 * the history (v0.4.4 and v0.4.5): still read for the days it covers, no longer
 * written.
 */
export const COLLECTIONS_FILE = 'tasks-collections.json'

const DAY = 24 * 60 * 60 * 1000

export function readCollections(dataDir: string): CollectionRecord[] {
  const file = readJson<{ collections?: unknown }>(
    path.join(dataDir, COLLECTIONS_FILE),
    {}
  )
  return Array.isArray(file.collections)
    ? (file.collections as CollectionRecord[]).filter(
        (entry) => typeof entry?.startedAt === 'string'
      )
    : []
}

/** A collection's run as Todo's Collections lists it; none while it runs */
export function collectionRow(
  run: CollectionRunRecord
): CollectionRecord | undefined {
  if (run.status === 'running') return undefined
  const usage = runUsage(run.events)
  const row = {
    at: run.finishedAt ?? run.updatedAt,
    startedAt: run.startedAt,
    trigger: run.trigger,
    runId: run.id,
    reads: run.reads ?? 0,
    ...(usage ? { usage } : {}),
    ...(isOwnCli(run.backend.reasoner) ? { by: run.backend.reasoner } : {}),
    ...(run.switched ? { switched: run.switched } : {}),
  }
  return run.found
    ? { ...row, ok: true, ...run.found }
    : {
        ...row,
        ok: false,
        error: run.error ?? localized(text).stopped,
      }
}

/** Finished collections, newest first: the runs, then the old log's */
function allCollections(
  dataDir: string,
  runs: CollectionRunRecord[]
): CollectionRecord[] {
  return [
    ...runs.flatMap((run) => collectionRow(run) ?? []),
    ...readCollections(dataDir),
  ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}

/** The last days' collections, newest first, for the Todo screen */
export function recentCollections(
  dataDir: string,
  runs: CollectionRunRecord[],
  now = new Date(),
  days = 7
): CollectionRecord[] {
  const since = now.getTime() - days * DAY
  return allCollections(dataDir, runs).filter(
    (entry) => Date.parse(entry.startedAt) >= since
  )
}

/** How the newest collection ended, so the screen has it when the app starts */
export function latestCollection(
  dataDir: string,
  runs: CollectionRunRecord[]
): CollectionRecord | undefined {
  return allCollections(dataDir, runs)[0]
}
