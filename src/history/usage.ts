import type { RunEvent } from './types.js'

/**
 * Tokens a run or a task collection spent, in four parts that add up to all
 * the model read and wrote
 */
export interface TokenUsage {
  /** Input not read from the cache: the prompt, the thread, tool results */
  input: number
  /** Input read from the cache: context reused from earlier turns */
  cacheRead: number
  /** Input written to the cache (claude reports it, codex does not) */
  cacheWrite: number
  output: number
  /** claude's own cost figure, at API prices */
  costUsd?: number
}

export const NO_USAGE: TokenUsage = {
  input: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
}

/**
 * New tokens: all but the input read back from the cache, which costs far
 * less. The figure the Overview tracks.
 */
export const newTokens = (usage: TokenUsage) =>
  usage.input + usage.cacheWrite + usage.output

export const totalTokens = (usage: TokenUsage) =>
  newTokens(usage) + usage.cacheRead

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const sum: TokenUsage = {
    input: a.input + b.input,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    output: a.output + b.output,
  }
  if (a.costUsd !== undefined || b.costUsd !== undefined)
    sum.costUsd = (a.costUsd ?? 0) + (b.costUsd ?? 0)
  return sum
}

/**
 * The tokens on a Claude Code result line (stream-json), for the whole
 * session: answering a mention, or collecting tasks
 */
export function claudeResultUsage(line: {
  usage?: Record<string, number>
  total_cost_usd?: number
}): TokenUsage {
  const usage = line.usage ?? {}
  return {
    input: usage.input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    costUsd: line.total_cost_usd,
  }
}

/** A run's tokens over its usage events; undefined when it has none */
export function runUsage(events: readonly RunEvent[]): TokenUsage | undefined {
  let total: TokenUsage | undefined
  for (const event of events) {
    if (event.kind !== 'usage') continue
    total = addUsage(total ?? NO_USAGE, {
      input: event.inputTokens ?? 0,
      cacheRead: event.cacheReadTokens ?? 0,
      cacheWrite: event.cacheWriteTokens ?? 0,
      output: event.outputTokens ?? 0,
      costUsd: event.costUsd,
    })
  }
  return total
}
