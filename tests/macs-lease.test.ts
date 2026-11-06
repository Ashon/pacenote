import { describe, expect, it } from 'vitest'
import { claimWords, holdsBack, peersOf } from '../src/macs/claims.js'
import {
  claim,
  claimReason,
  HANDOVER_MS,
  shouldAnswer,
  type PeerSeen,
} from '../src/macs/lease.js'
import { SILENT_MS, STARTUP_MS } from '../src/macs/timing.js'
import { laterLease, type MacState, type MacUse } from '../src/macs/types.js'

const using: MacUse = { idle: 3, locked: false, asleep: false }
const left: MacUse = { idle: 400, locked: false, asleep: false }
const locked: MacUse = { idle: 10, locked: true, asleep: false }
const sleeping: MacUse = { idle: 0, locked: false, asleep: true }
const idle: MacUse = { idle: 120, locked: false, asleep: false }

const peer = (patch: Partial<PeerSeen> = {}): PeerSeen => ({
  id: 'air',
  use: using,
  ready: true,
  answering: true,
  reachable: true,
  ...patch,
})

describe('which Mac answers', () => {
  const me = { id: 'pro', use: using, ready: true }
  const airHolds = { holder: 'air', term: 3, at: 1_000 }

  it('takes over from a Mac you left for this one', () => {
    expect(
      claimReason({ me, lease: airHolds, peers: [peer({ use: left })] })
    ).toBe('holder-away')
    expect(
      claimReason({ me, lease: airHolds, peers: [peer({ use: locked })] })
    ).toBe('holder-away')
  })

  it('stays put while you use both, or have left both', () => {
    expect(claimReason({ me, lease: airHolds, peers: [peer()] })).toBe(
      undefined
    )
    expect(
      claimReason({ me, lease: airHolds, peers: [peer({ use: idle })] })
    ).toBe(undefined)
    expect(
      claimReason({
        me: { ...me, use: left },
        lease: airHolds,
        peers: [peer({ use: left })],
      })
    ).toBe(undefined)
  })

  it('takes over from a Mac going to sleep, out of reach or without Pace, used or not', () => {
    const away = { ...me, use: left }
    expect(
      claimReason({
        me: away,
        lease: airHolds,
        peers: [peer({ use: sleeping })],
      })
    ).toBe('holder-asleep')
    expect(
      claimReason({
        me: away,
        lease: airHolds,
        peers: [peer({ reachable: false })],
      })
    ).toBe('holder-gone')
    expect(claimReason({ me: away, lease: airHolds, peers: [] })).toBe(
      'holder-gone'
    )
    expect(
      claimReason({
        me: away,
        lease: airHolds,
        peers: [peer({ ready: false })],
      })
    ).toBe('holder-gone')
    expect(
      claimReason({
        me: away,
        lease: airHolds,
        peers: [peer({ answering: false, stalled: true })],
      })
    ).toBe('holder-gone')
    expect(claimReason({ me: away, lease: undefined, peers: [] })).toBe('none')
  })

  it('never claims for a Mac whose Pace cannot answer, or one that holds it', () => {
    expect(
      claimReason({
        me: { ...me, ready: false },
        lease: airHolds,
        peers: [peer({ use: left })],
      })
    ).toBe(undefined)
    expect(
      claimReason({ me, lease: { holder: 'pro', term: 1, at: 0 }, peers: [] })
    ).toBe(undefined)
  })

  it('settles on the latest claim, whichever order the Macs hear them in', () => {
    const a = claim('pro', airHolds, 2_000)
    const b = claim('air', airHolds, 3_000)
    expect(a).toEqual({ holder: 'pro', term: 4, at: 2_000 })
    // Claimed apart, the same term: the Mac that claimed first keeps it.
    expect(laterLease(a, b)).toBe(a)
    expect(laterLease(b, a)).toBe(a)
    const later = { holder: 'air', term: 5, at: 1_500 }
    expect(laterLease(a, later)).toBe(later)
  })

  it('keeps its connection open until the next Mac has connected', () => {
    const lease = { holder: 'air', term: 4, at: 0 }
    const now = 100_000
    expect(
      shouldAnswer({
        me,
        lease,
        peers: [peer({ answering: false })],
        heldUntil: now - 1_000,
        now,
      })
    ).toBe(true)
    expect(
      shouldAnswer({ me, lease, peers: [peer()], heldUntil: now - 1_000, now })
    ).toBe(false)
    expect(
      shouldAnswer({
        me,
        lease,
        peers: [peer({ answering: false })],
        heldUntil: now - HANDOVER_MS,
        now,
      })
    ).toBe(false)
    expect(shouldAnswer({ me, lease: undefined, peers: [], now })).toBe(true)
  })
})

