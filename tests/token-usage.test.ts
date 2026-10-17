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
  COLLECTIONS_FILE,
  latestCollection,
  readCollections,
  recentCollections,
} from '../src/tasks/collections.js'
import type { CollectionRecord } from '../src/tasks/types.js'
import { keepWritten, readWritten } from '../src/you/recap.js'
import { keepRecapSpend, readRecapSpend } from '../src/you/spent.js'
import { usageFrom } from '../apps/desktop/src/recap-writer.js'

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

  /** The log the app kept before collections were runs */
  const writeLog = (dir: string, collections: CollectionRecord[]) =>
    writeFileSync(
      path.join(dir, COLLECTIONS_FILE),
      JSON.stringify({ version: 1, collections })
    )

  it('counts tokens per day, mentions, collections and recaps apart', () => {
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

    // Collections are runs the app writes...
    const collected = store.startCollection(
      { trigger: 'now', backend: { reasoner: 'claude', sandbox: 'host' } },
      new Date(2026, 9, 11, 10)
    )
    collected.event({
      kind: 'usage',
      at: AT,
      inputTokens: 2000,
      cacheReadTokens: 9000,
      cacheWriteTokens: 500,
    })
    collected.finish(
      'succeeded',
      { reads: 20, found: { added: 2, maybe: 1, skipped: 0 } },
      new Date(2026, 9, 11, 10, 1)
    )
    store
      .startCollection(
        { trigger: 'now', backend: { reasoner: 'claude', sandbox: 'host' } },
        new Date(2026, 9, 11, 11)
      )
      .finish('interrupted', { error: 'Stopped.' }, new Date(2026, 9, 11, 11))
    // ... and the log the app kept before still counts, inside the 14 days.
    writeLog(root, [
      collection(new Date(2026, 9, 9, 10), {
        added: 1,
        maybe: 0,
        usage: usage({ output: 100 }),
      }),
      collection(new Date(2026, 8, 1, 10), { usage: usage({ input: 1 }) }),
    ])
    // Each write-up of a recap, written again or not, inside the 14 days
    keepRecapSpend(root, {
      at: new Date(2026, 9, 10, 17).toISOString(),
      usage: usage({ input: 300, cacheRead: 2000, output: 900 }),
    })
    keepRecapSpend(root, {
      at: new Date(2026, 9, 10, 17, 5).toISOString(),
      usage: usage({ input: 200, output: 700 }),
    })
    keepRecapSpend(
      root,
      {
        at: new Date(2026, 8, 1, 10).toISOString(),
        usage: usage({ input: 1 }),
      },
      new Date(2026, 8, 1, 10).getTime()
    )

    const { tokens, total, byStatus } = new HistoryReader(root).stats(now)
    // The run figures are the answers'.
    expect(total).toBe(2)
    expect(byStatus).toMatchObject({ succeeded: 1, failed: 1, interrupted: 0 })
    expect(tokens.daily).toHaveLength(14)
    expect(tokens.daily.at(-3)).toEqual({
      day: '2026-10-09',
      mentions: usage({}),
      collections: usage({ output: 100 }),
      recaps: usage({}),
    })
    expect(tokens.daily.at(-2)).toEqual({
      day: '2026-10-10',
      mentions: usage({ input: 4000, cacheRead: 30_000, output: 600 }),
      collections: usage({}),
      recaps: usage({ input: 500, cacheRead: 2000, output: 1600 }),
    })
    expect(tokens.daily.at(-1)).toEqual({
      day: '2026-10-11',
      mentions: usage({}),
      collections: usage({ input: 2000, cacheRead: 9000, cacheWrite: 500 }),
      recaps: usage({}),
    })
    expect(tokens.mentions).toEqual({
      runs: 1,
      usage: usage({ input: 4000, cacheRead: 30_000, output: 600 }),
    })
    expect(tokens.collections).toEqual({
      count: 3,
      found: 4,
      usage: usage({
        input: 2000,
        cacheRead: 9000,
        cacheWrite: 500,
        output: 100,
      }),
    })
    expect(tokens.recaps).toEqual({
      count: 2,
      usage: usage({ input: 500, cacheRead: 2000, output: 1600 }),
    })
  })

  it('keeps what each write-up spent beside what it wrote, for 90 days', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-recaps-'))
    try {
      const at = (day: number) => new Date(2026, 9, day, 12)
      keepRecapSpend(dir, {
        at: at(1).toISOString(),
        usage: usage({ input: 1 }),
      })
      keepWritten(dir, 'day', '2026-10-01', {
        text: 'You fixed the retries.',
        at: at(1).toISOString(),
        by: 'claude',
      })
      // Writing it again keeps the first one's spend; one 90 days on drops it.
      keepRecapSpend(dir, {
        at: at(2).toISOString(),
        usage: usage({ input: 2 }),
      })
      expect(readWritten(dir)['day:2026-10-01']?.text).toBe(
        'You fixed the retries.'
      )
      expect(readRecapSpend(dir).map((entry) => entry.usage.input)).toEqual([
        1, 2,
      ])
      keepRecapSpend(
        dir,
        { at: at(31).toISOString(), usage: usage({ input: 3 }) },
        at(1).getTime() + 90 * 86_400_000
      )
      expect(readRecapSpend(dir).map((entry) => entry.usage.input)).toEqual([
        2, 3,
      ])
      expect(readWritten(dir)['day:2026-10-01']).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("reads a write-up's tokens from Claude Code's json output", () => {
    // claude -p --output-format json (claude 2.1.29x)
    expect(
      usageFrom(
        JSON.stringify({
          type: 'result',
          result: 'You fixed the retries.',
          total_cost_usd: 0.012,
          usage: {
            input_tokens: 5,
            cache_read_input_tokens: 14000,
            cache_creation_input_tokens: 3000,
            output_tokens: 180,
          },
        })
      )
    ).toEqual({
      input: 5,
      cacheRead: 14000,
      cacheWrite: 3000,
      output: 180,
      costUsd: 0.012,
    })
    expect(usageFrom('not json')).toBeUndefined()
    expect(usageFrom(JSON.stringify({ result: 'x' }))).toBeUndefined()
  })

  it('lists the last 7 days of collections newest first, runs and the old log', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-collections-'))
    try {
      expect(readCollections(dir)).toEqual([])
      const store = new HistoryStore(dir)
      const backend = { reasoner: 'claude', sandbox: 'host' }
      const done = store.startCollection(
        { trigger: 'now', backend },
        new Date(2026, 9, 11, 9)
      )
      done.event({ kind: 'usage', at: AT, inputTokens: 300, outputTokens: 50 })
      done.finish(
        'succeeded',
        { reads: 12, found: { added: 1, maybe: 0, skipped: 2 } },
        new Date(2026, 9, 11, 9, 1)
      )
      store
        .startCollection({ trigger: 'now', backend }, new Date(2026, 9, 10, 9))
        .finish(
          'failed',
          { reads: 0, error: 'Claude Code has no Slack connector.' },
          new Date(2026, 9, 10, 9)
        )
      // Still running: not a row yet
      store.startCollection(
        { trigger: 'now', backend },
        new Date(2026, 9, 11, 17)
      )
      writeLog(dir, [
        collection(new Date(2026, 9, 9), {}),
        collection(new Date(2026, 9, 1), {}),
      ])

      const runs = new HistoryReader(dir).collections(new Date(2026, 9, 4))
      expect(runs).toHaveLength(3)
      const rows = recentCollections(dir, runs, now)
      expect(rows.map((row) => row.startedAt)).toEqual([
        new Date(2026, 9, 11, 9).toISOString(),
        new Date(2026, 9, 10, 9).toISOString(),
        new Date(2026, 9, 9).toISOString(),
      ])
      expect(rows[0]).toMatchObject({
        ok: true,
        added: 1,
        maybe: 0,
        skipped: 2,
        reads: 12,
        trigger: 'now',
        runId: done.id,
        usage: usage({ input: 300, output: 50 }),
      })
      expect(rows[1]).toMatchObject({
        ok: false,
        error: 'Claude Code has no Slack connector.',
      })
      // The old log's have no run to open.
      expect(rows[2]!.runId).toBeUndefined()
      expect(latestCollection(dir, runs)?.runId).toBe(done.id)

      writeFileSync(path.join(dir, COLLECTIONS_FILE), 'not json')
      expect(readCollections(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
