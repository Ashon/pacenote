import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, describe, expect, it } from 'vitest'
import {
  CollectionEvents,
  recordCollection,
} from '../apps/desktop/src/task-collector.js'
import {
  collectionResult,
  lookupGroups,
} from '../src/history/collection-steps.js'
import { createHistoryServer } from '../src/history/mcp.js'
import { HistoryReader } from '../src/history/reader.js'
import { HistoryStore } from '../src/history/recorder.js'
import {
  collectionTitle,
  type CollectionRunRecord,
  type RunEvent,
} from '../src/history/types.js'
import { handleLocalApi } from '../src/local-api.js'

const backend = { reasoner: 'claude', sandbox: 'host' }
const origin = {
  messenger: 'slack' as const,
  conversation: 'C1',
  conversationLabel: '#ops',
  thread: '1.0',
  message: '1.0',
  userId: 'U1',
}

// Claude Code's stream-json lines (claude 2.1.296)
const assistant = (...content: object[]) =>
  JSON.stringify({ type: 'assistant', message: { content } })
const toolResult = (id: string, text: string) =>
  JSON.stringify({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          content: [{ type: 'text', text }],
        },
      ],
    },
  })

describe('task collections as runs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pacenote-collection-runs-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const store = new HistoryStore(root)
  const reader = new HistoryReader(root)

  it('keeps a collection beside the answers, each saying what it was', async () => {
    store
      .start(
        { origin, request: 'check web-01', backend },
        new Date(2026, 9, 11, 9)
      )
      .finish('succeeded', { answer: 'OK' }, new Date(2026, 9, 11, 9, 1))
    const collection = store.startCollection(
      { trigger: 'now', backend },
      new Date(2026, 9, 11, 10)
    )
    collection.finish(
      'succeeded',
      { reads: 41, found: { added: 2, maybe: 1, skipped: 1 } },
      new Date(2026, 9, 11, 10, 0, 25)
    )

    expect(reader.list().map((run) => run.kind)).toEqual([
      'collection',
      'mention',
    ])
    expect(reader.list({ kind: 'collection' })).toEqual([
      expect.objectContaining({
        id: collection.id,
        kind: 'collection',
        status: 'succeeded',
        conversationLabel: 'Collect now',
        request: 'Added 2 tasks and 1 Maybe',
        reads: 41,
        reasoner: 'claude@host',
      }),
    ])
    expect(reader.list({ kind: 'mention' })).toHaveLength(1)
    // Found by what it did
    expect(reader.list({ q: 'maybe' }).map((run) => run.id)).toEqual([
      collection.id,
    ])
    expect(reader.get(collection.id)).toMatchObject({ kind: 'collection' })

    const response = await handleLocalApi(
      reader,
      'GET',
      new URL('/api/runs?kind=collection', 'pacenote://app')
    )
    const api = await response.json()
    expect(api).toHaveLength(1)
  })

  it('titles a collection by what it did, or why it stopped', () => {
    const run = (fields: Partial<CollectionRunRecord>) =>
      ({
        kind: 'collection',
        status: 'succeeded',
        ...fields,
      }) as CollectionRunRecord
    expect(collectionTitle(run({ status: 'running' }))).toBe('Collecting')
    expect(
      collectionTitle(run({ found: { added: 0, maybe: 0, skipped: 2 } }))
    ).toBe('Nothing new to add')
    expect(
      collectionTitle(run({ found: { added: 1, maybe: 0, skipped: 0 } }))
    ).toBe('Added 1 task')
    expect(
      collectionTitle(
        run({
          status: 'failed',
          error: 'Claude Code has no Slack connector. Connect Slack…',
        })
      )
    ).toBe('Claude Code has no Slack connector')
    expect(
      collectionTitle(run({ status: 'interrupted', error: 'Stopped.' }))
    ).toBe('Stopped')
  })

  it('leaves the other kind alone when the bot or the app restarts', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-stale-'))
    try {
      const history = new HistoryStore(dir)
      const mention = history.start({ origin, request: 'hi', backend })
      const collection = history.startCollection({ trigger: 'now', backend })
      // The bot restarts while the app collects.
      expect(history.interruptStale(new Set())).toBe(1)
      expect(history.read(collection.id)?.status).toBe('running')
      expect(history.read(mention.id)?.status).toBe('interrupted')
      // The app restarts.
      expect(history.interruptStale(new Set(), new Date(), 'collection')).toBe(
        1
      )
      expect(history.read(collection.id)).toMatchObject({
        status: 'interrupted',
        error: 'Interrupted by app restart',
      })
      expect(history.reopen(collection.id)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps collections out of the run history MCP', async () => {
    const server = createHistoryServer({
      reader,
      enabled: () => true,
      version: 'test',
    })
    const client = new Client({ name: 'test', version: '1' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await server.connect(serverSide)
    await client.connect(clientSide)
    try {
      const recent = await client.callTool({
        name: 'recent_runs',
        arguments: {},
      })
      const [content] = recent.content as { text: string }[]
      const runs = (JSON.parse(content!.text) as { runs: { id: string }[] })
        .runs
      const collection = reader.list({ kind: 'collection' })[0]!
      expect(runs.map((run) => run.id)).not.toContain(collection.id)
      const one = await client.callTool({
        name: 'get_run',
        arguments: { id: collection.id },
      })
      expect(one.isError).toBe(true)
    } finally {
      await client.close()
    }
  })
})

describe('recording a collection', () => {
  it('leaves out the model’s words and what the Slack connector was asked and returned', () => {
    const steps = new CollectionEvents()
    const at = '2026-10-11T05:00:00.000Z'
    const events = [
      assistant({ type: 'text', text: 'Mina asked you to review the PR.' }),
      assistant({
        type: 'tool_use',
        id: 's1',
        name: 'mcp__claude_ai_Slack__slack_search_public_and_private',
        input: { query: 'to:me from:mina' },
      }),
      toolResult('s1', 'Mina: can you review the payment PR?'),
      assistant({
        type: 'tool_use',
        id: 'p1',
        name: 'mcp__pacenote__add_tasks',
        input: { tasks: [{ title: 'Review the payment PR', link: 'x' }] },
      }),
      toolResult(
        'p1',
        '{"added":[{"id":"t1","title":"Review the payment PR"}]}'
      ),
    ].flatMap((line) => steps.from(line, at))

    expect(events.some((event) => event.kind === 'message')).toBe(false)
    const tools = events.filter(
      (event): event is Extract<RunEvent, { kind: 'tool' }> =>
        event.kind === 'tool'
    )
    expect(tools[0]).toMatchObject({
      id: 's1',
      server: 'claude_ai_Slack',
      tool: 'slack_search_public_and_private',
    })
    expect(tools[0]).not.toHaveProperty('arguments')
    expect(tools[1]).toMatchObject({ id: 's1', status: 'completed' })
    expect(tools[1]).not.toHaveProperty('result')
    expect(JSON.stringify(events)).not.toContain('Mina')
    // Pacenote's own tool keeps what it was given and what it answered.
    expect(tools[2]).toMatchObject({
      server: 'pacenote',
      tool: 'add_tasks',
      arguments: { tasks: [{ title: 'Review the payment PR', link: 'x' }] },
    })
    expect(tools[3]?.result).toContain('Review the payment PR')
  })

  it('ends the run succeeded, stopped or failed, with what it found', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-record-'))
    try {
      const history = new HistoryStore(dir)
      const reader = new HistoryReader(dir)
      const at = (minute: number) => new Date(2026, 9, 11, 10, minute)
      const ok = recordCollection(history, at(0))
      ok.event({ kind: 'usage', at: at(0).toISOString(), inputTokens: 10 })
      ok.finish({
        at: at(1).toISOString(),
        ok: true,
        added: 1,
        maybe: 0,
        skipped: 0,
        reads: 5,
      })
      recordCollection(history, at(2)).finish({
        at: at(2).toISOString(),
        ok: false,
        error: 'Stopped.',
        reads: 2,
      })
      recordCollection(history, at(3)).finish({
        at: at(3).toISOString(),
        ok: false,
        error: 'Claude Code is not signed in.',
      })
      const [failed, stopped, done] = reader
        .list({ kind: 'collection' })
        .map((summary) => reader.get(summary.id) as CollectionRunRecord)
      expect(done).toMatchObject({
        status: 'succeeded',
        trigger: 'now',
        backend: { reasoner: 'claude', sandbox: 'host' },
        reads: 5,
        found: { added: 1, maybe: 0, skipped: 0 },
        durationMs: 60_000,
      })
      expect(done!.events).toHaveLength(1)
      expect(stopped).toMatchObject({ status: 'interrupted', reads: 2 })
      expect(failed).toMatchObject({
        status: 'failed',
        error: 'Claude Code is not signed in.',
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('a collection on screen', () => {
  const run = (events: RunEvent[]): CollectionRunRecord => ({
    version: 3,
    kind: 'collection',
    id: '20261011-100000-abc123',
    status: 'succeeded',
    attempts: 1,
    startedAt: '2026-10-11T01:00:00.000Z',
    updatedAt: '2026-10-11T01:00:25.000Z',
    trigger: 'now',
    backend,
    events,
  })
  const call = (
    id: string,
    server: string,
    tool: string,
    seconds: number,
    took: number,
    result?: string
  ): RunEvent => ({
    kind: 'tool',
    id,
    at: new Date(
      Date.parse('2026-10-11T01:00:00.000Z') + seconds * 1000
    ).toISOString(),
    server,
    tool,
    status: 'completed',
    result,
    finishedAt: new Date(
      Date.parse('2026-10-11T01:00:00.000Z') + (seconds + took) * 1000
    ).toISOString(),
  })

  it('groups the same tool in a row, and reads what Pacenote’s tools answered', () => {
    const record = run([
      call(
        'a',
        'pacenote',
        'collect_context',
        0,
        0.2,
        '{"since":"2026-10-10T05:00:00.000Z","dms":false,"leaveOut":["random"]}'
      ),
      call('b', 'claude_ai_Slack', 'slack_read_thread', 1, 1),
      call('c', 'claude_ai_Slack', 'slack_read_thread', 2, 2),
      call('d', 'claude_ai_Slack', 'slack_search_public_and_private', 5, 1),
      call(
        'e',
        'pacenote',
        'add_tasks',
        7,
        0.3,
        JSON.stringify({
          added: [
            { id: 't1', title: 'Review the PR', confidence: 'sure' },
            { id: 't2', title: 'Look at the check', confidence: 'maybe' },
          ],
          skipped: [{ link: 'x', why: '#random is left out' }],
        })
      ),
      call(
        'f',
        'pacenote',
        'close_task',
        8,
        0.1,
        '{"closed":{"id":"t0","title":"Share the draft","why":"replied","wrapUp":"ana took the draft as is."}}'
      ),
      call(
        'g',
        'pacenote',
        'update_task',
        9,
        0.1,
        '{"updated":{"id":"t9","title":"Review the PR","why":"due moved to Wednesday","changed":["due"]}}'
      ),
      call(
        'h',
        'pacenote',
        'wrap_up_task',
        10,
        0.1,
        '{"wrappedUp":{"id":"t8","title":"Fix the deploy check","wrapUp":"jun merged the fix; the check passes."}}'
      ),
    ])
    const groups = lookupGroups(record)
    expect(groups.map((group) => [group.label, group.count])).toEqual([
      ['Got the rules', 1],
      ['Read a thread', 2],
      ['Searched messages', 1],
      ['Added tasks', 1],
      ['Closed a task', 1],
      ['Updated a task', 1],
      ['Wrapped up a task', 1],
    ])
    expect(groups[1]).toMatchObject({
      offsetMs: 1000,
      durationMs: 3000,
      from: 'connector',
    })
    expect(groups[0]!.note).toContain('DMs not counted · 1 channel left out')
    expect(groups[3]!.note).toBe(
      '1 task added, 1 Maybe, 1 left out by your settings'
    )

    const result = collectionResult(record)
    expect(result.added.map((task) => task.title)).toEqual([
      'Review the PR',
      'Look at the check',
    ])
    expect(result.closed).toEqual([
      {
        id: 't0',
        title: 'Share the draft',
        why: 'replied',
        wrapUp: 'ana took the draft as is.',
      },
    ])
    expect(result.updated).toEqual([
      { id: 't9', title: 'Review the PR', why: 'due moved to Wednesday' },
    ])
    expect(groups[5]!.note).toBe('Review the PR: due moved to Wednesday')
    expect(result.wrapped).toEqual([
      {
        id: 't8',
        title: 'Fix the deploy check',
        wrapUp: 'jun merged the fix; the check passes.',
      },
    ])
    expect(groups[6]!.note).toBe(
      'Fix the deploy check: jun merged the fix; the check passes.'
    )
    expect(result.skipped).toEqual([{ link: 'x', why: '#random is left out' }])
    expect(result.rules).toContain('leaveOut')
  })
})
