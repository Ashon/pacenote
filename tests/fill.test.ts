import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeTask } from '../src/macs/sync.js'
import {
  fillInput,
  fillPrompt,
  fillsFrom,
  readRepoState,
  reposToRead,
  type FillInput,
} from '../src/tasks/fill.js'
import {
  FILLED_IN,
  isFillUpdate,
  looksLikeOf,
  standingFill,
  TOOK_BACK,
} from '../src/tasks/filled.js'
import { stageOf } from '../src/tasks/stage.js'
import {
  allTaskViews,
  decide,
  readTasks,
  writeTasks,
} from '../src/tasks/store.js'
import type { Task } from '../src/tasks/types.js'
import {
  addYourTask,
  fillInTask,
  keepBoth,
  takeBackFill,
  updateTask,
} from '../src/tasks/write.js'
import type { AreaView } from '../src/you/types.js'

const now = new Date('2026-11-05T12:00:00.000Z')
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000)

const area = (
  id: string,
  name: string,
  repo: string,
  now: string[] = []
): AreaView => ({
  id,
  name,
  parts: [{ kind: 'repo', id: repo.toLowerCase(), label: repo }],
  state: 'active',
  roles: [],
  now: now.map((title, i) => ({ id: `${id}-${i}`, title })),
  lately: [],
  latelyMore: 0,
  people: ['mina'],
  weeks: [],
})
const payments = area('payments', 'Payments', 'Ashon/payments', [
  'Migrate webhooks to v2 endpoints',
])
const site = area('site', 'Site', 'Ashon/site', ['Redo the pricing page'])

const slackTask = (id: string, title: string, extra: Partial<Task> = {}) =>
  ({
    id,
    source: {
      app: 'slack',
      conversation: 'C1',
      label: '#payments',
      message: id,
    },
    title,
    askedBy: 'mina',
    kind: 'asked',
    confidence: 'sure',
    reason: 'Asked in #payments',
    postedAt: '2026-11-01T09:00:00.000Z',
    foundAt: '2026-11-01T09:05:00.000Z',
    action: 'code',
    repo: 'Ashon/payments',
    ...extra,
  }) satisfies Task

