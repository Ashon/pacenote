import { describe, expect, it } from 'vitest'
import type {
  LoggedSession,
  OpenAgent,
  SessionsInput,
} from '../src/sessions/view.js'
import { sessionsView, typedLine } from '../src/sessions/view.js'
import type { SessionGroup, SessionWhere } from '../src/sessions/types.js'

/** A fixed clock: noon of 2026-11-17, the day begun at midnight */
const now = Date.parse('2026-11-17T12:00:00Z')
const dayStart = Date.parse('2026-11-17T00:00:00Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const iso = (ms: number) => new Date(ms).toISOString()

/** A session as its log tells it, with only what a test cares about */
const logged = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  tool: 'claude',
  session: 's1',
  cwd: '/w/proj',
  startedAt: iso(now - HOUR),
  lastAt: iso(now - HOUR),
  prompts: [],
  ...over,
})

/** A session claude agents lists, with only what a test cares about */
const agent = (over: Partial<OpenAgent> = {}): OpenAgent => ({
  session: 's1',
  cwd: '/w/proj',
  busy: false,
  where: 'terminal',
  ...over,
})

/** The view on the fixed clock, empty maps standing in for the rest */
const view = (over: Partial<SessionsInput> = {}) =>
  sessionsView({
    now,
    dayStart,
    logged: [],
    repos: new Map(),
    areas: [],
    tasks: new Map(),
    ...over,
  })

const rows = (groups: SessionGroup[]) => groups.flatMap((g) => g.sessions)

/** /w/pay's repository, as its git folder and origin remote tell it */
const payRepo = new Map([
  ['/w/pay', { id: '/r/pay/.git', name: 'Ashon/payments' }],
])

describe('typedLine: what you typed, as a line to show', () => {
  it('keeps a slash command as you typed it', () => {
    expect(
      typedLine(
        '<command-name>/review</command-name><command-args>42</command-args>'
      )
    ).toBe('/review 42')
  })

  it('keeps a ! command with its bang', () => {
    expect(typedLine('<bash-input>ls -la</bash-input>')).toBe('!ls -la')
  })

  it('leaves out notes the tool added and interruptions', () => {
    expect(typedLine('[Request interrupted by user]')).toBeUndefined()
    expect(
      typedLine('<local-command-stdout>x</local-command-stdout>')
    ).toBeUndefined()
    expect(
      typedLine(
        'This session is being continued from a previous conversation...'
      )
    ).toBeUndefined()
  })

  it('cuts a system reminder, closed or cut short', () => {
    expect(typedLine('fix it<system-reminder>note</system-reminder>')).toBe(
      'fix it'
    )
    expect(typedLine('a <system-reminder>cut short')).toBe('a')
  })

  it('folds a prompt of several lines into one', () => {
    expect(typedLine('a\n\n  b')).toBe('a b')
  })
})

