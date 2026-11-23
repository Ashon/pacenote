import path from 'node:path'
import { readJson, writeJson } from '../json-file.js'
import { DAY } from '../time.js'
import { dayDirFor } from './layout.js'
import { addUsage, NO_USAGE, type TokenUsage } from './usage.js'

/**
 * What the rest of Pacenote's own AI work spent, for the Overview's tokens
 * per day, beside what the run history (mentions, collections) and
 * recaps.json (write-ups) already count: the turns of the Claude Code
 * sessions Pacenote runs, and the background help on tasks. Kept as a sum per
 * day and kind, not an entry per turn, for 90 days; the Overview reads the
 * last 14.
 */
export const SPENT_FILE = 'spent.json'
const KEEP_MS = 90 * DAY

/**
 * session: a turn of a session Pacenote runs (its page, Continue here, a
 * phone). fill, done and draft: filling in a new task, judging whether one
 * looks done, drafting a reply.
 */
export const SPEND_KINDS = ['session', 'fill', 'done', 'draft'] as const
export type SpendKind = (typeof SPEND_KINDS)[number]

export interface Spent {
  /** How many turns or pieces of work */
  count: number
  usage: TokenUsage
}

/** By day (YYYY-MM-DD, this Mac's), then by kind */
export type SpentDays = Record<string, Partial<Record<SpendKind, Spent>>>

const isSpent = (value: unknown): value is Spent =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Spent).count === 'number' &&
  typeof (value as Spent).usage === 'object' &&
  (value as Spent).usage !== null

export function readSpent(dataDir: string): SpentDays {
  const file = readJson<{ days?: unknown }>(path.join(dataDir, SPENT_FILE), {})
  if (typeof file.days !== 'object' || file.days === null) return {}
  const days: SpentDays = {}
  for (const [day, kinds] of Object.entries(file.days)) {
    if (typeof kinds !== 'object' || kinds === null) continue
    const kept: Partial<Record<SpendKind, Spent>> = {}
    for (const kind of SPEND_KINDS) {
      const spent = (kinds as Record<string, unknown>)[kind]
      if (isSpent(spent))
        kept[kind] = {
          count: spent.count,
          usage: addUsage(NO_USAGE, spent.usage),
        }
    }
    days[day] = kept
  }
  return days
}

/** Adds one turn or piece of work to its day; days 90 days old drop out */
export function keepSpent(
  dataDir: string,
  kind: SpendKind,
  usage: TokenUsage,
  at = new Date()
): void {
  const day = dayDirFor(at)
  const oldest = dayDirFor(new Date(at.getTime() - KEEP_MS))
  const days = Object.fromEntries(
    Object.entries(readSpent(dataDir)).filter(([key]) => key > oldest)
  )
  const kinds = days[day] ?? {}
  const was = kinds[kind]
  kinds[kind] = {
    count: (was?.count ?? 0) + 1,
    usage: addUsage(was?.usage ?? NO_USAGE, usage),
  }
  days[day] = kinds
  writeJson(path.join(dataDir, SPENT_FILE), { version: 1, days })
}

/**
 * What a turn of a Claude Code session spent, from its result line:
 * model_usage_since_last_result, summed over its models. Claude Code states
 * each call on one result only, whatever a resume or a kill does; modelUsage
 * and total_cost_usd are running totals across turns, carried on by a
 * resume, so summing them counts turns again. undefined when the result does
 * not say (an older Claude Code) or nothing was spent.
 */
export function turnSpend(
  result: Record<string, unknown>
): TokenUsage | undefined {
  const since = result.model_usage_since_last_result
  if (typeof since !== 'object' || since === null) return undefined
  let total: TokenUsage | undefined
  for (const model of Object.values(since)) {
    if (typeof model !== 'object' || model === null) continue
    const n = (key: string) => {
      const value = (model as Record<string, unknown>)[key]
      return typeof value === 'number' && Number.isFinite(value) ? value : 0
    }
    const cost = (model as Record<string, unknown>).costUSD
    total = addUsage(total ?? NO_USAGE, {
      input: n('inputTokens'),
      cacheRead: n('cacheReadInputTokens'),
      cacheWrite: n('cacheCreationInputTokens'),
      output: n('outputTokens'),
      ...(typeof cost === 'number' ? { costUsd: cost } : {}),
    })
  }
  if (!total) return undefined
  return total.input + total.cacheRead + total.cacheWrite + total.output > 0
    ? total
    : undefined
}
