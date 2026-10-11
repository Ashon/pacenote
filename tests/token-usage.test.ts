import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { HistoryReader } from '../src/history/reader.js'
import { HistoryStore } from '../src/history/recorder.js'
import { normalizeRunRecord, type RunRecord } from '../src/history/types.js'
import {
  addUsage,
  newTokens,
  runUsage,
  totalTokens,
} from '../src/history/usage.js'
import { claudeLineToEvents } from '../src/reasoners/claude.js'
import {
  addCollection,
  COLLECTIONS_FILE,
  readCollections,
  recentCollections,
} from '../src/tasks/collections.js'
import type { CollectionRecord } from '../src/tasks/types.js'

const AT = '2026-10-11T05:00:00.000Z'

const usage = (parts: Partial<Record<string, number>>) => ({
  input: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  ...parts,
})

describe('token usage', () => {
  it('keeps claude cache writes apart from new input and cache reads', () => {
    const [event] = claudeLineToEvents(
      JSON.stringify({
        type: 'result',
        result: 'done',
        usage: {
          input_tokens: 40,
          cache_read_input_tokens: 9000,
          cache_creation_input_tokens: 1500,
          output_tokens: 300,
        },
        total_cost_usd: 0.05,
      }),
      AT
    )
    expect(event).toEqual({
      kind: 'usage',
      at: AT,
      inputTokens: 40,
      cacheReadTokens: 9000,
      cacheWriteTokens: 1500,
      outputTokens: 300,
      costUsd: 0.05,
    })
    const sum = runUsage([event!, event!])!
    expect(sum).toEqual({
      input: 80,
      cacheRead: 18000,
      cacheWrite: 3000,
      output: 600,
      costUsd: 0.1,
    })
    // New tokens leave out only what was read back from the cache.
    expect(newTokens(sum)).toBe(80 + 3000 + 600)
    expect(totalTokens(sum)).toBe(80 + 18000 + 3000 + 600)
    expect(runUsage([{ kind: 'note', at: AT, text: 'x' }])).toBeUndefined()
    expect(addUsage(usage({ input: 1 }), usage({ output: 2 }))).toEqual(
      usage({ input: 1, output: 2 })
    )
  })

  it('reads the usage of older records in four parts', () => {
    const record = (reasoner: string, version: number) =>
      ({
        version,
        backend: { reasoner, sandbox: 'docker' },
        events: [
          {
            kind: 'usage',
            at: AT,
            inputTokens: 100_000,
            cachedInputTokens: 80_000,
            outputTokens: 500,
          },
        ],
      }) as unknown as RunRecord
    // codex counted the cached input in inputTokens; claude did not.
    expect(normalizeRunRecord(record('codex', 2)).events[0]).toEqual({
      kind: 'usage',
      at: AT,
      inputTokens: 20_000,
      cacheReadTokens: 80_000,
      outputTokens: 500,
    })
    expect(normalizeRunRecord(record('claude', 2)).events[0]).toEqual({
      kind: 'usage',
      at: AT,
      inputTokens: 100_000,
      cacheReadTokens: 80_000,
      outputTokens: 500,
    })
    const current = record('codex', 3)
    expect(normalizeRunRecord(current)).toBe(current)
  })
})

describe('token stats', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pacenote-tokens-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const now = new Date(2026, 9, 11, 18)
  const collection = (
    startedAt: Date,
    extra: Partial<CollectionRecord>
  ): CollectionRecord =>
    ({
      at: startedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      trigger: 'now',
      ok: true,
      added: 2,
      maybe: 1,
      skipped: 0,
      reads: 20,
      ...extra,
    }) as CollectionRecord

  it('counts tokens per day, mentions and collections apart', () => {
    const store = new HistoryStore(root)
    const init = {
      origin: {
        messenger: 'slack' as const,
        conversation: 'C1',
        conversationLabel: '#ops',
        thread: '1.0',
        message: '1.0',
        userId: 'U1',
      },
      request: 'check web-01',
      backend: { reasoner: 'codex', sandbox: 'docker' },
    }
    const run = store.start(init, new Date(2026, 9, 10, 9))
    run.event({
      kind: 'usage',
      at: AT,
      inputTokens: 4000,
      cacheReadTokens: 30_000,
      outputTokens: 600,
    })
    run.finish('succeeded', { answer: 'OK' }, new Date(2026, 9, 10, 9, 1))
    // A run without usage counts as a run, not as one with tokens.
    store
      .start(init, new Date(2026, 9, 11, 9))
      .finish('failed', {}, new Date(2026, 9, 11, 9, 1))

    addCollection(
      root,
      collection(new Date(2026, 9, 11, 10), {
        usage: usage({ input: 2000, cacheRead: 9000, cacheWrite: 500 }),
      }),
      now
    )
    addCollection(
      root,
      collection(new Date(2026, 9, 11, 11), {
        ok: false,
        error: 'Stopped.',
      } as Partial<CollectionRecord>),
      now
    )
    // Outside the 14 days
    addCollection(
      root,
      collection(new Date(2026, 8, 1, 10), { usage: usage({ input: 1 }) }),
      now
    )

    const { tokens } = new HistoryReader(root).stats(now)
    expect(tokens.daily).toHaveLength(14)
    expect(tokens.daily.at(-2)).toEqual({
      day: '2026-10-10',
      mentions: usage({ input: 4000, cacheRead: 30_000, output: 600 }),
      collections: usage({}),
    })
    expect(tokens.daily.at(-1)).toEqual({
      day: '2026-10-11',
      mentions: usage({}),
      collections: usage({ input: 2000, cacheRead: 9000, cacheWrite: 500 }),
    })
    expect(tokens.mentions).toEqual({
      runs: 1,
      usage: usage({ input: 4000, cacheRead: 30_000, output: 600 }),
    })
    expect(tokens.collections).toEqual({
      count: 2,
      found: 3,
      usage: usage({ input: 2000, cacheRead: 9000, cacheWrite: 500 }),
    })
  })

  it('keeps 90 days of collections and lists the last 7 newest first', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-collections-'))
    try {
      expect(readCollections(dir)).toEqual([])
      addCollection(dir, collection(new Date(2026, 6, 1), {}), now)
      addCollection(dir, collection(new Date(2026, 9, 1), {}), now)
      addCollection(dir, collection(new Date(2026, 9, 10), {}), now)
      addCollection(dir, collection(new Date(2026, 9, 11), {}), now)
      // The one from July is past 90 days by the second write.
      expect(readCollections(dir)).toHaveLength(3)
      expect(
        recentCollections(dir, now).map((entry) => entry.startedAt)
      ).toEqual([
        new Date(2026, 9, 11).toISOString(),
        new Date(2026, 9, 10).toISOString(),
      ])
      writeFileSync(path.join(dir, COLLECTIONS_FILE), 'not json')
      expect(readCollections(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
