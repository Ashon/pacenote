import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { setupAccept, setupDial } from '../src/macs/channel.js'
import { Macs } from '../src/macs/macs.js'
import { SetupFromMac } from '../src/macs/setup.js'
import type { FromMacState, SetupPayload } from '../src/macs/types.js'

/** Waits for a Mac to get there, with room for a busy test run */
const poll = <T>(check: () => T) =>
  expect.poll(check, { timeout: 15_000, interval: 50 })

describe('setting up a new Mac from one already set up', () => {
  const dirs: string[] = []
  const stops: (() => unknown)[] = []
  afterEach(async () => {
    for (const stop of stops.splice(0).reverse()) await stop()
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true })
  })

  it('agrees on the same number on both Macs, and seals what follows', async () => {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    stops.push(() => wss.close())
    await new Promise((resolve) => wss.once('listening', resolve))
    const port = (wss.address() as { port: number }).port
    const accepted = new Promise<Awaited<ReturnType<typeof setupAccept>>>(
      (resolve, reject) =>
        wss.once('connection', (ws) =>
          setupAccept(ws, { me: { id: 'pro', name: 'MacBook Pro' } }).then(
            resolve,
            reject
          )
        )
    )
    const ws = new WebSocket(`ws://127.0.0.1:${port}/setup`)
    await new Promise((resolve) => ws.once('open', resolve))
    const [pro, air] = await Promise.all([
      accepted,
      setupDial(ws, { me: { id: 'air', name: 'MacBook Air' } }),
    ])
    expect(pro.code).toMatch(/^\d{6}$/)
    expect(air.code).toBe(pro.code)
    expect(air.channel.peer).toEqual({ id: 'pro', name: 'MacBook Pro' })
    const got = new Promise((resolve) => air.channel.once('message', resolve))
    pro.channel.send({ t: 'setup-settings' })
    await expect(got).resolves.toEqual({ t: 'setup-settings' })
    pro.channel.close()
  })

  /** The Mac already set up, with your own Slack app, following off */
  async function pro() {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'pacenote-setup-'))
    dirs.push(dataDir)
    const payload: SetupPayload = {
      values: {
        SLACK_APP_TOKEN: 'xapp-1-HOME',
        SLACK_BOT_TOKEN: 'xoxb-1',
        MENTION_ALLOWED_USERS: 'U0ASHON',
        TASKS: 'on',
      },
      me: { id: 'U0ASHON', name: 'ashon' },
    }
    const macs = new Macs({
      dataDir,
      appToken: () => 'xapp-1-HOME',
      name: 'MacBook Pro',
      version: '0.5.31',
      use: () => ({ idle: 1, locked: false, asleep: false }),
      pace: () => ({ ready: true, answering: true }),
      onAnswer: () => undefined,
      setupPayload: () => payload,
      log: () => undefined,
      port: 0,
      bonjour: false,
      tickMs: 50,
    })
    await macs.start()
    stops.push(() => macs.stop())
    return { macs, payload }
  }

  /** The new Mac's setup, with what it took */
  function air(retryMs = 300) {
    const took: { payload: SetupPayload; from: unknown }[] = []
    const states: FromMacState[] = []
    const setup = new SetupFromMac({
      me: () => ({ id: 'air', name: 'MacBook Air' }),
      apply: (payload, from) => void took.push({ payload, from }),
      log: () => undefined,
      bonjour: false,
      retryMs,
    })
    setup.on('change', (state) => states.push(state))
    stops.push(() => setup.cancel())
    return { setup, took, states }
  }

  it('sends your Slack app, who Pace answers and Todo settings once you Allow', async () => {
    const { macs, payload } = await pro()
    expect(await macs.startAdding()).toBe(true)
    // Add a Mac turns following on.
    expect(macs.view()).toMatchObject({ follow: true, adding: {} })
    const { setup, took } = air()
    setup.look()
    await setup.connect({ address: `127.0.0.1:${macs.listening}` })
    await poll(() => macs.view().adding?.request?.name).toBe('MacBook Air')
    const code = macs.view().adding!.request!.code
    expect(setup.current).toEqual({
      step: 'confirming',
      name: 'MacBook Pro',
      code,
    })
    macs.allowAdding()
    await poll(() => setup.current.step).toBe('copied')
    expect(took).toEqual([
      {
        payload,
        from: { name: 'MacBook Pro', address: `127.0.0.1:${macs.listening}` },
      },
    ])
    await poll(() => macs.view().adding?.result).toEqual({
      kind: 'sent',
      name: 'MacBook Air',
    })
    macs.closeAdding()
    expect(macs.view().adding).toBeUndefined()
  })

  it('sends nothing when you say Not this one, and takes no one when not waiting', async () => {
    const { macs } = await pro()
    const { setup, took } = air()
    // Not waiting in Add a Mac: the new Mac is turned away.
    await macs.setFollow(true)
    await setup.connect({ address: `127.0.0.1:${macs.listening}` })
    expect(setup.current).toMatchObject({
      step: 'error',
      message: expect.stringContaining("Couldn't reach"),
    })

    await macs.startAdding()
    await setup.connect({ address: `127.0.0.1:${macs.listening}` })
    await poll(() => macs.view().adding?.request?.name).toBe('MacBook Air')
    macs.declineAdding()
    await poll(() => setup.current).toEqual({
      step: 'error',
      message: 'Cancelled on MacBook Pro. Nothing was copied.',
    })
    expect(took).toEqual([])
    expect(macs.view().adding?.result).toEqual({
      kind: 'declined',
      name: 'MacBook Air',
    })
  })

  it('tries again quietly while the other Mac is not waiting yet', async () => {
    const { macs } = await pro()
    await macs.setFollow(true)
    const { setup, states } = air(10_000)
    // Asked before Add a Mac: no error, it waits and tries again
    const connecting = setup.connect({
      address: `127.0.0.1:${macs.listening}`,
    })
    await poll(() =>
      states.some((s) => s.step === 'connecting' && s.retrying)
    ).toBe(true)
    expect(states.some((s) => s.step === 'error')).toBe(false)
    await macs.startAdding()
    await connecting
    expect(setup.current).toMatchObject({
      step: 'confirming',
      name: 'MacBook Pro',
    })
    expect(states.some((s) => s.step === 'error')).toBe(false)
  })

  it('offers nothing without your own Slack app', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'pacenote-setup-'))
    dirs.push(dataDir)
    const macs = new Macs({
      dataDir,
      appToken: () => undefined,
      name: 'MacBook Pro',
      version: '0.5.31',
      use: () => ({ idle: 1, locked: false, asleep: false }),
      pace: () => ({ ready: true, answering: true }),
      onAnswer: () => undefined,
      log: () => undefined,
      port: 0,
      bonjour: false,
    })
    await macs.start()
    stops.push(() => macs.stop())
    expect(await macs.startAdding()).toBe(false)
    expect(macs.view().adding).toBeUndefined()
  })
})
