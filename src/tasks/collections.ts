import path from 'node:path'
import { readJson, writeJson } from './store.js'
import type { CollectionRecord } from './types.js'

/**
 * The collections the desktop app ran, oldest first: how each ended, how many
 * Slack lookups it made and the tokens it spent. Only the app writes it.
 */
export const COLLECTIONS_FILE = 'tasks-collections.json'

const DAY = 24 * 60 * 60 * 1000
/** Kept for this long, so the Overview's 14 days always have them */
const KEEP_MS = 90 * DAY
const KEEP_MAX = 1000

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

/** Logs a finished collection and drops the ones past keeping */
export function addCollection(
  dataDir: string,
  entry: CollectionRecord,
  now = new Date()
): void {
  const since = now.getTime() - KEEP_MS
  const collections = [...readCollections(dataDir), entry]
    .filter((item) => Date.parse(item.startedAt) >= since)
    .slice(-KEEP_MAX)
  writeJson(path.join(dataDir, COLLECTIONS_FILE), { version: 1, collections })
}

/** The last days' collections, newest first, for the Tasks screen */
export function recentCollections(
  dataDir: string,
  now = new Date(),
  days = 7
): CollectionRecord[] {
  const since = now.getTime() - days * DAY
  return readCollections(dataDir)
    .filter((entry) => Date.parse(entry.startedAt) >= since)
    .reverse()
}
