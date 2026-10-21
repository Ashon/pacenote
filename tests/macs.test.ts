import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { browseLine, resolved } from '../src/macs/bonjour.js'
import {
  accept,
  dial,
  macsGroup,
  macsKey,
  type MacChannel,
} from '../src/macs/channel.js'
import {
  claim,
  claimReason,
  HANDOVER_MS,
  shouldAnswer,
  type PeerSeen,
} from '../src/macs/lease.js'
import { Macs, MACS_FILE } from '../src/macs/macs.js'
import { hostPort, MACS_PORT, privateAddress } from '../src/macs/network.js'
import { laterLease, type MacUse } from '../src/macs/types.js'

/** Waits for a Mac to get there, with room for a busy test run */
const poll = <T>(check: () => T) =>
  expect.poll(check, { timeout: 15_000, interval: 50 })

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

describe('the network the Macs talk on', () => {
  it('takes only your own networks', () => {
    for (const address of [
      '127.0.0.1',
      '::1',
      '192.168.0.12',
      '10.1.2.3',
      '172.20.0.5',
      '169.254.10.1',
      '100.68.215.39',
      'fd7a:115c:a1e0::1',
      'fe80::1',
      '::ffff:192.168.1.2',
    ])
      expect([address, privateAddress(address)]).toEqual([address, true])
    for (const address of [
      '8.8.8.8',
      '172.32.0.1',
      '100.128.0.1',
      '2001:db8::1',
      '::ffff:1.1.1.1',
      undefined,
    ])
      expect([address, privateAddress(address)]).toEqual([address, false])
  })

  it('reads an address added by hand', () => {
    expect(hostPort('macbook-air.local')).toEqual({
      host: 'macbook-air.local',
      port: MACS_PORT,
    })
    expect(hostPort('100.68.0.12:50000')).toEqual({
      host: '100.68.0.12',
      port: 50000,
    })
    expect(hostPort('[fd7a::1]:50000')).toEqual({
      host: 'fd7a::1',
      port: 50000,
    })
    expect(hostPort('fd7a::1')).toEqual({ host: 'fd7a::1', port: MACS_PORT })
    expect(hostPort('a b')).toBeUndefined()
    expect(hostPort('host:99999')).toBeUndefined()
  })

  it("reads dns-sd's browsing and lookup", () => {
    expect(
      browseLine(
        '12:36:11.499  Add        3  14 local.               _pacenote._tcp.      Ashon’s MacBook Air'
      )
    ).toEqual({ added: true, instance: 'Ashon’s MacBook Air' })
    expect(
      browseLine(
        '12:40:00.000  Rmv        0  14 local.               _pacenote._tcp.      Ashon’s MacBook Air'
      )
    ).toEqual({ added: false, instance: 'Ashon’s MacBook Air' })
    expect(browseLine('Timestamp     A/R    Flags  if Domain')).toBeUndefined()
    const lookup = [
      'Lookup Ashon’s MacBook Air._pacenote._tcp.local.',
      '12:36:11.499  Ashon’s\\032MacBook\\032Air._pacenote._tcp.local. can be reached at ashons-MacBook-Air.local.:49213 (interface 14) Flags: 1',
    ]
    expect(resolved(lookup.join('\n'))).toBeUndefined()
    expect(
      resolved([...lookup, ' g=abcd1234 id=mac-1', ''].join('\n'))
    ).toEqual({
      host: 'ashons-MacBook-Air.local',
      port: 49213,
      txt: { g: 'abcd1234', id: 'mac-1' },
    })
  })
})

