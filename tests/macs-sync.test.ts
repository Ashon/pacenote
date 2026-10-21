import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Macs, MACS_FILE } from '../src/macs/macs.js'
import {
  mergeCollections,
  mergeDecisions,
  mergeTask,
  mergeTasks,
  mergeWork,
  mergeWritten,
  mergeYou,
} from '../src/macs/sync.js'
import { TodoSync } from '../src/macs/todo-sync.js'
import { readCollections } from '../src/tasks/collections.js'
import {
  decide,
  readDecisions,
  readTakenBack,
  readTasks,
  writeTasks,
} from '../src/tasks/store.js'
import type {
  CollectionRecord,
  Task,
  TasksFile,
  WorkEntry,
  WorkFile,
} from '../src/tasks/types.js'
import { addWork, readWork } from '../src/tasks/work.js'
import type { AreaRecord, YouFile } from '../src/you/types.js'

/** Waits for a Mac to get there, with room for a busy test run */
const poll = <T>(check: () => T) =>
  expect.poll(check, { timeout: 15_000, interval: 50 })

const NOW = Date.parse('2026-10-21T12:00:00Z')
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  source: {
    conversation: 'C1',
    label: '#ops',
    message: id,
    permalink: `https://acme.slack.com/archives/C1/p${id}`,
  },
  title: `Task ${id}`,
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by mina',
  postedAt: at(-60),
  foundAt: at(-50),
  ...patch,
})

const file = (tasks: Task[], patch: Partial<TasksFile> = {}): TasksFile => ({
  version: 1,
  tasks,
  ...patch,
})

describe('merging your Todo from two Macs', () => {
  it('keeps every task, and the version of each changed last', () => {
    const pro = file(
      [
        task('1'),
        task('2', {
          due: 'Friday',
          updates: [
            {
              at: at(-10),
              why: 'moved to Friday',
              changed: [{ field: 'due', to: 'Friday' }],
            },
          ],
        }),
      ],
      { collectedAt: at(-10) }
    )
    const air = file([task('2', { due: 'Thursday' }), task('3')], {
      collectedAt: at(-30),
    })
    const merged = mergeTasks(pro, air, NOW)
    expect(merged.tasks.map((t) => [t.id, t.due])).toEqual([
      ['1', undefined],
      ['2', 'Friday'],
      ['3', undefined],
    ])
    expect(merged.collectedAt).toBe(at(-10))
    // The same whichever Mac merges, and nothing more to do once merged
    expect(mergeTasks(air, pro, NOW)).toEqual(merged)
    expect(mergeTasks(merged, air, NOW)).toEqual(merged)
  })

  it('keeps a task closed on either Mac, and the latest wrap-up', () => {
    const closed = task('1', {
      closed: { at: at(-5), why: 'replied' },
      wrapUp: { at: at(-4), text: 'Done by mina.' },
    })
    const updated = task('1', {
      updates: [
        {
          at: at(-2),
          why: 'repo named',
          changed: [{ field: 'repo', to: 'Ashon/payments' }],
        },
      ],
      repo: 'Ashon/payments',
    })
    const merged = mergeTask(closed, updated)
    expect(merged).toMatchObject({
      repo: 'Ashon/payments',
      closed: { why: 'replied' },
      wrapUp: { text: 'Done by mina.' },
    })
    expect(mergeTask(updated, closed)).toEqual(merged)
  })

  it('lets the latest decision stand, one taken back included', () => {
    const merged = mergeDecisions(
      {
        decisions: { '1': { status: 'done', at: at(-10) } },
        takenBack: {},
      },
      {
        decisions: {
          '2': { status: 'dismissed', reason: 'not-mine', at: at(-3) },
        },
        // Done on the Pro, then taken back on the Air
        takenBack: { '1': at(-5) },
      }
    )
    expect(merged.decisions).toEqual({
      '2': { status: 'dismissed', reason: 'not-mine', at: at(-3) },
    })
    // Done again later: the decision stands, and what was taken back goes
    const again = mergeDecisions(merged, {
      decisions: { '1': { status: 'done', at: at(-1) } },
      takenBack: {},
    })
    expect(again.decisions['1']).toEqual({ status: 'done', at: at(-1) })
    expect(again.takenBack).toEqual({})
  })

  it("marks a session with the Mac it's on, and unmarks it back home", () => {
    const session = (id: string, patch = {}): WorkEntry => ({
      kind: 'session',
      id,
      task: '1',
      tool: 'claude',
      cwd: '/Users/me/payments',
      startedAt: at(-20),
      ...patch,
    })
    const work = (entries: WorkEntry[]): WorkFile => ({
      version: 1,
      entries,
      notIt: [],
    })
    const onAir = mergeWork(
      work([session('here')]),
      work([session('there', { session: 'abc' })]),
      { here: 'air', peer: 'pro' }
    )
    expect(
      onAir.entries.map((e) => [e.id, e.kind === 'session' && e.mac])
    ).toEqual([
      ['here', undefined],
      ['there', 'pro'],
    ])
    // Back on the Pro: its own session loses the mark, the Air's gains one.
    const onPro = mergeWork(
      work([session('there', { session: 'abc', resumedAt: [at(-1)] })]),
      onAir,
      {
        here: 'pro',
        peer: 'air',
      }
    )
    expect(
      onPro.entries.map((e) => [e.id, e.kind === 'session' && e.mac])
    ).toEqual([
      ['here', 'air'],
      ['there', undefined],
    ])
    expect(onPro.entries[1]).toMatchObject({ resumedAt: [at(-1)] })
  })

  it("keeps the latest write-up, your areas from both, and the other Mac's collections", () => {
    expect(
      mergeWritten(
        { 'day:2026-10-20': { text: 'old', at: at(-60), by: 'claude' } },
        {
          'day:2026-10-20': { text: 'new', at: at(-5), by: 'codex' },
          'week:2026-W43': { text: 'week', at: at(-5), by: 'claude' },
        }
      )
    ).toEqual({
      'day:2026-10-20': { text: 'new', at: at(-5), by: 'codex' },
      'week:2026-W43': { text: 'week', at: at(-5), by: 'claude' },
    })

    const area = (patch: Partial<AreaRecord>): AreaRecord => ({
      id: 'payments',
      name: 'payments',
      parts: [{ kind: 'repo', id: 'Ashon/payments', label: 'Ashon/payments' }],
      createdAt: at(-1000),
      ...patch,
    })
    const you = (
      areas: AreaRecord[],
      patch: Partial<YouFile> = {}
    ): YouFile => ({
      version: 1,
      areas,
      ...patch,
    })
    const merged = mergeYou(
      you([area({ name: 'Payments', named: true })], {
        accounts: { checkedAt: at(-1), github: 'ashon' },
      }),
      you(
        [
          area({
            parts: [
              { kind: 'repo', id: 'Ashon/payments', label: 'Ashon/payments' },
              { kind: 'channel', id: 'C9', label: '#payments' },
            ],
            out: ['repo:Ashon/payments'],
          }),
        ],
        { confirmedAt: at(-2) }
      )
    )
    expect(merged.areas).toEqual([
      area({
        name: 'Payments',
        named: true,
        parts: [{ kind: 'channel', id: 'C9', label: '#payments' }],
        out: ['repo:Ashon/payments'],
      }),
    ])
    expect(merged).toMatchObject({
      confirmedAt: at(-2),
      accounts: { github: 'ashon' },
    })

    const row = (startedAt: string, patch: Partial<CollectionRecord> = {}) =>
      ({
        at: startedAt,
        startedAt,
        trigger: 'now',
        ok: true,
        added: 1,
        maybe: 0,
        skipped: 0,
        ...patch,
      }) as CollectionRecord
    expect(
      mergeCollections(
        [row(at(-3000)), row(at(-30), { mac: 'pro' })],
        [row(at(-10)), row(at(-20 * 24 * 60))],
        'pro',
        NOW
      )
    ).toEqual([row(at(-10), { mac: 'pro' }), row(at(-3000))])
  })
})

