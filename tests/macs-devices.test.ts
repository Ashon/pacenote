import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { HistoryReader } from '../src/history/reader.js'
import { HistoryStore } from '../src/history/recorder.js'
import { apiForDevice } from '../src/local-api.js'
import {
  API_ASK,
  argsFromDevice,
  DEVICE_ASKS,
  DeviceAsks,
  valueForDevice,
  type AnswerMessage,
} from '../src/macs/asks.js'
import {
  deviceKey,
  dial,
  macsGroup,
  setupDial,
  type MacChannel,
  type MacHello,
} from '../src/macs/channel.js'
import { GROUP_FILE, Macs, MACS_FILE } from '../src/macs/macs.js'
import { tailnetAddresses } from '../src/macs/network.js'

/** Waits for the Macs to get there, with room for a busy run */
const poll = <T>(check: () => T) =>
  expect.poll(check, { timeout: 15_000, interval: 50 })
/** A test that pairs over the network: a busy runner takes past 5 seconds */
const NETWORK_MS = 30_000

const ipad: MacHello = { id: 'ipad-1', name: 'iPad', device: 'tablet' }

/** A socket to a Mac, open */
async function socket(address: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://${address}`)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
  return ws
}

/** The next message a channel says, of a kind */
const next = <T>(channel: MacChannel, t: string) =>
  new Promise<T>((resolve) => {
    const heard = (message: unknown) => {
      if ((message as { t?: string }).t !== t) return
      channel.off('message', heard)
      resolve(message as T)
    }
    channel.on('message', heard)
  })

