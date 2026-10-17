import path from 'node:path'
import type { TokenUsage } from '../history/usage.js'
import { readJson, writeJson } from '../tasks/store.js'

/**
 * What Write it up spent, for the Overview's tokens per day: one entry per
 * write-up, beside what it wrote in recaps.json (recap.ts). Writing a recap
 * again spends again, so each keeps its own entry. Entries are kept 90 days;
 * the Overview reads the last 14.
 */
export const RECAPS_FILE = 'recaps.json'
const KEEP_MS = 90 * 86_400_000

export interface RecapSpend {
  at: string
  usage: TokenUsage
}

export function readRecapSpend(dataDir: string): RecapSpend[] {
  const file = readJson<{ spent?: unknown }>(
    path.join(dataDir, RECAPS_FILE),
    {}
  )
  return Array.isArray(file.spent)
    ? (file.spent as Partial<RecapSpend>[]).filter(
        (entry): entry is RecapSpend =>
          typeof entry?.at === 'string' && typeof entry.usage === 'object'
      )
    : []
}

export function keepRecapSpend(
  dataDir: string,
  spend: RecapSpend,
  now = Date.now()
): void {
  const file = path.join(dataDir, RECAPS_FILE)
  const kept = readRecapSpend(dataDir).filter(
    (entry) => now - Date.parse(entry.at) < KEEP_MS
  )
  writeJson(file, {
    ...readJson<object>(file, {}),
    version: 1,
    spent: [...kept, spend],
  })
}