describe('your Todo between two Macs', () => {
  const dirs: string[] = []
  const stops: (() => Promise<void> | void)[] = []
  afterEach(async () => {
    for (const stop of stops.splice(0).reverse()) await stop()
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true })
  })

  async function mac(name: string) {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'pacenote-sync-'))
    dirs.push(dataDir)
    writeFileSync(
      path.join(dataDir, MACS_FILE),
      JSON.stringify({ follow: true })
    )
    const macs = new Macs({
      dataDir,
      appToken: () => 'xapp-1-HOME',
      name,
      version: '0.5.30',
      use: () => ({ idle: 1, locked: false, asleep: false }),
      pace: () => ({ ready: true, answering: true }),
      onAnswer: () => undefined,
      log: () => undefined,
      port: 0,
      bonjour: false,
      tickMs: 50,
    })
    const sync = new TodoSync({
      dataDir,
      macs,
      collections: () => [],
      log: () => undefined,
    })
    await macs.start()
    sync.start()
    stops.push(
      () => macs.stop(),
      () => sync.stop()
    )
    return { dataDir, macs }
  }

  it('brings what each Mac has to the other, and a decision made on one', async () => {
    const pro = await mac('MacBook Pro')
    const air = await mac('MacBook Air')
    const recent = (id: string) =>
      task(id, {
        postedAt: new Date().toISOString(),
        foundAt: new Date().toISOString(),
      })
    writeTasks(pro.dataDir, file([recent('1')]))
    writeTasks(air.dataDir, file([recent('2')]))
    addWork(air.dataDir, {
      kind: 'session',
      id: 'w1',
      task: '2',
      tool: 'codex',
      cwd: '/Users/me/app',
      startedAt: new Date().toISOString(),
    })
    air.macs.addAddress(`127.0.0.1:${pro.macs.listening}`)

    const ids = (dataDir: string) =>
      readTasks(dataDir)
        .tasks.map((t) => t.id)
        .sort()
    await poll(() => ids(pro.dataDir)).toEqual(['1', '2'])
    await poll(() => ids(air.dataDir)).toEqual(['1', '2'])
    await poll(() => readWork(pro.dataDir).entries[0]).toMatchObject({
      id: 'w1',
      mac: air.macs.id,
    })
    expect(readWork(air.dataDir).entries[0]).not.toHaveProperty('mac')

    // Done on the Air, taken back on the Pro
    decide(air.dataDir, '1', { status: 'done' })
    await poll(() => readDecisions(pro.dataDir)['1']?.status).toBe('done')
    decide(pro.dataDir, '1', undefined, new Date(Date.now() + 1_000))
    await poll(() => readDecisions(air.dataDir)['1']).toBeUndefined()
    expect(Object.keys(readTakenBack(air.dataDir))).toEqual(['1'])
    expect(readCollections(air.dataDir)).toEqual([])
    expect(
      JSON.parse(readFileSync(path.join(pro.dataDir, 'tasks.json'), 'utf8'))
    ).toEqual(readTasks(air.dataDir))
  }, 60_000)
})