describe('what this Mac makes of the rules', () => {
  const now = 100_000
  const state = (id: string, patch: Partial<MacState> = {}): MacState => ({
    id,
    name: id,
    version: '0.6.25',
    use: using,
    ready: true,
    answering: true,
    ...patch,
  })
  const link = (
    said: MacState | undefined,
    patch: { heardAt?: number; closedSince?: number } = {}
  ) => ({ channel: { peer: {} }, state: said, heardAt: now - 1_000, ...patch })

  it('sees the Macs you follow to of the same Slack app, out of reach or stalled', () => {
    const links = [
      link(state('air'), { closedSince: now - 300 }),
      link(state('mini'), { heardAt: now - SILENT_MS }),
      link(state('work', { app: 'another' })),
      link(state('old')),
      // Nothing said yet
      link(undefined),
    ]
    expect(
      peersOf({
        links,
        ignored: ['old'],
        holder: 'air',
        sameApp: (said) => said.app !== 'another',
        now,
        stalledMs: 300,
      })
    ).toEqual([
      {
        id: 'air',
        use: using,
        ready: true,
        answering: true,
        reachable: true,
        stalled: true,
      },
      {
        id: 'mini',
        use: using,
        ready: true,
        answering: true,
        reachable: false,
        stalled: false,
      },
    ])
    // Closed a moment less, or not holding the lease: not stalled
    const stalled = (closedSince: number, holder: string) =>
      peersOf({
        links: [link(state('air'), { closedSince })],
        ignored: [],
        holder,
        sameApp: () => true,
        now,
        stalledMs: 300,
      })[0]?.stalled
    expect(stalled(now - 299, 'air')).toBe(false)
    expect(stalled(now - 1_000, 'pro')).toBe(false)
  })

  it('holds back a claim just after starting or claiming, never when you ask', () => {
    const lease = { holder: 'air', term: 2, at: 0 }
    const started = {
      reason: 'holder-gone' as const,
      lease,
      known: { air: { name: 'MacBook Air' } },
      heardSinceStart: new Set<string>(),
      startedAt: now - 1_000,
      claimedAt: undefined,
      now,
      cooldownMs: 15_000,
    }
    // Just started: the Mac that answered may not have been found yet
    expect(holdsBack(started)).toBe(true)
    expect(holdsBack({ ...started, startedAt: now - STARTUP_MS })).toBe(false)
    expect(holdsBack({ ...started, heardSinceStart: new Set(['air']) })).toBe(
      false
    )
    expect(holdsBack({ ...started, known: {} })).toBe(false)
    expect(holdsBack({ ...started, reason: 'holder-away' })).toBe(false)
    // Claimed a moment ago: only Answer here claims again
    const claimed = { ...started, startedAt: 0, claimedAt: now - 1_000 }
    expect(holdsBack(claimed)).toBe(true)
    expect(holdsBack({ ...claimed, reason: 'asked' })).toBe(false)
    expect(holdsBack({ ...claimed, claimedAt: now - 15_000 })).toBe(false)
  })

  it('says in the log why it claimed', () => {
    expect(claimWords('none')).toBe('no Mac answered')
    expect(claimWords('holder-gone', 'MacBook Air')).toBe(
      'MacBook Air is out of reach'
    )
    expect(claimWords('holder-gone')).toBe(
      'the Mac that answered is out of reach'
    )
    expect(claimWords('holder-asleep', 'MacBook Air')).toBe(
      'MacBook Air went to sleep'
    )
    expect(claimWords('holder-away', 'MacBook Air')).toBe(
      'MacBook Air was left and this Mac is in use'
    )
    expect(claimWords('asked')).toBe('you asked')
  })
})