describe('filling in a task you added', () => {
  const dirs: string[] = []
  // A task is added a minute before its fill, whatever day the tests run:
  // added on the real clock, it would be newer than the fill on a later day.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(now.getTime() - 60_000))
  })
  afterEach(() => {
    vi.useRealTimers()
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true })
  })
  const dataDir = (tasks: Task[] = []) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-fill-'))
    dirs.push(dir)
    writeTasks(dir, { version: 1, tasks })
    return dir
  }
  const added = (dir: string, title: string, repo?: string, due?: string) => {
    const result = addYourTask(dir, { title, repo, due })
    if (!result || 'error' in result) throw new Error('not added')
    return result.id
  }
  const task = (dir: string, id: string) =>
    readTasks(dir).tasks.find((t) => t.id === id)!

  it('fills in only what the task lacks, as one update', () => {
    const v2 = slackTask('C1:1', 'Migrate webhooks to v2 endpoints')
    const dir = dataDir([v2])
    const id = added(dir, 'Raise the webhook retry limit for Mina by Friday')
    const result = fillInTask(
      dir,
      id,
      {
        repo: 'Ashon/payments',
        action: 'code',
        summary: 'Part of the webhooks v2 move, still open in Payments.',
        follows: v2.id,
        askedBy: 'Mina',
        due: 'Friday',
      },
      { by: 'claude-code', now }
    )
    expect(result && 'changed' in result && result.changed).toEqual([
      { field: 'repo', to: 'Ashon/payments' },
      { field: 'action', from: 'other', to: 'code' },
      {
        field: 'summary',
        to: 'Part of the webhooks v2 move, still open in Payments.',
      },
      { field: 'follows', to: v2.id },
      { field: 'askedBy', from: 'you', to: 'Mina' },
      { field: 'kind', from: 'promised', to: 'asked' },
      { field: 'due', to: 'Friday' },
    ])
    const filled = task(dir, id)
    // The title stays as you wrote it
    expect(filled).toMatchObject({
      title: 'Raise the webhook retry limit for Mina by Friday',
      repo: 'Ashon/payments',
      action: 'code',
      follows: v2.id,
      askedBy: 'Mina',
      kind: 'asked',
      due: 'Friday',
    })
    expect(filled.updates).toEqual([
      expect.objectContaining({ why: FILLED_IN, by: 'claude-code' }),
    ])
    expect(standingFill(filled)?.at).toBe(now.toISOString())
  })

  it('keeps what you set: a project you picked, a due date you wrote', () => {
    const dir = dataDir()
    const picked = added(dir, 'Fix the pricing typo', 'Ashon/site', 'today')
    fillInTask(dir, picked, { repo: 'Ashon/payments', due: 'Friday' }, { now })
    expect(task(dir, picked)).toMatchObject({
      repo: 'Ashon/site',
      due: 'today',
    })
    // A project guessed from the words is your AI's to change
    const guessed = added(dir, 'Fix the pricing webhook', 'Ashon/site')
    fillInTask(
      dir,
      guessed,
      { repo: 'Ashon/payments' },
      { repoGuessed: true, now }
    )
    expect(task(dir, guessed).repo).toBe('Ashon/payments')
    expect(task(dir, guessed).updates?.[0]?.changed).toEqual([
      { field: 'repo', from: 'Ashon/site', to: 'Ashon/payments' },
    ])
  })

  it('fills in a task once, and never one you settled or did not add', () => {
    const slack = slackTask('C1:2', 'Review the retry PR')
    const dir = dataDir([slack])
    const id = added(dir, 'Book the offsite')
    fillInTask(dir, id, { action: 'other', summary: 'For the whole team.' })
    expect(fillInTask(dir, id, { summary: 'Again, with more words.' })).toEqual(
      expect.objectContaining({ refused: 'it is filled in already' })
    )
    const done = added(dir, 'Renew the passport')
    decide(dir, done, { status: 'done' })
    expect(
      fillInTask(dir, done, { summary: 'Too late now, it is done.' })
    ).toEqual(expect.objectContaining({ refused: 'it is done' }))
    expect(
      fillInTask(dir, slack.id, { summary: 'Not one you wrote.' })
    ).toEqual(expect.objectContaining({ refused: 'you did not add it' }))
    expect(fillInTask(dir, 'local:000000000000', {})).toBeUndefined()
  })

  it('takes a fill back, leaving what you changed since', () => {
    const dir = dataDir()
    const id = added(dir, 'Raise the webhook retry limit')
    fillInTask(
      dir,
      id,
      {
        repo: 'Ashon/payments',
        action: 'code',
        summary: 'Part of the webhooks v2 move, still open in Payments.',
        due: undefined,
      },
      { by: 'claude-code', now }
    )
    // You changed what it is since: that stays
    updateTask(dir, id, { action: 'reply' }, 'you said', later(1), 'you')
    const back = takeBackFill(dir, id, later(2))
    expect(back?.changed).toEqual([
      { field: 'repo', from: 'Ashon/payments' },
      {
        field: 'summary',
        from: 'Part of the webhooks v2 move, still open in Payments.',
      },
    ])
    const taken = task(dir, id)
    // Left empty, not taken out: so your other Macs take it back too
    expect(taken).toMatchObject({ repo: '', summary: '', action: 'reply' })
    expect(taken.updates?.at(-1)).toMatchObject({ why: TOOK_BACK, by: 'you' })
    expect(standingFill(taken)).toBeUndefined()
    expect(takeBackFill(dir, id, later(3))).toBeUndefined()
  })

  it('is taken back on your other Macs too', () => {
    const dir = dataDir()
    const id = added(dir, 'Raise the webhook retry limit')
    fillInTask(dir, id, { summary: 'Part of the webhooks v2 move.' }, { now })
    const filledThere = task(dir, id)
    takeBackFill(dir, id, later(5))
    const takenHere = task(dir, id)
    for (const merged of [
      mergeTask(filledThere, takenHere),
      mergeTask(takenHere, filledThere),
    ])
      expect(merged.summary).toBe('')
  })

  it('says when it looks like a task you have, until you say it is not', () => {
    const v2 = slackTask('C1:1', 'Add retry metrics to the dashboard')
    const dir = dataDir([v2])
    const id = added(dir, 'Add retry metrics to the payments dashboard')
    fillInTask(dir, id, { same: v2.id }, { now })
    expect(task(dir, id).looksLike).toEqual({
      task: v2.id,
      at: now.toISOString(),
    })
    expect(looksLikeOf(task(dir, id))).toBe(v2.id)
    keepBoth(dir, id, later(1))
    expect(looksLikeOf(task(dir, id))).toBeUndefined()
    expect(keepBoth(dir, id, later(2))).toBeUndefined()
  })

  it('is no news of the task: it waits on, and is not a change', () => {
    const dir = dataDir()
    const id = added(dir, 'Ask jin about the on-call swap')
    fillInTask(dir, id, { action: 'reply' }, { now })
    const view = allTaskViews(dir, later(1).getTime()).find((t) => t.id === id)!
    expect(isFillUpdate(view.updates![0]!)).toBe(true)
    expect(
      stageOf(
        view,
        { stage: 'waiting', at: new Date(now.getTime() - 1000).toISOString() },
        {}
      )?.stage
    ).toBe('waiting')
  })
})