describe('the channel between two Macs', () => {
  const servers: WebSocketServer[] = []
  afterEach(() => {
    for (const server of servers.splice(0)) server.close()
  })

  /** A listening Mac and a dialing one, each with its app token */
  async function pair(listenerToken: string, dialerToken: string) {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    servers.push(wss)
    await new Promise((resolve) => wss.once('listening', resolve))
    const port = (wss.address() as { port: number }).port
    const accepted = new Promise<MacChannel>((resolve, reject) =>
      wss.once('connection', (ws) =>
        accept(ws, {
          key: macsKey(listenerToken),
          me: { id: 'pro', name: 'MacBook Pro' },
          timeoutMs: 1_000,
        }).then(resolve, reject)
      )
    )
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`)
    await new Promise((resolve) => ws.once('open', resolve))
    const dialed = dial(ws, {
      key: macsKey(dialerToken),
      me: { id: 'air', name: 'MacBook Air' },
      timeoutMs: 1_000,
    })
    return Promise.all([accepted, dialed])
  }

  it('opens between Macs with the same Slack app and carries sealed messages', async () => {
    const [pro, air] = await pair('xapp-1-A', 'xapp-1-A')
    expect(pro.peer).toEqual({ id: 'air', name: 'MacBook Air' })
    expect(air.peer).toEqual({ id: 'pro', name: 'MacBook Pro' })
    const got: unknown[] = []
    pro.on('message', (message) => got.push(message))
    // Sent at once after the handshake: none is lost.
    air.send({ hello: 1 })
    air.send({ hello: 2 })
    await poll(() => got).toEqual([{ hello: 1 }, { hello: 2 }])
    const back = new Promise((resolve) => air.once('message', resolve))
    pro.send({ answer: 'yes' })
    await expect(back).resolves.toEqual({ answer: 'yes' })
    pro.close()
  })

  it('never opens between Macs with different Slack apps', async () => {
    expect(macsGroup(macsKey('xapp-1-A'))).not.toBe(
      macsGroup(macsKey('xapp-1-B'))
    )
    await expect(pair('xapp-1-A', 'xapp-1-B')).rejects.toThrow(
      /another Slack app/
    )
  })
})

describe('your Macs', () => {
  const dirs: string[] = []
  const running: Macs[] = []
  afterEach(async () => {
    await Promise.all(running.splice(0).map((macs) => macs.stop()))
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true })
  })

  /** The lease a Mac last heard of, as it keeps it */
  const leaseOf = (dataDir: string) =>
    (
      JSON.parse(readFileSync(path.join(dataDir, MACS_FILE), 'utf8')) as {
        lease?: { holder: string; term: number }
      }
    ).lease

  /** One Mac: its use and whether its Slack connection is open, as set */
  function mac(
    name: string,
    token = 'xapp-1-HOME',
    timing: {
      stalledMs?: number
      cooldownMs?: number
      /** Pace's connection opens this long after it is asked to */
      answerAfterMs?: number
    } = {}
  ) {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'pacenote-macs-'))
    dirs.push(dataDir)
    // Turned on in Settings > Macs
    writeFileSync(
      path.join(dataDir, MACS_FILE),
      JSON.stringify({ follow: true })
    )
    const it = {
      use: { ...using } as MacUse,
      answering: false,
      ready: true,
      calls: [] as boolean[],
      macs: undefined as unknown as Macs,
    }
    it.macs = new Macs({
      dataDir,
      appToken: () => token,
      name,
      version: '0.5.30',
      use: () => it.use,
      pace: () => ({ ready: it.ready, answering: it.answering }),
      onAnswer: (here) => {
        it.calls.push(here)
        if (here && timing.answerAfterMs)
          setTimeout(() => (it.answering = true), timing.answerAfterMs)
        else it.answering = here
      },
      stalledMs: timing.stalledMs,
      cooldownMs: timing.cooldownMs,
      log: () => undefined,
      port: 0,
      bonjour: false,
      tickMs: 50,
    })
    running.push(it.macs)
    return {
      macs: it.macs,
      dataDir,
      state: it,
      /** Starts it, with Pace's connection open as the app opens it */
      start: async () => {
        await it.macs.start()
        it.answering = it.macs.answers
      },
    }
  }

  it('finds the other Mac, and Pace follows you to it and back', async () => {
    const pro = mac('MacBook Pro')
    const air = mac('MacBook Air')
    // The Pro answered before the Air came along.
    await pro.start()
    await poll(() => leaseOf(pro.dataDir)?.holder).toBe(pro.macs.id)
    await air.start()
    expect(air.macs.addAddress(`127.0.0.1:${pro.macs.listening}`)).toBe(true)
    await poll(() =>
      air.macs.view().macs.map((m) => [m.name, m.status])
    ).toEqual([
      ['MacBook Air', 'standing-by'],
      ['MacBook Pro', 'answering'],
    ])
    expect(air.state.answering).toBe(false)

    // You leave the Pro and use the Air: the Air connects first, then the Pro
    // closes its connection. At once, though the Air claimed as it started,
    // knowing no lease yet: that first claim is nothing to cool off from.
    const leftAt = Date.now()
    pro.state.use = { ...left }
    air.state.use = { ...using }
    await poll(() => air.state.answering).toBe(true)
    expect(Date.now() - leftAt).toBeLessThan(5_000)
    await poll(() => pro.state.answering).toBe(false)
    expect(air.macs.view().moved?.from).toBe('MacBook Pro')
    expect(pro.macs.view().macs.map((m) => [m.name, m.status])).toEqual([
      ['MacBook Pro', 'standing-by'],
      ['MacBook Air', 'answering'],
    ])

    // Using both keeps it on the Air; Answer here moves it at once.
    pro.state.use = { ...using }
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(air.state.answering).toBe(true)
    pro.macs.answerHere()
    await poll(() => pro.state.answering).toBe(true)
    await poll(() => air.state.answering).toBe(false)

    expect(leaseOf(pro.dataDir)?.holder).toBe(pro.macs.id)
  }, 30_000)

  it('takes over when the answering Mac goes away, and leaves Macs of another Slack app alone', async () => {
    const pro = mac('MacBook Pro')
    const air = mac('MacBook Air')
    const other = mac('Work Mac', 'xapp-1-WORK')
    await pro.start()
    await poll(() => leaseOf(pro.dataDir)?.holder).toBe(pro.macs.id)
    await air.start()
    await other.start()
    air.macs.addAddress(`127.0.0.1:${pro.macs.listening}`)
    air.macs.addAddress(`127.0.0.1:${other.macs.listening}`)
    await poll(() => air.state.answering).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(air.macs.view().macs.map((m) => m.name)).toEqual([
      'MacBook Air',
      'MacBook Pro',
    ])

    // The Pro quits: the Air answers, though no one uses it.
    air.state.use = { ...left }
    await pro.macs.stop()
    await poll(() => air.state.answering).toBe(true)
    expect(air.macs.view().macs[1]?.status).toBe('out-of-reach')
  }, 30_000)

  it('stays off until you turn it on, and answers here meanwhile', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'pacenote-macs-'))
    dirs.push(dataDir)
    const macs = new Macs({
      dataDir,
      appToken: () => 'xapp-1-HOME',
      name: 'MacBook Pro',
      version: '0.5.30',
      use: () => using,
      pace: () => ({ ready: true, answering: true }),
      onAnswer: () => undefined,
      log: () => undefined,
      port: 0,
      bonjour: false,
    })
    running.push(macs)
    await macs.start()
    expect(macs.answers).toBe(true)
    expect(macs.listening).toBeUndefined()
    expect(macs.view()).toMatchObject({ available: true, follow: false })
    await macs.setFollow(true)
    expect(macs.listening).toBeGreaterThan(0)
  })

  it('never takes the lease back and forth when a Mac that stood by takes over', async () => {
    // The Pro stands by a long while, then takes over; its Slack connection
    // opens a moment later. The Air must not count the time it stood by as
    // a stall and take the lease straight back.
    const pro = mac('MacBook Pro', 'xapp-1-HOME', {
      stalledMs: 300,
      cooldownMs: 0,
      answerAfterMs: 100,
    })
    const air = mac('MacBook Air', 'xapp-1-HOME', {
      stalledMs: 300,
      cooldownMs: 0,
    })
    await pro.start()
    await poll(() => leaseOf(pro.dataDir)?.holder).toBe(pro.macs.id)
    await air.start()
    air.macs.addAddress(`127.0.0.1:${pro.macs.listening}`)
    // You go to the Air: it takes over, and the Pro stands by
    pro.state.use = { ...left }
    await poll(() => pro.state.answering).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 600))
    // Back at the Pro, the Air left
    air.state.use = { ...left }
    pro.state.use = { ...using }
    const term = leaseOf(pro.dataDir)!.term
    await poll(() => pro.state.answering).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(leaseOf(pro.dataDir)).toMatchObject({
      holder: pro.macs.id,
      term: term + 1,
    })
    expect(air.state.answering).toBe(false)
  }, 30_000)

  it('answers here when following is off or there is no app token', async () => {
    const pro = mac('MacBook Pro', '')
    await pro.start()
    expect(pro.macs.answers).toBe(true)
    expect(pro.macs.view()).toMatchObject({ available: false })
    expect(pro.macs.listening).toBeUndefined()
  })
})
