import { FILLED_IN } from '@src/tasks/filled'
import type { TaskView } from '@src/tasks/types'
import { describe, expect, it } from 'vitest'
import { repoFolderOf, taskRowState, type TaskRowInput } from './task-row-state'
import { text } from './task-row.text'

const NOW = Date.parse('2026-11-07T09:00:00Z')
const HOUR = 3600_000
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const task = (extra: Partial<TaskView> = {}): TaskView => ({
  id: 't1',
  source: { conversation: 'C1', label: '#payments', message: '1' },
  title: 'Review the retry PR',
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by name',
  postedAt: ago(48 * HOUR),
  foundAt: ago(47 * HOUR),
  status: 'open',
  faded: false,
  ...extra,
})

const stateOf = (extra: Partial<TaskRowInput> = {}) =>
  taskRowState(
    {
      task: task(),
      cli: 'claude',
      tools: ['claude', 'codex'],
      open: false,
      dismissing: false,
      staging: true,
      ...extra,
    },
    text.en,
    NOW
  )

const labels = (steps: { label: string }[]) => steps.map((step) => step.label)

describe("a task's row", () => {
  it('gives an open code task a button for each tool, Settings first', () => {
    const state = stateOf({
      task: task({ action: 'code', repo: 'Acme/Pay', due: 'Friday' }),
      cli: 'codex',
      repos: { 'acme/pay': '/Users/me/code/pay' },
    })
    expect(state).toMatchObject({
      acting: true,
      settled: false,
      continues: true,
      drafts: false,
      decide: 'open',
      due: 'Friday',
      sourceLabel: 'Slack',
      tools: ['codex', 'claude'],
      folder: '/Users/me/code/pay',
    })
    // Its tools have buttons; another folder and a reply are in the menu
    expect(labels(state.menu)).toEqual([
      'Continue in another folder',
      'Draft a reply',
    ])
    expect(labels(state.stages)).toEqual([
      'Mark in progress',
      'Waiting on someone else',
    ])
  })

  it('puts the tools in the menu of a task that is not code', () => {
    const state = stateOf({ task: task({ action: 'reply' }) })
    expect(state.continues).toBe(false)
    expect(state.drafts).toBe(true)
    expect(state.menu).toEqual([
      { kind: 'continue', tool: 'claude', label: 'Continue in Claude Code' },
      { kind: 'continue', tool: 'codex', label: 'Continue in Codex' },
    ])
  })

  it('has no reply to draft for a task from a session on this Mac', () => {
    const state = stateOf({
      task: task({
        action: 'reply',
        source: {
          app: 'local',
          conversation: 'local',
          label: 'This Mac',
          message: 'm',
        },
      }),
    })
    expect(state.local).toBe(true)
    expect(state.sourceLabel).toBe('This Mac')
    expect(state.drafts).toBe(false)
    expect(labels(state.menu)).not.toContain('Draft a reply')
  })

  it('offers the stages from where it stands, when they can be set', () => {
    const started = stateOf({
      stage: { stage: 'started', at: ago(HOUR), by: 'you' },
    })
    expect(started.stages).toEqual([
      { kind: 'stage', stage: 'open', label: 'Not in progress' },
      { kind: 'stage', stage: 'waiting', label: 'Waiting on someone else' },
    ])
    const waiting = stateOf({
      stage: { stage: 'waiting', at: ago(HOUR), by: 'you' },
    })
    expect(labels(waiting.stages)).toEqual(['Mark in progress'])
    expect(waiting.backToOpen).toBe(true)
    const fixed = stateOf({
      staging: false,
      stage: { stage: 'waiting', at: ago(HOUR), by: 'you' },
    })
    expect(fixed.stages).toEqual([])
    expect(fixed.backToOpen).toBe(false)
  })

  it('asks why instead of its steps while it is being dismissed', () => {
    const state = stateOf({
      task: task({ action: 'code' }),
      dismissing: true,
      looksLike: task({ id: 't0' }),
      filling: 'Claude Code',
      askGroup: '@payments-team',
    })
    expect(state).toMatchObject({
      acting: false,
      continues: false,
      decide: undefined,
      looksLike: undefined,
      filling: undefined,
      asking: false,
    })
  })

  it('keeps a Maybe, or dismisses it', () => {
    const state = stateOf({
      task: task({ status: 'maybe', confidence: 'maybe' }),
      askGroup: '@payments-team',
    })
    expect(state.decide).toBe('maybe')
    expect(state.acting).toBe(false)
    expect(state.asking).toBe(true)
    expect(state.settledLabel).toBeUndefined()
    expect(
      stateOf({ task: task({ status: 'maybe' }), dismissing: true })
    ).toMatchObject({ decide: undefined })
  })

  it('says how a settled task was settled, and reopens it', () => {
    const done = stateOf({ task: task({ status: 'done', due: 'Friday' }) })
    expect(done).toMatchObject({
      settled: true,
      settledLabel: 'Done',
      decide: 'settled',
      reopen: null,
      due: undefined,
    })
    const dismissed = stateOf({
      task: task({ status: 'dismissed', dismissReason: 'not-mine' }),
    })
    expect(dismissed.settledLabel).toBe('Dismissed: not for me')
    expect(stateOf({ task: task({ status: 'dismissed' }) }).settledLabel).toBe(
      'Dismissed'
    )
    const byTool = stateOf({
      task: task({
        status: 'closed',
        closed: { at: ago(HOUR), why: 'resolved', by: 'claude-code' },
      }),
    })
    expect(byTool.settledLabel).toBe('Closed: done in Claude Code')
    // A closed task reopens as kept, so it does not close again by itself
    expect(byTool.reopen).toEqual({ status: 'kept' })
    expect(
      stateOf({
        task: task({
          status: 'closed',
          closed: { at: ago(1), why: 'resolved' },
        }),
      }).settledLabel
    ).toBe('Closed: settled in Slack')
    expect(
      stateOf({
        task: task({
          status: 'closed',
          closed: { at: ago(1), why: 'replied' },
        }),
      }).settledLabel
    ).toBe('Closed: you replied in the thread')
  })

  it('says it was updated, for a week and while the row is closed', () => {
    const change = (at: string) =>
      task({
        updates: [
          {
            at,
            why: 'mina moved it',
            changed: [{ field: 'due', from: 'Thursday', to: 'Friday' }],
          },
        ],
      })
    expect(stateOf({ task: change(ago(6 * 24 * HOUR)) }).updated?.why).toBe(
      'mina moved it'
    )
    expect(stateOf({ task: change(ago(8 * 24 * HOUR)) }).updated).toBe(
      undefined
    )
    expect(
      stateOf({ task: change(ago(HOUR)), open: true }).updated
    ).toBeUndefined()
  })

  it('says what your AI filled in for a day, and while it fills', () => {
    const filled = (at: string) =>
      task({
        updates: [
          { at, why: FILLED_IN, changed: [{ field: 'repo', to: 'acme/pay' }] },
        ],
      })
    const fresh = stateOf({ task: filled(ago(HOUR)) })
    expect(fresh.filled?.at).toBe(ago(HOUR))
    expect(fresh.fill?.at).toBe(ago(HOUR))
    const old = stateOf({ task: filled(ago(25 * HOUR)) })
    expect(old.filled).toBeUndefined()
    // The fill stands for the opened row after the day
    expect(old.fill?.at).toBe(ago(25 * HOUR))
    expect(
      stateOf({ task: filled(ago(HOUR)), filling: 'Codex' })
    ).toMatchObject({ filled: undefined, filling: 'Codex' })
    expect(stateOf({ task: filled(ago(HOUR)), open: true }).filled).toBe(
      undefined
    )
  })

  it('marks its session and an AI tool at work only while it is open', () => {
    const working = { tool: 'codex' as const, at: ago(HOUR) }
    const live = { by: 'claude-code', at: ago(1) }
    const proposal = {
      task: 't1',
      tool: 'claude' as const,
      session: 's1',
      activeAt: ago(HOUR),
      at: ago(1),
      done: true,
    }
    expect(stateOf({ working, live, proposal })).toMatchObject({
      working,
      atWork: true,
      looksDone: true,
      proposal,
    })
    // Opened, the row shows what the session looked like instead
    expect(stateOf({ proposal, open: true }).looksDone).toBe(false)
    expect(
      stateOf({ task: task({ status: 'done' }), working, live, proposal })
    ).toMatchObject({
      working: undefined,
      atWork: false,
      looksDone: false,
      proposal: undefined,
    })
  })

  it('names the task it carries on from only for one you added', () => {
    const before = task({ id: 't0', title: 'Fix the retry' })
    expect(
      stateOf({
        task: task({ addedBy: 'you', follows: 't0' }),
        followsTask: before,
      }).followsTask
    ).toBe(before)
    expect(
      stateOf({ task: task({ follows: 't0' }), followsTask: before })
        .followsTask
    ).toBeUndefined()
  })
})

describe("a repository's folder", () => {
  it('is found by its name in any case', () => {
    const repos = { 'Acme/Pay': '/code/pay' }
    expect(repoFolderOf(repos, 'acme/pay')).toBe('/code/pay')
    expect(repoFolderOf(repos, 'acme/web')).toBeUndefined()
    expect(repoFolderOf(repos, undefined)).toBeUndefined()
    expect(repoFolderOf(undefined, 'acme/pay')).toBeUndefined()
  })
})
