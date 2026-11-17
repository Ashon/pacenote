import { describe, expect, it } from 'vitest'
import type { SessionRow, SessionsView } from '../src/sessions/types.js'
import type { TaskView } from '../src/tasks/types.js'
import {
  canOpen,
  canShow,
  sessionsByTask,
  sessionsLine,
  tasksToLink,
} from '../apps/web/src/lib/session-rows.js'

const row = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: 'claude:s1',
  tool: 'claude',
  session: 's1',
  title: 'Session',
  where: 'claude-app',
  state: 'quiet',
  lastAt: '2026-11-17T08:00:00Z',
  startedAt: '2026-11-17T07:00:00Z',
  cwd: '/w/pay',
  typed: [],
  ...over,
})

const view = (over: Partial<SessionsView> = {}): SessionsView => ({
  on: true,
  open: [],
  ended: [],
  counts: { open: 0, working: 0, turn: 0, ended: 0 },
  listed: true,
  ...over,
})

const task = { id: 'T1', title: 'Fix billing' }

describe('canOpen and canShow: its page, and where it runs', () => {
  it("opens Claude Code's and Codex's in Pacenote, ended ones too", () => {
    expect(canOpen(row())).toBe(true)
    expect(canOpen(row({ state: 'ended' }))).toBe(true)
    expect(canOpen(row({ tool: 'codex', where: 'terminal' }))).toBe(true)
    expect(canOpen(row({ tool: 'opencode' }))).toBe(false)
  })

  it('shows an app or claude.ai, a terminal only when its app is known', () => {
    expect(canShow(row())).toBe(true)
    expect(canShow(row({ where: 'web' }))).toBe(true)
    expect(canShow(row({ where: 'terminal' }))).toBe(false)
    expect(canShow(row({ where: 'terminal', terminal: 'iTerm' }))).toBe(true)
    expect(canShow(row({ state: 'ended' }))).toBe(false)
    expect(canShow(row({ where: 'pacenote' }))).toBe(false)
    expect(canShow(row({ tool: 'codex', where: 'codex-app' }))).toBe(true)
    expect(
      canShow(row({ tool: 'codex', where: 'terminal', terminal: 'iTerm' }))
    ).toBe(false)
  })
})

describe("sessionsByTask: each task's open session", () => {
  it('takes the working one, else yours to answer, else the latest', () => {
    const v = view({
      open: [
        {
          key: 'repo:pay',
          name: 'payments',
          sessions: [
            row({
              id: 'a',
              state: 'quiet',
              task,
              lastAt: '2026-11-17T08:50:00Z',
            }),
            row({
              id: 'b',
              state: 'turn',
              task,
              lastAt: '2026-11-17T08:10:00Z',
            }),
            row({
              id: 'c',
              state: 'quiet',
              task: { id: 'T2', title: 'x' },
              lastAt: '2026-11-17T08:00:00Z',
            }),
            row({
              id: 'd',
              state: 'quiet',
              task: { id: 'T2', title: 'x' },
              lastAt: '2026-11-17T08:30:00Z',
            }),
            row({ id: 'e', state: 'working' }),
          ],
        },
      ],
    })
    const byTask = sessionsByTask(v)
    expect(byTask.get('T1')?.id).toBe('b')
    expect(byTask.get('T2')?.id).toBe('d')
    expect(byTask.size).toBe(2)
  })

  it('has none while Sessions is off', () => {
    const v = view({
      on: false,
      open: [{ key: 'none', sessions: [row({ task })] }],
    })
    expect(sessionsByTask(v).size).toBe(0)
    expect(sessionsByTask(null).size).toBe(0)
  })
})

describe("sessionsLine: Today's line about them", () => {
  it('counts the quiet ones and names three projects at most', () => {
    const v = view({
      open: ['Payments', 'Infra', undefined, 'Docs', 'Site'].map((name) => ({
        key: name ?? 'none',
        name,
        sessions: [row()],
      })),
      counts: { open: 7, working: 2, turn: 2, ended: 1 },
    })
    expect(sessionsLine(v)).toEqual({
      turn: 2,
      working: 2,
      quiet: 3,
      groups: ['Payments', 'Infra', 'Docs'],
      more: 1,
    })
  })

  it('has no line with none open or while off', () => {
    expect(sessionsLine(view())).toBeUndefined()
    expect(
      sessionsLine(
        view({ on: false, counts: { open: 2, working: 0, turn: 0, ended: 0 } })
      )
    ).toBeUndefined()
  })
})

describe('tasksToLink: the open tasks a session can be linked to', () => {
  const t = (id: string, over: Partial<TaskView> = {}) =>
    ({
      id,
      title: `Task ${id}`,
      status: 'open',
      postedAt: '2026-11-17T08:00:00Z',
      ...over,
    }) as TaskView
  const all = [
    t('a', { postedAt: '2026-11-17T09:00:00Z' }),
    t('b', { repo: 'Ashon/Payments', postedAt: '2026-11-16T09:00:00Z' }),
    t('c', { status: 'closed' }),
    t('d', { title: 'Raise the retry limit' }),
  ]
  it("lists the session's repository first, then the newest", () => {
    expect(tasksToLink(all, 'ashon/payments', '').map((x) => x.id)).toEqual([
      'b',
      'a',
      'd',
    ])
  })
  it('finds by the title or the repository', () => {
    expect(tasksToLink(all, undefined, 'RETRY').map((x) => x.id)).toEqual(['d'])
    expect(tasksToLink(all, undefined, 'payments').map((x) => x.id)).toEqual([
      'b',
    ])
  })
})
