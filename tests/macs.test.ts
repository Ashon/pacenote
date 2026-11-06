import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { macsKey } from '../src/macs/channel.js'
import { GROUP_FILE, Macs, MACS_FILE } from '../src/macs/macs.js'
import type { MacState, MacUse } from '../src/macs/types.js'

/** Waits for a Mac to get there, with room for a busy test run */
const poll = <T>(check: () => T) =>
  expect.poll(check, { timeout: 15_000, interval: 50 })

const using: MacUse = { idle: 3, locked: false, asleep: false }
const left: MacUse = { idle: 400, locked: false, asleep: false }

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
    // Turned on in Settings > Devices
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
    expect(macs.view()).toMatchObject({
      paceFollows: true,
      paired: true,
      follow: false,
    })
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
    expect(pro.macs.view()).toMatchObject({ paceFollows: false, paired: false })
    expect(pro.macs.listening).toBeUndefined()
  })

  /** The key a Mac keeps for its others (GROUP_FILE), as base64 */
  const groupOf = (dataDir: string) =>
    readFileSync(path.join(dataDir, GROUP_FILE), 'utf8').trim()

  it('pairs Macs with no Slack app by the key Add a device made, and keeps it for you alone', async () => {
    // Todo alone on both: no Slack app, Pace not running
    const pro = mac('MacBook Pro', '')
    const air = mac('MacBook Air', '')
    pro.state.ready = false
    air.state.ready = false
    await pro.start()
    await air.start()
    expect(pro.macs.view()).toMatchObject({ paired: false })

    // Add a device on the Pro makes the key; the Air takes it
    expect(await pro.macs.startAdding()).toBe(true)
    expect(pro.macs.view()).toMatchObject({ paired: true, follow: true })
    const file = path.join(pro.dataDir, GROUP_FILE)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(Buffer.from(groupOf(pro.dataDir), 'base64')).toHaveLength(32)
    pro.macs.stopAdding()
    expect(await air.macs.joinGroup(groupOf(pro.dataDir))).toBe(true)
    expect(await air.macs.joinGroup('not a key')).toBe(false)
    await air.macs.setFollow(true)
    air.macs.addAddress(`127.0.0.1:${pro.macs.listening}`)
    await poll(() =>
      air.macs.view().macs.map((m) => [m.name, m.status !== 'out-of-reach'])
    ).toEqual([
      ['MacBook Air', true],
      ['MacBook Pro', true],
    ])
    expect(pro.macs.connected()).toEqual([air.macs.id])
    // Nothing moves Pace: each answers here, as on a Mac of its own
    expect(air.macs.answers).toBe(true)
    expect(pro.macs.answers).toBe(true)
    expect(air.macs.view().holder).toBeUndefined()

    // Started again, a Mac pairs with the key it kept
    await air.macs.stop()
    const again = new Macs({
      dataDir: air.dataDir,
      appToken: () => undefined,
      name: 'MacBook Air',
      version: '0.6.13',
      use: () => using,
      pace: () => ({ ready: false, answering: false }),
      onAnswer: () => undefined,
      log: () => undefined,
      port: 0,
      bonjour: false,
      tickMs: 50,
    })
    running.push(again)
    await again.start()
    await poll(() => again.connected()).toEqual([pro.macs.id])
  }, 30_000)

  it('pairs a Mac with no Slack app to one with Pace, and Pace stays where it answers', async () => {
    const pro = mac('MacBook Pro')
    const air = mac('MacBook Air', '')
    air.state.ready = false
    await pro.start()
    await poll(() => leaseOf(pro.dataDir)?.holder).toBe(pro.macs.id)
    await air.start()
    // Add a device on the Pro sends its Slack app's key
    expect(
      await air.macs.joinGroup(macsKey('xapp-1-HOME').toString('base64'))
    ).toBe(true)
    air.macs.addAddress(`127.0.0.1:${pro.macs.listening}`)
    await poll(() => pro.macs.connected()).toEqual([air.macs.id])
    // You leave the Pro for the Air: Pace stays on the Pro, the only one
    // that can answer
    pro.state.use = { ...left }
    air.state.use = { ...using }
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(pro.state.answering).toBe(true)
    expect(leaseOf(pro.dataDir)?.holder).toBe(pro.macs.id)
    expect(pro.macs.view()).toMatchObject({ paceFollows: true })
    expect(air.macs.view()).toMatchObject({ paceFollows: false, paired: true })
  }, 30_000)

  it('never moves Pace between Macs of two Slack apps that share a key', async () => {
    const home = mac('MacBook Pro', 'xapp-1-HOME')
    const work = mac('Work Mac', 'xapp-1-WORK')
    await home.start()
    await work.start()
    // Paired by Add a device before either had a Slack app of its own
    const key = Buffer.alloc(32, 7).toString('base64')
    await home.macs.joinGroup(key)
    await work.macs.joinGroup(key)
    work.macs.addAddress(`127.0.0.1:${home.macs.listening}`)
    await poll(() => home.macs.connected()).toEqual([work.macs.id])
    // Whichever you use, each answers through its own app
    home.state.use = { ...left }
    work.state.use = { ...using }
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(home.state.answering).toBe(true)
    expect(work.state.answering).toBe(true)
  }, 30_000)

  it('follows you to and from a Mac on Pacenote before 0.6.13, which says no app', async () => {
    const pro = mac('MacBook Pro')
    const old = mac('Old Mac')
    // What 0.6.12 tells the others: its state, with no app in it
    const told = old.macs as unknown as { state: () => MacState }
    const state = told.state.bind(old.macs)
    told.state = () => {
      const said: Partial<MacState> = state()
      delete said.app
      return said as MacState
    }
    await pro.start()
    await poll(() => leaseOf(pro.dataDir)?.holder).toBe(pro.macs.id)
    await old.start()
    old.macs.addAddress(`127.0.0.1:${pro.macs.listening}`)
    await poll(() => old.state.answering).toBe(false)
    // You leave the Pro for the old Mac, and back
    pro.state.use = { ...left }
    old.state.use = { ...using }
    await poll(() => old.state.answering).toBe(true)
    await poll(() => pro.state.answering).toBe(false)
    old.state.use = { ...left }
    pro.state.use = { ...using }
    await poll(() => pro.state.answering).toBe(true)
  }, 30_000)
})