describe('sessionsView: the open Claude Code sessions', () => {
  it('works, waits for you, or rests by busy and the log', () => {
    const v = view({
      agents: [
        agent({ session: 'a1', busy: true }),
        agent({ session: 'a2' }),
        agent({ session: 'a3' }),
      ],
      logged: [
        logged({ session: 'a1', lastAt: iso(now - 3 * HOUR) }),
        logged({ session: 'a2', lastAt: iso(now - 10 * MINUTE) }),
        logged({ session: 'a3', lastAt: iso(now - 2 * HOUR) }),
      ],
    })
    expect(rows(v.open).map((r) => [r.session, r.state])).toEqual([
      ['a1', 'working'],
      ['a2', 'turn'],
      ['a3', 'quiet'],
    ])
  })

  it('waits for you while one Pacenote runs asks, on a turn or not', () => {
    const v = view({
      agents: [
        agent({
          session: 'p1',
          busy: true,
          asks: 'command',
          where: 'pacenote',
        }),
        agent({ session: 'p2', busy: true, where: 'pacenote' }),
      ],
      logged: [logged({ session: 'p1', lastAt: iso(now - 2 * HOUR) })],
    })
    expect(
      rows(v.open).map((r) => [r.session, r.state, r.asks, r.where])
    ).toEqual([
      ['p2', 'working', undefined, 'pacenote'],
      ['p1', 'turn', 'command', 'pacenote'],
    ])
    expect(v.counts).toMatchObject({ working: 1, turn: 1 })
  })

  it('titles by yours, the tool, the name, what you typed, the folder', () => {
    const titleOf = (
      loggedOver: Partial<LoggedSession>,
      agentOver: Partial<OpenAgent> = {}
    ) =>
      rows(
        view({
          agents: [agent({ session: 't', ...agentOver })],
          logged: [logged({ session: 't', ...loggedOver })],
        }).open
      )[0]?.title
    const typed = [{ text: 'first thing' }, { text: 'second thing' }]
    expect(
      titleOf(
        { title: 'My title', autoTitle: 'Tool title', prompts: typed },
        { name: 'Agent name' }
      )
    ).toBe('My title')
    expect(
      titleOf(
        { autoTitle: 'Tool title', prompts: typed },
        { name: 'Agent name' }
      )
    ).toBe('Tool title')
    expect(titleOf({ prompts: typed }, { name: 'Agent name' })).toBe(
      'Agent name'
    )
    expect(titleOf({ prompts: typed })).toBe('first thing')
    expect(titleOf({ cwd: '/w/my-folder' }, { cwd: '/w/my-folder' })).toBe(
      'my-folder'
    )
  })

  it('shows at most three typed lines, newest first', () => {
    const v = view({
      agents: [agent({ session: 'ty' })],
      logged: [
        logged({
          session: 'ty',
          // Oldest first, as the log has them: p5 typed last
          prompts: [1, 2, 3, 4, 5].map((n) => ({
            at: iso(now - (6 - n) * MINUTE),
            text: `p${n}`,
          })),
        }),
      ],
    })
    expect(rows(v.open)[0]?.typed).toEqual([
      { at: iso(now - MINUTE), text: 'p5' },
      { at: iso(now - 2 * MINUTE), text: 'p4' },
      { at: iso(now - 3 * MINUTE), text: 'p3' },
    ])
  })

  it('lists an open session once however often claude names it', () => {
    const v = view({
      agents: [
        agent({ session: 'dup' }),
        agent({ session: 'dup', busy: true }),
      ],
    })
    expect(rows(v.open)).toHaveLength(1)
    expect(rows(v.open)[0]?.state).toBe('turn')
    expect(v.counts.open).toBe(1)
  })
})

describe('sessionsView: the sessions that ended today', () => {
  it('takes those written today with prompts, not older or empty ones', () => {
    const v = view({
      agents: [agent({ session: 'op' })],
      logged: [
        logged({ session: 'op', lastAt: iso(now - HOUR) }),
        logged({
          session: 'e1',
          lastAt: iso(now - 30 * MINUTE),
          prompts: [{ text: 'do it' }],
        }),
        logged({
          session: 'e-yday',
          lastAt: iso(now - 26 * HOUR),
          prompts: [{ text: 'old' }],
        }),
        logged({ session: 'e-empty', lastAt: iso(now - 20 * MINUTE) }),
      ],
    })
    expect(v.ended.map((r) => r.session)).toEqual(['e1'])
    expect(v.ended[0]?.state).toBe('ended')
  })

  it('places an ended session where it was seen, else as its log says', () => {
    const seen = new Map<string, { where: SessionWhere; terminal?: string }>([
      ['w1', { where: 'web', terminal: 'Ghostty' }],
    ])
    const v = view({
      agents: [],
      logged: [
        logged({
          session: 'w1',
          lastAt: iso(now - 5 * MINUTE),
          prompts: [{ text: 'a' }],
        }),
        logged({
          session: 'w2',
          lastAt: iso(now - 10 * MINUTE),
          prompts: [{ text: 'b' }],
          entrypoint: 'claude-desktop',
        }),
        logged({
          session: 'w3',
          lastAt: iso(now - 15 * MINUTE),
          prompts: [{ text: 'c' }],
          entrypoint: 'cli',
        }),
      ],
      seen,
    })
    expect(v.ended.map((r) => [r.session, r.where])).toEqual([
      ['w1', 'web'],
      ['w2', 'claude-app'],
      ['w3', 'terminal'],
    ])
    expect(v.ended[0]?.terminal).toBe('Ghostty')
  })
})

describe('sessionsView: a session whose log is in two files', () => {
  it('is on one row', () => {
    const v = view({
      agents: [],
      logged: [
        logged({
          session: 'two',
          lastAt: iso(now - MINUTE),
          prompts: [{ text: 'a' }],
        }),
        logged({
          session: 'two',
          lastAt: iso(now - 2 * MINUTE),
          prompts: [{ text: 'b' }],
        }),
      ],
    })
    expect(v.ended).toHaveLength(1)
  })
})

