import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { localized } from '../i18n/locale.js'
import { Bonjour, SETUP_SERVICE } from './bonjour.js'
import { setupDial, type MacChannel, type MacHello } from './channel.js'
import { hostPort } from './network.js'
import { text } from './setup.text.js'
import type { FromMacMode, FromMacState, SetupPayload } from './types.js'

/**
 * A new Mac's setup, taken from your other Mac (the Slack step's "Connect to
 * your other Mac"): it finds the Mac waiting in Add a device on this network,
 * or reaches it by address; both show a 6-digit number (channel.ts setupDial);
 * once you Allow there, that Mac's Slack app, who Pace answers and Todo's
 * collection settings come over, and apply takes them in here.
 */

const MAX_MESSAGE = 16 * 1024 * 1024
/** How long a first connection is tried again before setup says it failed */
const RETRY_MS = 30_000

export class SetupFromMac extends EventEmitter<{ change: [FromMacState] }> {
  private state: FromMacState = { step: 'idle' }
  private bonjour?: Bonjour
  private ws?: WebSocket
  private channel?: MacChannel
  private readonly found = new Map<
    string,
    { name: string; host: string; port: number }
  >()
  /** The try now: an older one's events are let go */
  private attempt = 0
  /** What this look takes in (FromMacMode) */
  private mode: FromMacMode = 'pace'

  constructor(
    private readonly options: {
      /** This Mac, as the other one will show it */
      me: () => MacHello
      /**
       * Takes in what the other Mac sent, as the look that found it asked
       * (mode); throws when it cannot
       */
      apply: (
        payload: SetupPayload,
        from: { name: string; address?: string },
        mode: FromMacMode
      ) => Promise<void> | void
      log: (message: string) => void
      /** Look on the network with Bonjour (off in tests) */
      bonjour?: boolean
      /** Tests shorten RETRY_MS */
      retryMs?: number
    }
  ) {
    super()
  }

  get current(): FromMacState {
    return this.state
  }

  /**
   * Looks for a Mac waiting in Add a device on this network, for what it
   * takes this time: Pace's setup, Todo's first run, or Settings (FromMacMode)
   */
  look(mode: FromMacMode = 'pace'): void {
    this.cancel()
    this.mode = mode
    if (this.options.bonjour !== false) {
      this.bonjour = new Bonjour({
        service: SETUP_SERVICE,
        look: {
          accept: () => true,
          found: (mac) => {
            this.found.set(mac.instance, {
              name: mac.instance,
              host: mac.host,
              port: mac.port,
            })
            this.listFound()
          },
          lost: (instance) => {
            this.found.delete(instance)
            this.listFound()
          },
        },
        log: this.options.log,
      })
      this.bonjour.start()
    }
    this.set({ step: 'looking', found: [] })
  }

  /**
   * Connects to a Mac found on the network (instance) or to an address you
   * typed, such as one over Tailscale
   */
  async connect(
    target: { instance: string } | { address: string }
  ): Promise<void> {
    const parsed = 'instance' in target ? undefined : hostPort(target.address)
    const where =
      'instance' in target
        ? this.found.get(target.instance)
        : parsed && { ...parsed, name: target.address }
    if (!where)
      return this.set({ step: 'error', message: localized(text).enterAddress })
    const attempt = ++this.attempt
    this.closeChannel()
    this.set({ step: 'connecting', name: where.name })
    // The first try often meets macOS still asking for Local Network access,
    // or the other Mac not waiting yet: tried again quietly for a while
    const started = Date.now()
    let result: Awaited<ReturnType<typeof setupDial>> | { error: string }
    for (let tries = 0; ; tries++) {
      result = await this.tryOnce(where)
      if (attempt !== this.attempt) {
        if ('channel' in result) result.channel.close()
        return
      }
      if ('channel' in result) break
      if (Date.now() - started >= (this.options.retryMs ?? RETRY_MS))
        return this.set({ step: 'error', message: result.error })
      this.set({ step: 'connecting', name: where.name, retrying: true })
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(500 * 2 ** tries, 4_000))
      )
      if (attempt !== this.attempt) return
    }
    const { channel, code } = result
    const name = channel.peer.name
    this.channel = channel
    this.stopLooking()
    this.set({ step: 'confirming', name, code })
    channel.on('message', (message) => {
      const { t, payload } = (message ?? {}) as {
        t?: string
        payload?: SetupPayload
      }
      if (t === 'setup-settings' && payload)
        void this.take(channel, name, payload, target)
      else if (t === 'setup-declined')
        this.end(channel, localized(text).cancelled(name))
      else if (t === 'setup-expired')
        this.end(channel, localized(text).stoppedWaiting(name))
    })
    channel.on('close', () => {
      if (this.channel !== channel || this.state.step !== 'confirming') return
      this.channel = undefined
      this.set({ step: 'error', message: localized(text).closed(name) })
    })
  }

  /** One try at the other Mac: the channel, or why not */
  private async tryOnce(where: {
    name: string
    host: string
    port: number
  }): Promise<Awaited<ReturnType<typeof setupDial>> | { error: string }> {
    const host = where.host.includes(':') ? `[${where.host}]` : where.host
    const ws = new WebSocket(`ws://${host}:${where.port}/setup`, {
      handshakeTimeout: 5_000,
      maxPayload: MAX_MESSAGE,
    })
    this.ws = ws
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve())
        ws.once('error', reject)
        ws.once('unexpected-response', () => reject(new Error('not waiting')))
      })
    } catch {
      ws.terminate()
      return { error: localized(text).unreachable(where.name) }
    }
    try {
      return await setupDial(ws, { me: this.options.me() })
    } catch (err) {
      ws.terminate()
      return { error: (err as Error).message }
    }
  }

  /** Cancel: lets the other Mac go, and stops looking */
  cancel(): void {
    this.attempt += 1
    this.closeChannel()
    this.stopLooking()
    this.found.clear()
    this.set({ step: 'idle' })
  }

  private async take(
    channel: MacChannel,
    name: string,
    payload: SetupPayload,
    target: { instance: string } | { address: string }
  ): Promise<void> {
    try {
      await this.options.apply(
        payload,
        {
          name,
          ...('address' in target ? { address: target.address.trim() } : {}),
        },
        this.mode
      )
    } catch (err) {
      const message = (err as Error).message
      channel.send({ t: 'setup-failed', error: message })
      return this.end(channel, localized(text).couldNotTake(message))
    }
    channel.send({ t: 'setup-done' })
    this.channel = undefined
    channel.close()
    this.options.log(`Set up from ${name}`)
    this.set({
      step: 'copied',
      name,
      ...(payload.me ? { me: payload.me } : {}),
    })
  }

  private end(channel: MacChannel, message: string): void {
    this.channel = undefined
    channel.close()
    this.set({ step: 'error', message })
  }

  private listFound(): void {
    if (this.state.step !== 'looking') return
    this.set({
      step: 'looking',
      found: [...this.found.entries()].map(([instance, mac]) => ({
        instance,
        name: mac.name,
      })),
    })
  }

  private stopLooking(): void {
    this.bonjour?.stop()
    this.bonjour = undefined
  }

  private closeChannel(): void {
    const channel = this.channel
    this.channel = undefined
    channel?.close()
    this.ws?.terminate()
    this.ws = undefined
  }

  private set(state: FromMacState): void {
    this.state = state
    this.emit('change', state)
  }
}