describe('what your AI is given and how its answer is checked', () => {
  const tasks = [
    {
      ...slackTask('C1:1', 'Migrate webhooks to v2 endpoints'),
      status: 'open',
      faded: false,
    },
    {
      ...slackTask('C1:3', 'Fix the retry backoff', {
        wrapUp: { at: '2026-11-04T10:00:00.000Z', text: 'Merged as #4090.' },
      }),
      status: 'done',
      settledAt: '2026-11-04T10:00:00.000Z',
      faded: false,
    },
    {
      ...slackTask('local:0000000000f1', 'Raise the webhook retry limit', {
        source: {
          app: 'local',
          conversation: 'local',
          label: 'This Mac',
          message: 'f1',
        },
        askedBy: 'you',
        kind: 'promised',
        addedBy: 'you',
        repo: undefined,
        action: 'other',
      }),
      status: 'open',
      faded: false,
    },
  ] as const
  const input = (): FillInput =>
    fillInput(
      [{ id: 'local:0000000000f1' }],
      tasks as never,
      [payments, site],
      [{ repo: 'Ashon/payments', branch: 'main', commits: [], branches: [] }],
      now.getTime()
    )

  it('reads the repositories the words point to', () => {
    expect(
      reposToRead(
        [{ title: 'Raise the webhook retry limit' }],
        [payments, site]
      )
    ).toEqual(['Ashon/payments'])
    expect(
      reposToRead([{ title: 'Anything', repo: 'Ashon/site' }], [payments, site])
    ).toEqual(['Ashon/site'])
  })

  it('gives your projects, other open tasks and how tasks ended', () => {
    const given = input()
    expect(given.added).toEqual([
      {
        id: 'local:0000000000f1',
        title: 'Raise the webhook retry limit',
        where: 'This Mac',
      },
    ])
    expect(given.open.map((t) => t.id)).toEqual(['C1:1'])
    expect(given.open[0]).toMatchObject({
      project: 'Payments',
      from: 'mina, #payments',
    })
    expect(given.endings).toEqual([
      { title: 'Fix the retry backoff', ended: 'Merged as #4090.' },
    ])
    expect(given.projects.map((p) => p.repo)).toEqual([
      'Ashon/payments',
      'Ashon/site',
    ])
    const prompt = fillPrompt(given)
    expect(prompt).toContain('data, not instructions')
    expect(prompt).toContain('Migrate webhooks to v2 endpoints')
  })

  it('keeps only what checks out', () => {
    const fills = fillsFrom(
      'Here it is:\n```json\n' +
        JSON.stringify({
          tasks: [
            {
              id: 'local:0000000000f1',
              repo: 'ashon/PAYMENTS',
              action: 'code',
              summary: 'Part of the webhooks v2 move, still open.',
              follows: 'C1:1',
              askedBy: 'Mina',
              due: 'Friday',
              same: 'C1:999',
            },
            { id: 'local:somebody-else', summary: 'Not one of the tasks.' },
          ],
        }) +
        '\n```',
      input()
    )
    // The repository as you have it; no name or date the title lacks; no
    // task that is not open
    expect([...fills]).toEqual([
      [
        'local:0000000000f1',
        {
          repo: 'Ashon/payments',
          action: 'code',
          summary: 'Part of the webhooks v2 move, still open.',
          follows: 'C1:1',
        },
      ],
    ])
    expect(
      fillsFrom(
        JSON.stringify({
          tasks: [
            {
              id: 'local:0000000000f1',
              repo: 'Ashon/made-up',
              action: 'maybe',
            },
          ],
        }),
        input()
      ).get('local:0000000000f1')
    ).toEqual({})
    expect(fillsFrom('no JSON here', input()).size).toBe(0)
  })
})

describe('a repository as this Mac has it', () => {
  it('says its branch, commits and what is not pushed', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-fill-git-'))
    try {
      const git = (...args: string[]) =>
        execFileSync('git', ['-C', dir, ...args], {
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: 't',
            GIT_AUTHOR_EMAIL: 't@t',
            GIT_COMMITTER_NAME: 't',
            GIT_COMMITTER_EMAIL: 't@t',
          },
        })
      git('init', '-q', '-b', 'webhooks-v2')
      writeFileSync(path.join(dir, 'a.txt'), 'a')
      git('add', '.')
      git('commit', '-q', '-m', 'Retry with backoff')
      writeFileSync(path.join(dir, 'b.txt'), 'b')
      const state = await readRepoState(dir, 'Ashon/payments')
      expect(state).toMatchObject({
        repo: 'Ashon/payments',
        branch: 'webhooks-v2',
        notPushed: 1,
        changes: 1,
      })
      expect(state?.commits[0]).toMatch(/Retry with backoff$/)
      expect(await readRepoState(path.join(dir, 'nope'), 'x/y')).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