describe('sessionsView: when Claude Code could not list its sessions', () => {
  it('stands logs written today in for the open ones and ends none', () => {
    const v = view({
      logged: [
        logged({
          session: 'l1',
          lastAt: iso(now - 30_000),
          entrypoint: 'claude-desktop',
        }),
        logged({ session: 'l2', lastAt: iso(now - 10 * MINUTE) }),
        logged({ session: 'l3', lastAt: iso(now - 2 * HOUR) }),
        logged({ session: 'l-yday', lastAt: iso(now - 26 * HOUR) }),
      ],
    })
    expect(v.listed).toBe(false)
    expect(v.ended).toEqual([])
    expect(rows(v.open).map((r) => [r.session, r.state])).toEqual([
      ['l1', 'working'],
      ['l2', 'turn'],
      ['l3', 'quiet'],
    ])
    expect(rows(v.open).map((r) => r.where)).toEqual([
      'claude-app',
      'terminal',
      'terminal',
    ])
  })
})

describe('sessionsView: the Codex and opencode logs', () => {
  const codex = (
    session: string,
    over: Partial<LoggedSession> = {}
  ): LoggedSession =>
    logged({ tool: 'codex', session, lastAt: iso(now - 5 * MINUTE), ...over })

  it('keeps the ones written today, the desktop apart from the terminal', () => {
    const v = view({
      agents: [],
      logged: [
        codex('c1', { originator: 'Codex Desktop' }),
        codex('c2', { originator: 'Codex CLI' }),
        codex('c-exec', { originator: 'codex_exec' }),
        codex('c-src', { source: 'exec' }),
        codex('c-sub', { source: 'subagent' }),
        codex('c-yday', {
          originator: 'Codex Desktop',
          lastAt: iso(now - 26 * HOUR),
        }),
      ],
    })
    expect(rows(v.open).map((r) => [r.session, r.where])).toEqual([
      ['c1', 'codex-app'],
      ['c2', 'terminal'],
    ])
  })

  it('leaves the opencode logs out altogether', () => {
    const v = view({
      agents: [],
      logged: [
        logged({
          tool: 'opencode',
          session: 'o1',
          lastAt: iso(now - MINUTE),
          prompts: [{ text: 'hi' }],
        }),
      ],
    })
    expect(rows(v.open)).toEqual([])
    expect(v.ended).toEqual([])
  })
})

