import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createServer, type Server } from 'node:http'
import path from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { readJson, writeJson } from '../tasks/store.js'
import { Bonjour, SETUP_SERVICE } from './bonjour.js'
import {
  accept,
  dial,
  macsGroup,
  macsKey,
  setupAccept,
  type MacChannel,
  type MacHello,
} from './channel.js'
import {
  claim,
  claimReason,
  shouldAnswer,
  type ClaimReason,
  type PeerSeen,
} from './lease.js'
import { hostPort, MACS_PORT, privateAddress } from './network.js'
import {
  away,
  inUse,
  laterLease,
  type Lease,
  type AddingView,
  type MacState,
  type MacStatus,
  type MacsView,
  type MacUse,
  type MacView,
  type SetupPayload,
} from './types.js'

/**
 * Your Macs, from this one: finds the others with the same Slack app on your
 * network (Bonjour, or addresses you add), keeps a channel open to each
 * (channel.ts), tells them how this Mac is used, and decides whether Pace
 * answers here (lease.ts). The desktop app opens or closes Pace's Slack
 * connection on onAnswer; everything else Pace does is as before.
 *
 * Without your own Slack app (the team hub), or until you turn on Settings >
 * Macs > Follow the Mac you're using on each Mac, it does nothing and Pace
 * answers here, as on a Mac of its own.
 */

export const MACS_FILE = 'macs.json'

interface MacsFile {
  version: 1
  /** This Mac, for the others */
  id: string
  follow: boolean
  /** Added by hand, for Macs on another network (Tailscale) */
  addresses: string[]
  /** Macs you stopped following to */
  ignored: string[]
  /** The latest lease this Mac heard of, so a restart knows who answers */
  lease?: Lease
  /** The other Macs, as last heard from */
  known: Record<string, { name: string; lastSeen: string; address?: string }>
}

const HEARTBEAT_MS = 5_000
/** A Mac not heard from for this long is out of reach */
const SILENT_MS = 15_000
const DIAL_MS = 10_000
/**
 * A Mac that holds the lease but has not opened its Slack connection for this
 * long is passed over, so some Mac answers
 */
const STALLED_MS = 60_000
/**
 * Just started, how long this Mac waits to hear from the one that answered
 * before taking over from it
 */
const STARTUP_MS = 15_000
const MAX_MESSAGE = 16 * 1024 * 1024
/** How long Add a Mac waits for the new Mac */
export const ADDING_MS = 10 * 60_000
/** Setup just finished: how long the new Mac waits to hear the others */
const CLAIM_WAIT_MS = 30_000

/** What Macs say to each other over their channel */
type MacMessage = { t: 'state'; state: MacState }

interface Link {
  channel: MacChannel
  state?: MacState
  heardAt: number
  /** Since when it has said its Slack connection is not open */
  closedSince?: number
  /** Where it was reached */
  address?: string
  /** The target it was dialed as */
  target?: string
}

interface Target {
  host: string
  port: number
  /** Its id, when Bonjour said it */
  id?: string
  /** Its Bonjour name, for when it leaves */
  instance?: string
  /** The address you added it by */
  address?: string
}

export interface MacsOptions {
  dataDir: string
  /** Your Slack app's app-level token, which the Macs know each other by */
  appToken: () => string | undefined
  name: string
  version: string
  use: () => MacUse
  /** Pace here: running, and whether its Slack connection is open */
  pace: () => { ready: boolean; answering: boolean; reasoner?: string }
  /** Pace should open (true) or close its Slack connection */
  onAnswer: (here: boolean) => void
  /** Collect now runs here, since then */
  collecting?: () => string | undefined
  /** What Add a Mac sends a new Mac once you Allow */
  setupPayload?: () => SetupPayload
  log: (message: string) => void
  /** 0 takes any free port (tests); MACS_PORT otherwise */
  port?: number
  /** Look on the network with Bonjour (off in tests, which add addresses) */
  bonjour?: boolean
  now?: () => number
  tickMs?: number
}

