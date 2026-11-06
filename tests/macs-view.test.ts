import { describe, expect, it } from 'vitest'
import type { LinkSeen } from '../src/macs/claims.js'
import { devicesMessage, mergeDevices } from '../src/macs/devices.js'
import { macsFileOf } from '../src/macs/store.js'
import { SILENT_MS } from '../src/macs/timing.js'
import type {
  DeviceRecord,
  MacState,
  MacUse,
  MacsView,
} from '../src/macs/types.js'
import {
  deviceViews,
  macsView,
  myStatus,
  otherStatus,
} from '../src/macs/view.js'

const using: MacUse = { idle: 3, locked: false, asleep: false }
const left: MacUse = { idle: 400, locked: false, asleep: false }

const state = (id: string, patch: Partial<MacState> = {}): MacState => ({
  id,
  name: id,
  version: '0.6.25',
  use: using,
  ready: true,
  answering: true,
  ...patch,
})

const NOW = Date.UTC(2026, 10, 7, 9)

describe('where Pace answers, as Settings > Devices says it', () => {
  it('says it of this Mac', () => {
    const pro = {
      follows: true,
      id: 'pro',
      holder: 'pro',
      here: true,
      answering: true,
    }
    // Not following you: Pace answers here, whoever holds the lease
    expect(
      myStatus({ ...pro, follows: false, holder: 'air', answering: false })
    ).toBe('answering')
    expect(myStatus(pro)).toBe('answering')
    expect(myStatus({ ...pro, answering: false })).toBe('moving')
    expect(myStatus({ ...pro, holder: undefined, answering: false })).toBe(
      'moving'
    )
    // Another Mac holds it: open here still while it connects
    expect(myStatus({ ...pro, holder: 'air' })).toBe('moving')
    expect(myStatus({ ...pro, holder: 'air', here: false })).toBe('standing-by')
  })

  it('says it of another Mac', () => {
    const air = state('air')
    const closed = state('air', { answering: false })
    const status = (
      said: MacState | undefined,
      reachable: boolean,
      holder: string
    ) => otherStatus({ id: 'air', state: said, reachable, holder })
    expect(status(air, false, 'air')).toBe('out-of-reach')
    expect(status(undefined, true, 'air')).toBe('out-of-reach')
    expect(status(air, true, 'air')).toBe('answering')
    expect(status(closed, true, 'air')).toBe('moving')
    expect(status(air, true, 'pro')).toBe('moving')
    expect(status(closed, true, 'pro')).toBe('standing-by')
  })
})