// A device of yours (the iPhone, iPad and Android app) as your Macs see it:
// it pairs through Add a device, and dials as a device with a key of its own
describe('your devices and your Macs', () => {
  const dirs: string[] = []
  const stops: (() => unknown)[] = []
  afterEach(async () => {
    for (const stop of stops.splice(0).reverse()) await stop()
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true })
  })

  /**
   * A Mac with your Slack app's token in what Add a device sends a new Mac;
   * with a key already, it looks for your other Macs at addresses
   */
  async function mac(
    options: { name?: string; group?: Buffer; addresses?: string[] } = {}
  ) {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'pacenote-devices-'))
    dirs.push(dataDir)
    writeFileSync(
      path.join(dataDir, MACS_FILE),
      JSON.stringify({
        follow: Boolean(options.group),
        addresses: options.addresses ?? [],
      })
    )
    if (options.group)
      writeFileSync(
        path.join(dataDir, GROUP_FILE),
        options.group.toString('base64')
      )
    const macs = new Macs({
      dataDir,
      appToken: () => undefined,
      name: options.name ?? 'MacBook Pro',
      version: '0.6.14',
      use: () => ({ idle: 1, locked: false, asleep: false }),
      pace: () => ({ ready: false, answering: false }),
      onAnswer: () => undefined,
      setupPayload: () => ({
        values: { TASKS: 'on', SLACK_APP_TOKEN: 'xapp-not-for-devices' },
      }),
      log: () => undefined,
      port: 0,
      bonjour: false,
      tickMs: 50,
    })
    await macs.start()
    stops.push(() => macs.stop())
    return { dataDir, macs, address: () => `127.0.0.1:${macs.listening}` }
  }

  /** Pairs the iPad through Add a device: what the Mac sends it once allowed */
  async function pairDevice(macs: Macs) {
    // Add a device opens the Mac on your network, if it was not yet
    await macs.startAdding()
    const address = `127.0.0.1:${macs.listening}`
    const { channel } = await setupDial(await socket(`${address}/setup`), {
      me: ipad,
    })
    await poll(() => macs.view().adding?.request?.device).toBe('tablet')
    const sent = next<Record<string, unknown>>(channel, 'setup-device')
    macs.allowAdding()
    const given = await sent
    channel.send({ t: 'setup-done' })
    await poll(() => macs.view().adding?.result?.kind).toBe('sent')
    channel.close()
    return given
  }

  /** The iPad dials a Mac as a device, with the key it was given */
  async function linkDevice(
    given: Record<string, unknown>,
    address: string
  ): Promise<MacChannel> {
    const channel = await dial(await socket(address), {
      key: Buffer.from(String(given.key), 'base64'),
      group: String(given.group),
      me: ipad,
    })
    stops.push(() => channel.close())
    // As the app does: it is there
    channel.send({
      t: 'state',
      state: { id: ipad.id, name: ipad.name, app: '', ready: false },
    })
    return channel
  }

  it(
    "gives a device a key of its own, never your Macs' key or Slack app",
    async () => {
      const { dataDir, macs, address } = await mac()
      const given = await pairDevice(macs)
      const group = Buffer.from(
        readFileSync(path.join(dataDir, GROUP_FILE), 'utf8').trim(),
        'base64'
      )
      expect(given).toEqual({
        t: 'setup-device',
        key: deviceKey(group, 'ipad-1').toString('base64'),
        group: macsGroup(group),
      })
      expect(JSON.stringify(given)).not.toContain(group.toString('base64'))
      expect(JSON.stringify(given)).not.toContain('xapp-')
      expect(macs.view().adding?.result).toEqual({
        kind: 'sent',
        name: 'iPad',
        device: 'tablet',
      })

      await linkDevice(given, address())
      // One of your devices, not one of your Macs: no lease for Pace there
      await poll(() =>
        macs.view().devices.map(({ name, device, connected, by }) => ({
          name,
          device,
          connected,
          by,
        }))
      ).toEqual([
        { name: 'iPad', device: 'tablet', connected: true, by: 'MacBook Pro' },
      ])
      expect(macs.isDevice('ipad-1')).toBe(true)
      expect(macs.view().macs.map((m) => m.name)).toEqual(['MacBook Pro'])
    },
    NETWORK_MS
  )

  it(
    'is let in by none of your Macs once you remove it on one',
    async () => {
      const first = await mac()
      const given = await pairDevice(first.macs)
      // Your other Mac, with the same key, linked to the first
      const group = readFileSync(path.join(first.dataDir, GROUP_FILE), 'utf8')
      const second = await mac({
        name: 'Mac mini',
        group: Buffer.from(group.trim(), 'base64'),
        addresses: [first.address()],
      })
      await poll(() => second.macs.view().devices.map((d) => d.name)).toEqual([
        'iPad',
      ])
      // It reaches your other Mac as well, by the same key
      const there = await linkDevice(given, second.address())
      await poll(() => second.macs.isDevice('ipad-1')).toBe(true)
      there.close()
      const linked = await linkDevice(given, first.address())
      let closed = false
      linked.on('close', () => (closed = true))
      await poll(() => first.macs.view().devices[0]?.connected).toBe(true)

      // Removed on the Mac mini: the MacBook Pro hears of it and lets go
      second.macs.removeDevice('ipad-1')
      await poll(() => first.macs.view().devices).toEqual([])
      await poll(() => closed).toBe(true)
      await expect(linkDevice(given, first.address())).rejects.toThrow()
      expect(first.macs.connected()).not.toContain('ipad-1')
    },
    NETWORK_MS
  )

  it(
    "answers a device's asks with what the Mac's screens get, and no more",
    async () => {
      const { dataDir, macs, address } = await mac()
      // A run of Pace's, with its prompt (the thread, the system prompt)
      const run = new HistoryStore(dataDir).start({
        origin: {
          messenger: 'slack',
          conversation: 'C1',
          conversationLabel: '#ops',
          thread: '1',
          message: '1',
          userId: 'U1',
        },
        request: 'Is db-3 still growing?',
        backend: { reasoner: 'claude', sandbox: 'none' },
      })
      run.setPrompt('the system prompt', 'mina: the thread so far')
      run.patch({ status: 'succeeded', answer: 'Yes, 41 GB.' })
      run.flush()
      // The Mac's own screens' channels, as the desktop app answers them
      const saved: unknown[] = []
      const bridged: Record<string, (...args: unknown[]) => unknown> = {
        'pacenote:settings:get': () => ({
          file: '/x/settings.json',
          exists: true,
          dataDir,
          values: { REASONER: 'claude' },
          secrets: { SLACK_BOT_TOKEN: { set: true, hint: '…a1b2' } },
          overridden: [],
        }),
        'pacenote:settings:save': (changes) => {
          saved.push(changes)
          return { issues: [], restarted: false }
        },
      }
      const reader = new HistoryReader(dataDir)
      const asks = new DeviceAsks({
        macs,
        answer: async (what, args) => {
          if (what === API_ASK) return apiForDevice(reader, args[0])
          return valueForDevice(
            what,
            await bridged[DEVICE_ASKS[what]]?.(...argsFromDevice(what, args))
          )
        },
        log: () => undefined,
      })
      asks.start()
      stops.push(() => asks.stop())
      const device = await linkDevice(await pairDevice(macs), address())
      let asked = 0
      const ask = (what: string, args: unknown[] = []) => {
        const id = ++asked
        const answer = new Promise<AnswerMessage>((resolve) => {
          const heard = (message: unknown) => {
            const answer = message as AnswerMessage
            if (answer.t !== 'answer' || answer.id !== id) return
            device.off('message', heard)
            resolve(answer)
          }
          device.on('message', heard)
        })
        device.send({ t: 'ask', id, what, args })
        return answer
      }

      const got = (await ask(API_ASK, [`/api/runs/${run.id}`])).value as {
        status: number
        body: Record<string, unknown>
      }
      expect(got.status).toBe(200)
      expect(got.body).toMatchObject({
        request: 'Is db-3 still growing?',
        answer: 'Yes, 41 GB.',
      })
      // The thread and the system prompt stay on the Mac
      expect(got.body.prompt).toBeUndefined()
      // A secret: set or not, nothing of its value
      const settings = await ask('settings.get')
      expect(settings.value).toMatchObject({
        secrets: { SLACK_BOT_TOKEN: { set: true } },
      })
      expect(JSON.stringify(settings)).not.toContain('a1b2')
      // A change from the device: what stays on the Mac does not go
      await ask('settings.save', [
        { REASONER: 'codex', SLACK_BOT_TOKEN: 'xoxb-new', OPS_FS_ROOT: '/' },
      ])
      expect(saved).toEqual([{ REASONER: 'codex' }])
      // Anything else, it does not answer
      expect(await ask('tasks.list')).toMatchObject({ error: 'not-allowed' })
    },
    NETWORK_MS
  )

  it("says a Mac's Tailscale addresses, and leaves out the rest", () => {
    const entry = (address: string, family: 'IPv4' | 'IPv6') => ({
      address,
      family,
      internal: false,
      netmask: '',
      mac: '00:00:00:00:00:00',
      cidr: null,
      ...(family === 'IPv6' ? { scopeid: 0 } : {}),
    })
    expect(
      tailnetAddresses(49213, {
        en0: [entry('192.168.10.196', 'IPv4')],
        utun4: [
          entry('100.66.18.65', 'IPv4'),
          entry('fd7a:115c:a1e0::9836:1241', 'IPv6'),
        ],
        // Another VPN's tunnel, not Tailscale's ranges
        utun5: [entry('10.8.0.2', 'IPv4')],
      } as never)
    ).toEqual(['100.66.18.65:49213', '[fd7a:115c:a1e0::9836:1241]:49213'])
  })
})