export class Macs extends EventEmitter<{
  change: []
  /** A channel to another Mac opened: what to tell it first */
  linked: [peer: string]
  /** Anything another Mac says besides its state (todo-sync.ts) */
  message: [peer: string, message: unknown]
}> {
  private file: MacsFile
  private readonly links = new Map<string, Link>()
  private readonly targets = new Map<string, Target>()
  private readonly dialing = new Set<string>()
  private server?: Server
  private wss?: WebSocketServer
  private bonjour?: Bonjour
  private key?: Buffer
  private token?: string
  private timer?: NodeJS.Timeout
  private startedAt = 0
  private stopped = false
  private lastHeartbeat = 0
  /** What this Mac last told the others, but for the seconds idle */
  private lastTold = ''
  private lastDial = 0
  /** When this Mac last held the lease, after losing it */
  private heldUntil?: number
  private here = true
  private moved?: { from: string; at: string }
  private blocked = false
  private lastView = ''
  private port = 0
  /** The network side being opened or closed again (network()) */
  private networking?: Promise<void>
  /** When each Mac was last heard from, written to macs.json now and then */
  private readonly seenAt = new Map<string, number>()
  /** The Macs heard from since this one started */
  private readonly heardSinceStart = new Set<string>()
  /** Add a Mac, while it waits or until you close what it says */
  private adding?: {
    until: number
    timer?: NodeJS.Timeout
    advert?: Bonjour
    request?: { name: string; code: string; channel: MacChannel }
    result?: AddingView['result']
  }
  /** Set up just now from another Mac: this one takes over once it can */
  private claimSince?: number
  private readonly now: () => number

  constructor(private readonly options: MacsOptions) {
    super()
    this.now = options.now ?? Date.now
    this.file = this.read()
  }

  /** This Mac's id */
  get id(): string {
    return this.file.id
  }

  /** Whether Pace answers here now */
  get answers(): boolean {
    return this.here
  }

  /** The port this Mac listens on for the others, once listening */
  get listening(): number | undefined {
    return this.server ? this.port : undefined
  }

  async start(): Promise<void> {
    this.startedAt = this.now()
    this.here = this.decide(false)
    await this.network()
    this.timer = setInterval(
      () => void this.tick(),
      this.options.tickMs ?? 2_000
    )
    this.timer.unref?.()
  }

  async stop(): Promise<void> {
    this.stopped = true
    clearInterval(this.timer)
    this.timer = undefined
    await this.disconnect()
  }

  view(): MacsView {
    const now = this.now()
    const lease = this.file.lease
    const pace = this.options.pace()
    const me: MacView = {
      id: this.id,
      name: this.options.name,
      here: true,
      status: this.myStatus(pace.answering),
      away: away(this.options.use()),
      asleep: false,
      notReady: !pace.ready,
      reasoner: pace.reasoner,
    }
    const others: MacView[] = []
    const ids = new Set([
      ...Object.keys(this.file.known),
      ...[...this.links.values()].flatMap((link) =>
        link.state ? [link.state.id] : []
      ),
    ])
    for (const id of ids) {
      if (id === this.id) continue
      const link = this.links.get(id)
      const state = link?.state
      const known = this.file.known[id]
      const reachable = Boolean(link && now - link.heardAt < SILENT_MS)
      let status: MacStatus = 'out-of-reach'
      if (reachable && state)
        status =
          lease?.holder === id
            ? state.answering
              ? 'answering'
              : 'moving'
            : state.answering
              ? 'moving'
              : 'standing-by'
      others.push({
        id,
        name: state?.name ?? known?.name ?? id,
        here: false,
        status,
        away: state ? away(state.use) : false,
        asleep: state?.use.asleep ?? false,
        notReady: state ? !state.ready : false,
        lastSeen: known?.lastSeen,
        reasoner: state?.reasoner,
        address: link?.address ?? known?.address,
        ...(reachable && state?.collecting
          ? { collecting: state.collecting }
          : {}),
      })
    }
    return {
      available: Boolean(this.options.appToken()),
      follow: this.file.follow,
      macs: [
        me,
        ...others.filter((mac) => !this.file.ignored.includes(mac.id)),
      ],
      ...(this.enabled() && lease ? { holder: lease.holder } : {}),
      addresses: this.file.addresses,
      blocked: this.blocked,
      moved: this.moved,
      ...(this.adding
        ? {
            adding: {
              until: new Date(this.adding.until).toISOString(),
              ...(this.adding.request
                ? {
                    request: {
                      name: this.adding.request.name,
                      code: this.adding.request.code,
                    },
                  }
                : {}),
              ...(this.adding.result ? { result: this.adding.result } : {}),
            },
          }
        : {}),
    }
  }

  /**
   * Looks again now: this Mac locked, unlocked, went to sleep or woke, or
   * Pace started or stopped. The others hear of it at once.
   */
  refresh(): void {
    void this.tick()
  }

  /** The other Macs a channel is open to now, by id */
  connected(): string[] {
    return [...this.links.keys()]
  }

  /** Says something to another Mac, if a channel is open to it */
  send(peer: string, message: unknown): boolean {
    const link = this.links.get(peer)
    if (!link) return false
    link.channel.send(message)
    return true
  }

  /**
   * Add a Mac: shows this Mac on your network for a new one's setup, for 10
   * minutes, with following turned on. false without your own Slack app.
   */
  async startAdding(): Promise<boolean> {
    if (!this.options.appToken()) return false
    this.clearAdding()
    if (!this.file.follow) await this.setFollow(true)
    if (!this.server) return false
    const timer = setTimeout(() => this.endAdding('expired'), ADDING_MS)
    timer.unref?.()
    const advert =
      this.options.bonjour === false
        ? undefined
        : new Bonjour({
            service: SETUP_SERVICE,
            advertise: {
              name: this.options.name,
              port: this.port,
              txt: { id: this.id },
            },
            log: this.options.log,
          })
    advert?.start()
    this.adding = { until: this.now() + ADDING_MS, timer, advert }
    this.options.log('Macs: waiting for a new Mac to set up from this one')
    this.emitIfChanged()
    return true
  }

  /** Stop: no new Mac is waited for any longer */
  stopAdding(): void {
    this.clearAdding()
    this.emitIfChanged()
  }

  /** Allow: sends the new Mac what it takes from this one */
  allowAdding(): void {
    const request = this.adding?.request
    const payload = this.options.setupPayload?.()
    if (!request || this.adding?.result || !payload) return
    request.channel.send({ t: 'setup-settings', payload })
    this.options.log(`Macs: sending ${request.name} what it needs`)
  }

  /** Not this one: the numbers differ, or it is not your Mac */
  declineAdding(): void {
    const request = this.adding?.request
    if (!request || this.adding?.result) return
    request.channel.send({ t: 'setup-declined' })
    this.endAdding('declined', request.name)
  }

  /** What Add a Mac said is read: it goes away */
  closeAdding(): void {
    if (this.adding?.result) this.clearAdding()
    this.emitIfChanged()
  }

  /**
   * Setup just finished here from another Mac: Pace moves here once it runs,
   * since this is the Mac in use, after it has heard from the others
   */
  claimWhenReady(): void {
    this.claimSince = this.now()
    void this.tick()
  }

  /** Answer here: this Mac claims the lease now */
  answerHere(): void {
    if (!this.enabled() || !this.options.pace().ready) return
    this.take('asked')
    void this.tick()
  }

  async setFollow(on: boolean): Promise<void> {
    if (this.file.follow === on) return
    this.save({ follow: on })
    this.options.log(
      on
        ? 'Macs: following the Mac you use'
        : 'Macs: off; Pace answers on this Mac'
    )
    await this.network()
    await this.tick()
  }

  /** Adds a Mac by address (another network); false for one that is not */
  addAddress(address: string): boolean {
    const text = address.trim()
    if (!hostPort(text)) return false
    if (!this.file.addresses.includes(text))
      this.save({ addresses: [...this.file.addresses, text] })
    this.lastDial = 0
    this.targetsFromAddresses()
    void this.tick()
    return true
  }

  removeAddress(address: string): void {
    this.save({
      addresses: this.file.addresses.filter((entry) => entry !== address),
    })
    this.targetsFromAddresses()
    this.emitIfChanged()
  }

  /** Stop following to a Mac: its channel closes, and it is not dialed again */
  ignore(id: string): void {
    if (id === this.id || this.file.ignored.includes(id)) return
    this.save({ ignored: [...this.file.ignored, id] })
    this.links.get(id)?.channel.close()
    void this.tick()
  }

  /** The Macs Macs follows on, enabled: your own Slack app and the switch on */
  private enabled(): boolean {
    return this.file.follow && Boolean(this.options.appToken())
  }

  /** This Mac's state, for the others */
  private state(): MacState {
    const pace = this.options.pace()
    const collecting = this.options.collecting?.()
    return {
      id: this.id,
      name: this.options.name,
      version: this.options.version,
      use: this.options.use(),
      lease: this.file.lease,
      ready: pace.ready,
      answering: pace.answering,
      ...(pace.reasoner ? { reasoner: pace.reasoner } : {}),
      ...(collecting ? { collecting } : {}),
    }
  }

  private myStatus(answering: boolean): MacStatus {
    if (!this.enabled()) return 'answering'
    const holder = this.file.lease?.holder
    if (holder === undefined || holder === this.id)
      return answering ? 'answering' : 'moving'
    return this.here ? 'moving' : 'standing-by'
  }

  /** The others as the rules see them */
  private peers(): PeerSeen[] {
    const now = this.now()
    return [...this.links.values()].flatMap((link) =>
      link.state && !this.file.ignored.includes(link.state.id)
        ? [
            {
              id: link.state.id,
              use: link.state.use,
              ready: link.state.ready,
              answering: link.state.answering,
              reachable: now - link.heardAt < SILENT_MS,
              // Holding the lease, it could not open its connection
              stalled:
                this.file.lease?.holder === link.state.id &&
                link.closedSince !== undefined &&
                now - link.closedSince >= STALLED_MS,
            },
          ]
        : []
    )
  }

  /**
   * Claims the lease when the rules say so, and works out whether Pace
   * answers here. take: whether this may claim (not while just starting).
   */
  private decide(take = true): boolean {
    if (!this.enabled()) return true
    const pace = this.options.pace()
    const peers = this.peers()
    const lease = this.file.lease
    const reason = claimReason({
      me: { id: this.id, use: this.options.use(), ready: pace.ready },
      lease,
      peers,
    })
    // Just started, the Mac that answered may not have been found yet
    const waiting =
      reason === 'holder-gone' &&
      lease !== undefined &&
      this.file.known[lease.holder] !== undefined &&
      !this.heardSinceStart.has(lease.holder) &&
      this.now() - this.startedAt < STARTUP_MS
    if (take && reason && !waiting) this.take(reason)
    return shouldAnswer({
      me: { id: this.id },
      lease: this.file.lease,
      peers,
      heldUntil: this.heldUntil,
      now: this.now(),
    })
  }

  private take(reason: ClaimReason): void {
    const previous = this.file.lease
    const lease = claim(this.id, previous, this.now())
    this.setLease(lease)
    const from = previous && this.file.known[previous.holder]?.name
    if (from) this.moved = { from, at: new Date(this.now()).toISOString() }
    this.options.log(
      `Macs: Pace answers on this Mac now (${
        {
          none: 'no Mac answered',
          'holder-gone': `${from ?? 'the Mac that answered'} is out of reach`,
          'holder-asleep': `${from} went to sleep`,
          'holder-away': `${from} was left and this Mac is in use`,
          asked: 'you asked',
        }[reason]
      })`
    )
    this.broadcast()
  }

  private setLease(lease: Lease | undefined): void {
    const before = this.file.lease
    const next = laterLease(before, lease)
    if (next === before) return
    if (before?.holder === this.id && next?.holder !== this.id)
      this.heldUntil = this.now()
    this.save({ lease: next })
  }

  private async tick(): Promise<void> {
    if (this.stopped) return
    if (this.networking) await this.networking
    else if (this.tokenChanged()) {
      this.networking = this.network().finally(() => {
        this.networking = undefined
      })
      await this.networking
    }
    const now = this.now()
    for (const link of this.links.values())
      if (now - link.heardAt >= SILENT_MS) link.channel.close()
    if (this.enabled()) {
      if (now - this.lastDial >= DIAL_MS) {
        this.lastDial = now
        for (const [key, target] of this.targets)
          void this.dialTarget(key, target)
      }
    }
    if (
      this.claimSince !== undefined &&
      this.enabled() &&
      this.options.pace().ready &&
      (this.peers().some((peer) => peer.reachable) ||
        now - this.claimSince >= CLAIM_WAIT_MS)
    ) {
      this.claimSince = undefined
      if (this.file.lease?.holder !== this.id) this.take('asked')
    }
    const here = this.decide()
    if (here !== this.here) {
      this.here = here
      this.options.log(
        here
          ? 'Macs: opening Slack connection here'
          : 'Macs: another Mac answers; closing Slack connection here'
      )
      this.options.onAnswer(here)
    }
    if (
      now - this.lastHeartbeat >= HEARTBEAT_MS ||
      this.told() !== this.lastTold
    )
      this.broadcast()
    this.emitIfChanged()
  }

  private emitIfChanged(): void {
    const view = JSON.stringify(this.view(), (key, value: unknown) =>
      key === 'lastSeen' ? undefined : value
    )
    if (view === this.lastView) return
    this.lastView = view
    this.emit('change')
  }

  /** This Mac's state as far as the rules go: told again whenever it changes */
  private told(): string {
    const { use, lease, ready, answering, collecting } = this.state()
    return JSON.stringify([
      lease,
      ready,
      answering,
      collecting,
      inUse(use),
      away(use),
      use.asleep,
    ])
  }

  private broadcast(): void {
    this.lastHeartbeat = this.now()
    this.lastTold = this.told()
    const message: MacMessage = { t: 'state', state: this.state() }
    for (const link of this.links.values()) link.channel.send(message)
  }

  private tokenChanged(): boolean {
    return (this.options.appToken() ?? '') !== (this.token ?? '')
  }

  /** Opens or closes the network side to match the switch and the token */
  private async network(): Promise<void> {
    await this.disconnect()
    this.token = this.options.appToken()
    if (!this.enabled() || !this.token) return
    this.key = macsKey(this.token)
    await this.listen()
    if (this.options.bonjour !== false)
      this.bonjour = new Bonjour({
        advertise: {
          name: this.options.name,
          port: this.port,
          txt: { g: macsGroup(this.key), id: this.id },
        },
        look: {
          accept: (txt) =>
            txt.g === macsGroup(this.key!) &&
            txt.id !== this.id &&
            !this.file.ignored.includes(txt.id ?? ''),
          found: (mac) => {
            this.targets.set(`bonjour:${mac.instance}`, {
              host: mac.host,
              port: mac.port,
              id: mac.txt.id,
              instance: mac.instance,
            })
            this.lastDial = 0
            void this.tick()
          },
          lost: (instance) => this.targets.delete(`bonjour:${instance}`),
        },
        log: this.options.log,
      })
    this.bonjour?.start()
    this.targetsFromAddresses()
    this.lastDial = 0
  }

  private async disconnect(): Promise<void> {
    this.clearAdding()
    this.bonjour?.stop()
    this.bonjour = undefined
    for (const link of this.links.values()) link.channel.close()
    this.links.clear()
    this.targets.clear()
    for (const client of this.wss?.clients ?? []) client.terminate()
    this.wss?.close()
    this.wss = undefined
    const server = this.server
    this.server = undefined
    if (server) await new Promise((resolve) => server.close(resolve))
  }

  private targetsFromAddresses(): void {
    for (const key of [...this.targets.keys()])
      if (key.startsWith('address:')) this.targets.delete(key)
    if (!this.enabled()) return
    for (const address of this.file.addresses) {
      const where = hostPort(address)
      if (where) this.targets.set(`address:${address}`, { ...where, address })
    }
  }

  private async listen(): Promise<void> {
    const server = createServer((_req, res) => {
      res.writeHead(426).end()
    })
    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_MESSAGE,
    })
    server.on('upgrade', (req, socket, head) => {
      const address = req.socket.remoteAddress
      // Only your own networks, never the internet
      if (!privateAddress(address)) return socket.destroy()
      // A new Mac setting up from this one, only while Add a Mac waits
      const setup = (req.url ?? '').startsWith('/setup')
      const key = this.key
      if (setup ? !this.adding || this.adding.result : !key)
        return socket.destroy()
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (setup) return this.setupConnection(ws)
        accept(ws, { key: key!, me: this.hello() })
          .then((channel) => this.linked(channel, address))
          .catch(() => undefined)
      })
    })
    const wanted = this.options.port ?? MACS_PORT
    this.port = await new Promise<number>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        // Taken by something else: any free port, which Bonjour tells
        if (err.code === 'EADDRINUSE' && wanted !== 0) {
          server.listen(0, '::')
          return
        }
        reject(err)
      }
      server.on('error', onError)
      server.listen(wanted, '::', () => {
        server.off('error', onError)
        const bound = server.address()
        resolve(typeof bound === 'object' && bound ? bound.port : wanted)
      })
    })
    this.server = server
    this.wss = wss
  }

  /** A new Mac asking to set up from this one, while Add a Mac waits */
  private setupConnection(ws: WebSocket): void {
    const adding = this.adding
    if (!adding || adding.result || adding.request) return ws.close()
    setupAccept(ws, { me: this.hello() })
      .then(({ channel, code }) => {
        if (this.adding !== adding || adding.request || adding.result)
          return channel.close()
        const name = channel.peer.name
        adding.request = { name, code, channel }
        channel.on('message', (message) => {
          const { t, error } = (message ?? {}) as { t?: string; error?: string }
          if (t === 'setup-done') {
            this.options.log(`Macs: ${name} is set up from this Mac`)
            this.endAdding('sent', name)
          } else if (t === 'setup-failed')
            this.options.log(
              `Macs: ${name} could not take the settings: ${error}`
            )
        })
        channel.on('close', () => {
          if (adding.request?.channel !== channel || adding.result) return
          adding.request = undefined
          this.emitIfChanged()
        })
        this.options.log(`Macs: ${name} asks to set up from this Mac`)
        this.emitIfChanged()
      })
      .catch(() => undefined)
  }

  /** Add a Mac ended: it stops showing itself, and says how it ended */
  private endAdding(
    kind: NonNullable<AddingView['result']>['kind'],
    name?: string
  ): void {
    const adding = this.adding
    if (!adding || adding.result) return
    if (kind === 'expired') adding.request?.channel.send({ t: 'setup-expired' })
    adding.advert?.stop()
    clearTimeout(adding.timer)
    adding.request?.channel.close()
    this.adding = {
      until: adding.until,
      result: { kind, ...(name ? { name } : {}) },
    }
    this.emitIfChanged()
  }

  private clearAdding(): void {
    const adding = this.adding
    if (!adding) return
    adding.advert?.stop()
    clearTimeout(adding.timer)
    adding.request?.channel.close()
    this.adding = undefined
  }

  private hello(): MacHello {
    return { id: this.id, name: this.options.name }
  }

  private async dialTarget(key: string, target: Target): Promise<void> {
    const signingKey = this.key
    if (!signingKey || this.dialing.has(key)) return
    if (target.id && (this.links.has(target.id) || target.id === this.id))
      return
    if ([...this.links.values()].some((link) => link.target === key)) return
    this.dialing.add(key)
    const host = target.host.includes(':') ? `[${target.host}]` : target.host
    const ws = new WebSocket(`ws://${host}:${target.port}/`, {
      handshakeTimeout: 5_000,
      maxPayload: MAX_MESSAGE,
    })
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve())
        ws.once('error', reject)
      })
      const channel = await dial(ws, { key: signingKey, me: this.hello() })
      this.blocked = false
      this.linked(channel, target.address ?? target.host, key)
    } catch (err) {
      ws.terminate()
      const code = (err as NodeJS.ErrnoException).code
      // macOS answers this way when Local Network access is off for the app
      if (code === 'EHOSTUNREACH' && target.instance) this.blocked = true
    } finally {
      this.dialing.delete(key)
    }
  }

  /** A channel the handshake opened: one per Mac, the lower id's dial kept */
  private linked(channel: MacChannel, address?: string, target?: string): void {
    const id = channel.peer.id
    if (this.file.ignored.includes(id) || !this.enabled()) {
      channel.close()
      return
    }
    const existing = this.links.get(id)
    if (existing) {
      const dialer = (link: MacChannel) => (link.dialed ? this.id : id)
      if (dialer(existing.channel) <= dialer(channel)) {
        channel.close()
        return
      }
      existing.channel.close()
    }
    const link: Link = { channel, heardAt: this.now(), address, target }
    this.links.set(id, link)
    channel.on('message', (message) => this.heard(link, message))
    channel.on('close', () => {
      if (this.links.get(id) !== link) return
      this.links.delete(id)
      this.options.log(`Macs: lost ${link.state?.name ?? id}`)
      void this.tick()
    })
    this.options.log(
      `Macs: connected to ${channel.peer.name} (${address ?? '?'})`
    )
    channel.send({ t: 'state', state: this.state() } satisfies MacMessage)
    this.emit('linked', id)
  }

  private heard(link: Link, message: unknown): void {
    const { t, state } = (message ?? {}) as Partial<MacMessage>
    if (t !== 'state') {
      link.heardAt = this.now()
      this.emit('message', link.channel.peer.id, message)
      return
    }
    if (!state || state.id !== link.channel.peer.id) return
    link.state = state
    link.heardAt = this.now()
    link.closedSince = state.answering
      ? undefined
      : (link.closedSince ?? this.now())
    this.heardSinceStart.add(state.id)
    // Written when something changed, or once a minute while it is heard from
    const known = this.file.known[state.id]
    const savedAt = this.seenAt.get(state.id) ?? 0
    if (
      known?.name !== state.name ||
      (link.address && known.address !== link.address) ||
      this.now() - savedAt >= 60_000
    ) {
      this.seenAt.set(state.id, this.now())
      this.save({
        known: {
          ...this.file.known,
          [state.id]: {
            name: state.name,
            lastSeen: new Date(this.now()).toISOString(),
            ...(link.address ? { address: link.address } : {}),
          },
        },
      })
    }
    const before = this.file.lease
    this.setLease(state.lease)
    // A later lease from another Mac: tell the rest at once
    if (this.file.lease !== before) this.broadcast()
    void this.tick()
  }

  private read(): MacsFile {
    const file = readJson<Partial<MacsFile>>(
      path.join(this.options.dataDir, MACS_FILE),
      {}
    )
    const value: MacsFile = {
      version: 1,
      id: typeof file.id === 'string' && file.id ? file.id : randomUUID(),
      // Off until you turn it on: then this Mac looks on your network, and
      // macOS asks once whether it may
      follow: file.follow === true,
      addresses: Array.isArray(file.addresses) ? file.addresses : [],
      ignored: Array.isArray(file.ignored) ? file.ignored : [],
      ...(file.lease ? { lease: file.lease } : {}),
      known: file.known ?? {},
    }
    if (value.id !== file.id) this.write(value)
    return value
  }

  private save(patch: Partial<MacsFile>): void {
    this.file = { ...this.file, ...patch }
    this.write(this.file)
  }

  private write(value: MacsFile): void {
    try {
      writeJson(path.join(this.options.dataDir, MACS_FILE), value)
    } catch (err) {
      this.options.log(
        `Macs: could not save ${MACS_FILE}: ${(err as Error).message}`
      )
    }
  }
}