describe('Settings > Devices', () => {
  const file = macsFileOf({
    id: 'pro',
    follow: true,
    addresses: ['100.68.0.12:50000'],
    ignored: ['old'],
    lease: { holder: 'air', term: 4, at: 0 },
    known: {
      air: {
        name: 'MacBook Air',
        lastSeen: '2026-11-07T08:59:00.000Z',
        address: 'air.local',
      },
      mini: { name: 'Mac mini', lastSeen: '2026-11-06T10:00:00.000Z' },
      old: { name: 'Old Mac', lastSeen: '2026-10-01T10:00:00.000Z' },
    },
  })
  const air = (heardAt: number): LinkSeen => ({
    channel: { peer: {} },
    state: state('air', {
      name: 'MacBook Air',
      reasoner: 'claude',
      collecting: '2026-11-07T08:58:00.000Z',
    }),
    heardAt,
    address: '192.168.0.12',
  })
  const ipad: LinkSeen = {
    channel: { peer: { device: 'tablet' } },
    heardAt: NOW,
  }
  const view = (
    links: Map<string, LinkSeen>,
    patch: Partial<Parameters<typeof macsView>[0]> = {}
  ): MacsView =>
    macsView({
      now: NOW,
      me: {
        id: 'pro',
        name: 'MacBook Pro',
        use: left,
        pace: { ready: true, answering: false, reasoner: 'codex' },
        status: 'standing-by',
      },
      file,
      links,
      ownApp: true,
      paired: true,
      follows: true,
      blocked: false,
      moved: undefined,
      adding: undefined,
      ...patch,
    })

  it('shows this Mac first, then the others it knows but those you stopped following to', () => {
    const links = new Map([
      ['air', air(NOW - 1_000)],
      // A device of yours is no Mac
      ['ipad-1', ipad],
    ])
    expect(view(links)).toEqual({
      paceFollows: true,
      paired: true,
      follow: true,
      macs: [
        {
          id: 'pro',
          name: 'MacBook Pro',
          here: true,
          status: 'standing-by',
          away: true,
          asleep: false,
          notReady: false,
          reasoner: 'codex',
        },
        {
          id: 'air',
          name: 'MacBook Air',
          here: false,
          status: 'answering',
          away: false,
          asleep: false,
          notReady: false,
          lastSeen: '2026-11-07T08:59:00.000Z',
          reasoner: 'claude',
          address: '192.168.0.12',
          collecting: '2026-11-07T08:58:00.000Z',
        },
        {
          id: 'mini',
          name: 'Mac mini',
          here: false,
          status: 'out-of-reach',
          away: false,
          asleep: false,
          notReady: false,
          lastSeen: '2026-11-06T10:00:00.000Z',
        },
      ],
      holder: 'air',
      addresses: ['100.68.0.12:50000'],
      blocked: false,
      devices: [],
    } satisfies MacsView)
  })

  it('says nothing of what a Mac out of reach collects, nor who holds the lease while Pace stays here', () => {
    const shown = view(new Map([['air', air(NOW - SILENT_MS)]]), {
      follows: false,
      ownApp: false,
      moved: { from: 'MacBook Air', at: '2026-11-07T08:00:00.000Z' },
      adding: { until: '2026-11-07T09:10:00.000Z' },
    })
    expect(shown.macs[1]).toMatchObject({
      id: 'air',
      status: 'out-of-reach',
      address: '192.168.0.12',
    })
    expect(shown.macs[1]?.collecting).toBeUndefined()
    expect(shown.holder).toBeUndefined()
    expect(shown).toMatchObject({
      paceFollows: false,
      moved: { from: 'MacBook Air' },
      adding: { until: '2026-11-07T09:10:00.000Z' },
    })
  })

  it('lists your devices, those linked here first, then the latest seen', () => {
    const devices: Record<string, DeviceRecord> = {
      phone: {
        name: 'iPhone',
        device: 'phone',
        pairedAt: '2026-11-01T00:00:00.000Z',
        lastSeen: '2026-11-06T00:00:00.000Z',
      },
      ipad: {
        name: 'iPad',
        device: 'tablet',
        pairedAt: '2026-11-02T00:00:00.000Z',
        by: 'Mac mini',
      },
      old: {
        name: 'Old iPad',
        device: 'tablet',
        pairedAt: '2026-10-01T00:00:00.000Z',
        lastSeen: '2026-11-05T00:00:00.000Z',
      },
    }
    const links = new Map<string, LinkSeen>([
      ['ipad', { ...ipad, address: '192.168.0.30' }],
      // Out of reach: not linked, though it was reached there
      ['old', { ...ipad, heardAt: NOW - SILENT_MS, address: '192.168.0.31' }],
    ])
    expect(deviceViews(devices, links, NOW)).toEqual([
      { id: 'ipad', ...devices.ipad, connected: true, address: '192.168.0.30' },
      { id: 'phone', ...devices.phone, connected: false },
      { id: 'old', ...devices.old, connected: false, address: '192.168.0.31' },
    ])
  })
})

describe('your devices, between your Macs', () => {
  const ipad: DeviceRecord = {
    name: 'iPad',
    device: 'tablet',
    pairedAt: '2026-11-02T00:00:00.000Z',
    lastSeen: '2026-11-06T00:00:00.000Z',
  }
  const kept = {
    devices: {
      ipad,
      phone: {
        name: 'iPhone',
        device: 'phone',
        pairedAt: '2026-11-01T00:00:00.000Z',
      },
    } satisfies Record<string, DeviceRecord>,
    removed: { old: '2026-11-03T00:00:00.000Z' },
  }

  it('tells the other Macs all of them, and the ones removed', () => {
    expect(devicesMessage(kept)).toEqual({ t: 'devices', ...kept })
  })

  it('keeps the later sighting of each, and every removal, the first one', () => {
    const later = { ...ipad, lastSeen: '2026-11-07T00:00:00.000Z' }
    const pixel: DeviceRecord = {
      name: 'Pixel',
      device: 'phone',
      pairedAt: '2026-11-04T00:00:00.000Z',
      by: 'Mac mini',
    }
    expect(
      mergeDevices(kept, {
        devices: {
          ipad: later,
          pixel,
          old: { ...ipad, name: 'Old iPad' },
        },
        removed: {
          phone: '2026-11-05T00:00:00.000Z',
          old: '2026-11-04T00:00:00.000Z',
        },
      })
    ).toEqual({
      devices: { ipad: later, pixel },
      removed: {
        old: '2026-11-03T00:00:00.000Z',
        phone: '2026-11-05T00:00:00.000Z',
      },
    })
    // Removed earlier on the other Mac: that one is kept
    expect(
      mergeDevices(kept, { removed: { old: '2026-11-01T00:00:00.000Z' } })
        ?.removed.old
    ).toBe('2026-11-01T00:00:00.000Z')
  })

  it('changes nothing when the other Mac knows nothing newer', () => {
    expect(mergeDevices(kept, {})).toBeUndefined()
    expect(mergeDevices(kept, devicesMessage(kept))).toBeUndefined()
    expect(
      mergeDevices(kept, {
        devices: { ipad: { ...ipad, lastSeen: '2026-11-05T00:00:00.000Z' } },
      })
    ).toBeUndefined()
    // A removal that is no time is not taken
    expect(
      mergeDevices(kept, { removed: { ipad: 5 as never } })
    ).toBeUndefined()
  })
})
