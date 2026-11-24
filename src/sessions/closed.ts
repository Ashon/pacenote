import path from 'node:path'
import { readJson, writeJson } from '../json-file.js'
import { DAY } from '../time.js'

/**
 * The sessions you closed on the Sessions screen (Close, or Wrap up for a
 * task's): each by its row's id (tool:session) with when. Closing says you are
 * done with it here, so it moves to Ended; it is open again once it writes to
 * its log after that, as one you went on with. Its tool keeps the session:
 * you can still read it and continue it. Kept a few days, the screen showing
 * today's alone; written by the desktop app.
 */
export const CLOSED_FILE = 'sessions-closed.json'
const KEPT_MS = 3 * DAY
/**
 * A log written this soon after it closed is still closed: a run that ends
 * writes its last lines as it quits
 */
export const CLOSED_GRACE_MS = 15_000

interface ClosedFile {
  version: 1
  closed: Record<string, string>
}

const isTime = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

/** When each session you closed was closed, by its row's id */
export function readClosed(dataDir: string): Map<string, string> {
  const file = readJson<Partial<ClosedFile>>(
    path.join(dataDir, CLOSED_FILE),
    {}
  )
  const closed = new Map<string, string>()
  for (const [id, at] of Object.entries(file.closed ?? {}))
    if (isTime(at)) closed.set(id, at)
  return closed
}

/** Keeps that you closed it now, the ones closed long ago let go */
export function closeSession(
  dataDir: string,
  id: string,
  at: Date = new Date()
): void {
  const closed = Object.fromEntries(
    [...readClosed(dataDir)].filter(
      ([other, when]) =>
        other !== id && at.getTime() - Date.parse(when) < KEPT_MS
    )
  )
  closed[id] = at.toISOString()
  writeJson(path.join(dataDir, CLOSED_FILE), { version: 1, closed })
}

/** Whether a session closed at closedAt is closed still, by its last write */
export function closedStill(
  closedAt: string | undefined,
  lastAt: string
): boolean {
  return (
    closedAt !== undefined &&
    Date.parse(lastAt) <= Date.parse(closedAt) + CLOSED_GRACE_MS
  )
}