describe('sessionsView: grouping the open rows', () => {
  const pay = (session: string): OpenAgent => agent({ session, cwd: '/w/pay' })
  const payLogged = (session: string, ago = HOUR): LoggedSession =>
    logged({ session, cwd: '/w/pay', lastAt: iso(now - ago) })

  it('groups by area when one holds the repository, whatever the case', () => {
    const v = view({
      agents: [pay('g1')],
      logged: [payLogged('g1')],
      repos: payRepo,
      areas: [{ id: 'a1', name: 'Payments', repos: ['ashon/PAYMENTS'] }],
    })
    expect(v.open.map((g) => [g.key, g.name, g.repo])).toEqual([
      ['area:a1', 'Payments', 'ashon/PAYMENTS'],
    ])
  })

  it('names the area without a repository when it holds more than one', () => {
    const v = view({
      agents: [pay('g1')],
      logged: [payLogged('g1')],
      repos: payRepo,
      areas: [
        {
          id: 'a1',
          name: 'Payments',
          repos: ['ashon/PAYMENTS', 'ashon/extra'],
        },
      ],
    })
    expect(v.open[0]?.key).toBe('area:a1')
    expect(v.open[0]?.repo).toBeUndefined()
  })

  it('groups by repository when no area holds it', () => {
    const v = view({
      agents: [pay('g1')],
      logged: [payLogged('g1')],
      repos: payRepo,
    })
    expect(v.open.map((g) => [g.key, g.name, g.repo])).toEqual([
      ['repo:/r/pay/.git', 'payments', 'Ashon/payments'],
    ])
  })

  it('names a repository that has none after its git folder', () => {
    const v = view({
      agents: [agent({ session: 'g2', cwd: '/x/proj' })],
      logged: [logged({ session: 'g2', cwd: '/x/proj' })],
      repos: new Map([['/x/proj', { id: '/x/proj/.git' }]]),
    })
    expect(v.open[0]?.name).toBe('proj')
    expect(v.open[0]?.repo).toBeUndefined()
  })

  it('puts those in no project last, the rest by latest activity', () => {
    const v = view({
      agents: [
        agent({ session: 'g-pay', cwd: '/w/pay' }),
        agent({ session: 'g-proj', cwd: '/x/proj' }),
        agent({ session: 'g-none', cwd: '/w/stray' }),
      ],
      logged: [
        logged({
          session: 'g-pay',
          cwd: '/w/pay',
          lastAt: iso(now - 3 * HOUR),
        }),
        logged({
          session: 'g-proj',
          cwd: '/x/proj',
          lastAt: iso(now - 2 * HOUR),
        }),
        logged({
          session: 'g-none',
          cwd: '/w/stray',
          lastAt: iso(now - MINUTE),
        }),
      ],
      repos: new Map([
        ['/w/pay', { id: '/r/pay/.git', name: 'Ashon/payments' }],
        ['/x/proj', { id: '/x/proj/.git' }],
      ]),
    })
    expect(v.open.map((g) => g.key)).toEqual([
      'repo:/x/proj/.git',
      'repo:/r/pay/.git',
      'none',
    ])
  })

  it('orders working, your turn, quiet inside a group, newest first', () => {
    const v = view({
      agents: [
        pay('q1'),
        agent({ session: 'w1', cwd: '/w/pay', busy: true }),
        pay('q2'),
        pay('t1'),
      ],
      logged: [
        payLogged('q1', 2 * HOUR),
        payLogged('w1', 3 * HOUR),
        payLogged('q2', 5 * HOUR),
        payLogged('t1', 10 * MINUTE),
      ],
      repos: payRepo,
    })
    expect(v.open).toHaveLength(1)
    expect(v.open[0]?.sessions.map((r) => r.session)).toEqual([
      'w1',
      't1',
      'q1',
      'q2',
    ])
  })
})

describe('sessionsView: rows linked to tasks, and the counts', () => {
  it('fills the task by the session id and the repository by name', () => {
    const v = view({
      agents: [
        agent({ session: 'k1', cwd: '/w/pay' }),
        agent({ session: 'k2', cwd: '/w/pay' }),
      ],
      logged: [
        logged({ session: 'k1', cwd: '/w/pay' }),
        logged({ session: 'k2', cwd: '/w/pay' }),
      ],
      repos: payRepo,
      tasks: new Map([['k1', { id: 'T1', title: 'Fix billing' }]]),
    })
    const row = (session: string) =>
      rows(v.open).find((r) => r.session === session)
    expect(row('k1')?.task).toEqual({ id: 'T1', title: 'Fix billing' })
    expect(row('k1')?.repo).toBe('Ashon/payments')
    expect(row('k2')?.task).toBeUndefined()
  })

  it('says the task one looks like only while it is on none', () => {
    const like = { id: 'sg1', task: { id: 'T2', title: 'Retry limit' } }
    const v = view({
      agents: [agent({ session: 'k1' }), agent({ session: 'k2' })],
      tasks: new Map([['k1', { id: 'T1', title: 'Fix billing' }]]),
      suggested: new Map([
        ['k1', like],
        ['k2', like],
      ]),
    })
    const row = (session: string) =>
      rows(v.open).find((r) => r.session === session)
    expect(row('k1')?.looksLike).toBeUndefined()
    expect(row('k2')?.looksLike).toEqual(like)
  })

  it('counts open, working, your turn and ended', () => {
    const v = view({
      agents: [
        agent({ session: 'o1', busy: true }),
        agent({ session: 'o2' }),
        agent({ session: 'o3' }),
      ],
      logged: [
        logged({ session: 'o1', lastAt: iso(now - MINUTE) }),
        logged({ session: 'o2', lastAt: iso(now - 10 * MINUTE) }),
        logged({ session: 'o3', lastAt: iso(now - 2 * HOUR) }),
        logged({
          session: 'e1',
          lastAt: iso(now - 30 * MINUTE),
          prompts: [{ text: 'x' }],
        }),
      ],
    })
    expect(v.counts).toEqual({ open: 3, working: 1, turn: 1, ended: 1 })
  })
})
