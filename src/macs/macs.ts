import { randomBytes, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import path from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { readJson, writeJson } from '../tasks/store.js'
import { Bonjour, SETUP_SERVICE } from './bonjour.js'
import {
  accept,
  deviceKey,
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
import {
  hostPort,
  MACS_PORT,
  privateAddress,
  tailnetAddresses,
} from './network.js'
import {
  away,
  inUse,
  laterLease,
  type Lease,
  type AddingView,
  type DeviceKind,
  type DeviceRecord,
  type DeviceView,
  type MacState,
  type MacStatus,
  type MacsView,
  type MacUse,
  type MacView,
  type SetupPayload,
} from './types.js'

/**
 * Your Macs, from this one: finds the others with the same key on your network
 * (Bonjour, or addresses you add), keeps a channel open to each (channel.ts),
 * tells them how this Mac is used, and decides whether Pace answers here
 * (lease.ts). The desktop app opens or closes Pace's Slack connection on
 * onAnswer; everything else Pace does is as before.
 *
 * The key is your Slack app's (macsKey of its app token), as before 0.6.13,
 * or one Add a Mac made on a Mac with no Slack app of its own and handed to
 * the next (GROUP_FILE), which then wins. Over the channel Todo stays the same
 * on each Mac (todo-sync.ts); Pace follows you only between Macs answering
 * through the same Slack app of your own, never with the team hub.
 *
 * Until you turn on Settings > Macs (Follow the Mac you're using, or Find your
 * other Macs) or Add a Mac, it does nothing and Pace answers here, as on a Mac
 * of its own.
 */

export const MACS_FILE = 'macs.json'
/**
 * The key Add a Mac made or brought (base64), kept apart from macs.json and
 * readable by you alone, as settings.json's secrets are
 */
export const GROUP_FILE = 'macs-key'

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
  /** Your devices (DeviceRecord), paired here or with your other Macs */
  devices: Record<string, DeviceRecord>
  /** Devices you removed, and when: no Mac of yours lets them in again */
  removed: Record<string, string>
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
 * A Mac that just claimed the lease waits this long before it claims again
 * by itself (Answer here aside), so two Macs whose rules disagree for a moment
 * never take it back and forth
 */
const CLAIM_COOLDOWN_MS = 15_000
/**
 * Unreachable this long, as macOS answers while Local Network access is off,
 * before Settings > Macs says so: the first time, macOS is still asking
 */
const BLOCKED_MS = 30_000
/** How often to dial again while the network turns this Mac away */
const REDIAL_MS = 2_000
/**
 * Just started, how long this Mac waits to hear from the one that answered
 * before taking over from it
 */
const STARTUP_MS = 15_000
const MAX_MESSAGE = 16 * 1024 * 1024
/** How long Add a Mac waits for the new Mac */
const ADDING_MS = 10 * 60_000
/** Setup just finished: how long the new Mac waits to hear the others */
const CLAIM_WAIT_MS = 30_000

/** What Macs say to each other over their channel */
type MacMessage = { t: 'state'; state: MacState }

/**
 * Your devices, as one Mac tells the others when it links to them and when
 * one is paired or removed. Pacenote before 0.6.14 leaves it alone.
 */
interface DevicesMessage {
  t: 'devices'
  devices: Record<string, DeviceRecord>
  removed: Record<string, string>
}

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

interface MacsOptions {
  dataDir: string
  /**
   * Your own Slack app's app-level token (none with the team hub): the Macs'
   * key when Add a Mac made none, and the app Pace follows you with
   */
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
  /** Tests shorten these: STALLED_MS, CLAIM_COOLDOWN_MS */
  stalledMs?: number
  cooldownMs?: number
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
  /** The key the network side was opened with */
  private netKey?: Buffer
  /** The key Add a Mac made or brought (GROUP_FILE) */
  private group?: Buffer
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
  /** Since when dialing has been turned away as by Local Network access */
  private unreachableSince?: number
  /** When this Mac last claimed the lease */
  private claimedAt?: number
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
    request?: {
      name: string
      code: string
      channel: MacChannel
      device?: DeviceKind
    }
    result?: AddingView['result']
  }
  /** Set up just now from another Mac: this one takes over once it can */
  private claimSince?: number
  private readonly now: () => number

  constructor(private readonly options: MacsOptions) {
    super()
    this.now = options.now ?? Date.now
    this.file = this.read()
    this.group = this.readGroup()
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
    const adding = this.adding
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
        link.state && !link.channel.peer.device ? [link.state.id] : []
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
        ...(reachable && state?.collecting && { collecting: state.collecting }),
      })
    }
    return {
      paceFollows: Boolean(this.options.appToken()),
      paired: Boolean(this.key()),
      follow: this.file.follow,
      macs: [
        me,
        ...others.filter((mac) => !this.file.ignored.includes(mac.id)),
      ],
      ...(this.paceFollows() && lease ? { holder: lease.holder } : {}),
      addresses: this.file.addresses,
      blocked: this.blocked,
      moved: this.moved,
      ...(adding && {
        adding: {
          until: new Date(adding.until).toISOString(),
          ...(adding.request && {
            request: {
              name: adding.request.name,
              code: adding.request.code,
              ...(adding.request.device && { device: adding.request.device }),
            },
          }),
          ...(adding.result && { result: adding.result }),
        },
      }),
      devices: this.devices(now),
    }
  }

  /** Your devices, those linked to this Mac first */
  private devices(now: number): DeviceView[] {
    return Object.entries(this.file.devices)
      .map(([id, record]) => {
        const link = this.links.get(id)
        const connected = Boolean(
          link?.channel.peer.device && now - link.heardAt < SILENT_MS
        )
        return {
          id,
          ...record,
          connected,
          ...(link && { address: link.address }),
        }
      })
      .sort(
        (a, b) =>
          Number(b.connected) - Number(a.connected) ||
          (b.lastSeen ?? b.pairedAt).localeCompare(a.lastSeen ?? a.pairedAt)
      )
  }

  /**
   * Removes a device: it is let in by none of your Macs again (they hear of
   * it now, or as they link), and its channel here closes
   */
  removeDevice(id: string): void {
    if (this.file.removed[id]) return
    const { [id]: gone, ...devices } = this.file.devices
    this.save({
      devices,
      removed: {
        ...this.file.removed,
        [id]: new Date(this.now()).toISOString(),
      },
    })
    this.options.log(`Macs: removed ${gone?.name ?? id}`)
    this.links.get(id)?.channel.close()
    this.tellDevices()
    this.emitIfChanged()
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

  /** Whether a peer is a device of yours (iPhone, iPad, Android), not a Mac */
  isDevice(peer: string): boolean {
    return Boolean(this.links.get(peer)?.channel.peer.device)
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
   * minutes, with following turned on. With no Slack app of your own and no
   * key yet, it makes the key your Macs will know each other by.
   */
  async startAdding(): Promise<boolean> {
    if (!this.key()) this.setGroup(randomBytes(32))
    this.clearAdding()
    if (!this.file.follow) await this.setFollow(true)
    // On already, with the key just made: the network side opens with it
    else await this.tick()
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

  /**
   * Allow: sends the new Mac what it takes from this one, with the key your
   * Macs know each other by
   */
  allowAdding(): void {
    const request = this.adding?.request
    const key = this.key()
    if (!request || this.adding?.result || !key) return
    // A device: a key of its own and your Macs' group, nothing else
    if (request.device) {
      const id = request.channel.peer.id
      request.channel.send({
        t: 'setup-device',
        key: deviceKey(key, id).toString('base64'),
        group: macsGroup(key),
      })
      // A device pairs with a new id each time: one you removed stays out
      this.save({
        devices: {
          ...this.file.devices,
          [id]: {
            name: request.name,
            device: request.device,
            pairedAt: new Date(this.now()).toISOString(),
            by: this.options.name,
          },
        },
      })
      this.options.log(`Macs: giving ${request.name} a key of its own`)
      this.tellDevices()
      return
    }
    const payload: SetupPayload = {
      ...(this.options.setupPayload?.() ?? { values: {} }),
      group: key.toString('base64'),
    }
    request.channel.send({ t: 'setup-settings', payload })
    this.options.log(`Macs: sending ${request.name} what it needs`)
  }

  /**
   * Takes the key your other Mac sent (Add a Mac there), so this Mac pairs
   * with it and its others, once the network side opened again with it. false
   * for one that is not a key.
   */
  async joinGroup(group: string): Promise<boolean> {
    const key = Buffer.from(group, 'base64')
    if (key.length !== 32) return false
    // Your Slack app's own key already: nothing to keep apart from it
    const token = this.options.appToken()
    if (!this.group && token && macsKey(token).equals(key)) return true
    this.setGroup(key)
    await this.tick()
    return true
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
    if (!this.paceFollows() || !this.options.pace().ready) return
    this.take('asked')
    void this.tick()
  }

  async setFollow(on: boolean): Promise<void> {
    if (this.file.follow === on) return
    this.save({ follow: on })
    this.options.log(
      on
        ? 'Macs: on; looking for your other Macs'
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

  /**
   * The key your Macs know each other by: the one Add a Mac made or brought,
   * else your own Slack app's
   */
  private key(): Buffer | undefined {
    if (this.group) return this.group
    const token = this.options.appToken()
    return token ? macsKey(token) : undefined
  }

  /** On: the switch, and a key to know the others by */
  private linkable(): boolean {
    return this.file.follow && Boolean(this.key())
  }

  /** Pace follows the Mac you use: on, with your own Slack app */
  private paceFollows(): boolean {
    return this.linkable() && Boolean(this.options.appToken())
  }

  /** The Slack app Pace answers through here, one way (MacState.app) */
  private app(): string | undefined {
    const token = this.options.appToken()
    return token ? macsGroup(macsKey(token)) : undefined
  }

  /**
   * Another Mac that answers through the same Slack app: the only kind Pace
   * moves between. One before 0.6.13 does not say its app, and pairs only by
   * its app's key, so it shares this Mac's app when that is the key in use.
   */
  private sameApp(state: MacState): boolean {
    const mine = this.app()
    if (!mine) return false
    if (state.app !== undefined) return state.app === mine
    const token = this.options.appToken()
    return Boolean(token && this.key()?.equals(macsKey(token)))
  }

  /** This Mac's state, for the others */
  private state(): MacState {
    const pace = this.options.pace()
    const collecting = this.options.collecting?.()
    const app = this.app()
    const reach = this.server ? tailnetAddresses(this.port) : []
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
      ...(app ? { app } : {}),
      ...(reach.length ? { reach } : {}),
    }
  }

  private myStatus(answering: boolean): MacStatus {
    if (!this.paceFollows()) return 'answering'
    const holder = this.file.lease?.holder
    if (holder === undefined || holder === this.id)
      return answering ? 'answering' : 'moving'
    return this.here ? 'moving' : 'standing-by'
  }

  /** The others as the rules see them: those of the same Slack app */
  private peers(): PeerSeen[] {
    const now = this.now()
    return [...this.links.values()].flatMap((link) =>
      link.state &&
      !this.file.ignored.includes(link.state.id) &&
      this.sameApp(link.state)
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
                now - link.closedSince >=
                  (this.options.stalledMs ?? STALLED_MS),
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
    if (!this.paceFollows()) return true
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
    const cooling =
      reason !== 'asked' &&
      this.claimedAt !== undefined &&
      this.now() - this.claimedAt <
        (this.options.cooldownMs ?? CLAIM_COOLDOWN_MS)
    if (take && reason && !waiting && !cooling) this.take(reason)
    return shouldAnswer({
      me: { id: this.id },
      lease: this.file.lease,
      peers,
      heldUntil: this.heldUntil,
      now: this.now(),
    })
  }

  private take(reason: ClaimReason): void {
    // A first claim, with no lease known yet, is no disagreement to cool off
    // from: once there is a lease, no Mac claims for that reason again.
    if (reason !== 'none') this.claimedAt = this.now()
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
    // A Mac that holds the lease is stalled only after it has held it a while
    // without opening its connection, not counting the time it stood by
    if (next && next.holder !== before?.holder) {
      const link = this.links.get(next.holder)
      if (link)
        link.closedSince = link.state?.answering ? undefined : this.now()
    }
    this.save({ lease: next })
  }

  private async tick(): Promise<void> {
    if (this.stopped) return
    if (this.networking) await this.networking
    else if (this.keyChanged()) {
      this.networking = this.network().finally(() => {
        this.networking = undefined
      })
      await this.networking
    }
    const now = this.now()
    for (const link of this.links.values())
      if (now - link.heardAt >= SILENT_MS) link.channel.close()
    if (this.linkable()) {
      const every =
        this.unreachableSince !== undefined &&
        now - this.unreachableSince < 60_000
          ? REDIAL_MS
          : DIAL_MS
      if (now - this.lastDial >= every) {
        this.lastDial = now
        for (const [key, target] of this.targets)
          void this.dialTarget(key, target)
      }
    }
    if (
      this.claimSince !== undefined &&
      this.paceFollows() &&
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

  /** The key changed since the network side opened: a new token or group */
  private keyChanged(): boolean {
    const key = this.key()
    return key && this.netKey ? !key.equals(this.netKey) : key !== this.netKey
  }

  /** Opens or closes the network side to match the switch and the key */
  private async network(): Promise<void> {
    await this.disconnect()
    this.netKey = this.key()
    if (!this.linkable() || !this.netKey) return
    const group = macsGroup(this.netKey)
    await this.listen()
    if (this.options.bonjour !== false)
      this.bonjour = new Bonjour({
        advertise: {
          name: this.options.name,
          port: this.port,
          txt: { g: group, id: this.id },
        },
        look: {
          accept: (txt) =>
            txt.g === group &&
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
    if (!this.linkable()) return
    for (const address of this.file.addresses) {
      const where = hostPort(address)
      if (where) this.targets.set(`address:${address}`, { ...where, address })
    }
  }

  private async listen(): Promise<void> {
    const server = createServer((_req, res) => res.writeHead(426).end())
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
      const key = this.netKey
      if (setup ? !this.adding || this.adding.result : !key)
        return socket.destroy()
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (setup) return this.setupConnection(ws)
        accept(ws, {
          key: key!,
          me: this.hello(),
          deviceKey: (id) =>
            this.file.removed[id] ? undefined : deviceKey(key!, id),
        })
          .then((channel) => this.linked(channel, address))
          .catch(() => undefined)
      })
    })
    const wanted = this.options.port ?? MACS_PORT
    this.port = await new Promise<number>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        // Taken by something else: any free port, which Bonjour tells
        if (err.code === 'EADDRINUSE' && wanted !== 0) server.listen(0, '::')
        else reject(err)
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
        const { name, device } = channel.peer
        adding.request = { name, code, channel, ...(device && { device }) }
        channel.on('message', (message) => {
          const { t, error } = (message ?? {}) as { t?: string; error?: string }
          if (t === 'setup-done') {
            this.options.log(`Macs: ${name} is set up from this Mac`)
            this.endAdding('sent', name, device)
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
    name?: string,
    device?: DeviceKind
  ): void {
    const adding = this.adding
    if (!adding || adding.result) return
    if (kind === 'expired') adding.request?.channel.send({ t: 'setup-expired' })
    this.clearAdding()
    this.adding = {
      until: adding.until,
      result: { kind, ...(name ? { name } : {}), ...(device && { device }) },
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
    const signingKey = this.netKey
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
      this.unreachableSince = undefined
      this.blocked = false
      this.linked(channel, target.address ?? target.host, key)
    } catch (err) {
      ws.terminate()
      const code = (err as NodeJS.ErrnoException).code
      // macOS answers this way when Local Network access is off for the app,
      // and while it first asks: said only once it lasts
      if (code === 'EHOSTUNREACH' && target.instance) {
        this.unreachableSince ??= this.now()
        this.blocked = this.now() - this.unreachableSince >= BLOCKED_MS
      }
    } finally {
      this.dialing.delete(key)
    }
  }

  /** A channel the handshake opened: one per Mac, the lower id's dial kept */
  private linked(channel: MacChannel, address?: string, target?: string): void {
    const id = channel.peer.id
    const device = channel.peer.device
    if (
      this.file.ignored.includes(id) ||
      (device && this.file.removed[id]) ||
      !this.linkable()
    )
      return channel.close()
    const existing = this.links.get(id)
    // A device always dials: the newer channel is the one it uses now
    if (existing && device) existing.channel.close()
    else if (existing) {
      const dialer = (link: MacChannel) => (link.dialed ? this.id : id)
      if (dialer(existing.channel) <= dialer(channel)) return channel.close()
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
    if (device) this.seenDevice(id)
    else channel.send(this.devicesMessage())
    this.emit('linked', id)
  }

  private devicesMessage(): DevicesMessage {
    return {
      t: 'devices',
      devices: this.file.devices,
      removed: this.file.removed,
    }
  }

  /** Tells your other Macs of your devices: one paired, seen or removed */
  private tellDevices(): void {
    const message = this.devicesMessage()
    for (const link of this.links.values())
      if (!link.channel.peer.device) link.channel.send(message)
  }

  /**
   * What another Mac knows of your devices, kept with this one's: a device
   * removed on any Mac is removed on all, and its channel here closes
   */
  private heardDevices(message: Partial<DevicesMessage>): void {
    const removed = { ...this.file.removed }
    for (const [id, at] of Object.entries(message.removed ?? {}))
      if (typeof at === 'string' && (!removed[id] || at < removed[id]!))
        removed[id] = at
    const devices: Record<string, DeviceRecord> = {}
    for (const [id, record] of Object.entries({
      ...(message.devices ?? {}),
      ...this.file.devices,
    })) {
      if (removed[id]) continue
      const theirs = message.devices?.[id]
      const mine = this.file.devices[id]
      // The later sighting wins: the Mac it is linked to says it last
      const seen = (r?: DeviceRecord) => r?.lastSeen ?? r?.pairedAt ?? ''
      devices[id] =
        theirs && mine ? (seen(theirs) > seen(mine) ? theirs : mine) : record
    }
    if (
      JSON.stringify(devices) === JSON.stringify(this.file.devices) &&
      JSON.stringify(removed) === JSON.stringify(this.file.removed)
    )
      return
    this.save({ devices, removed })
    for (const id of Object.keys(removed))
      if (this.links.get(id)?.channel.peer.device)
        this.links.get(id)?.channel.close()
    this.emitIfChanged()
  }

  /** A device was heard from here: written now and then, as Macs are */
  private seenDevice(id: string): void {
    const record = this.file.devices[id]
    const savedAt = this.seenAt.get(id) ?? 0
    if (!record || this.now() - savedAt < 60_000) return
    this.seenAt.set(id, this.now())
    this.save({
      devices: {
        ...this.file.devices,
        [id]: { ...record, lastSeen: new Date(this.now()).toISOString() },
      },
    })
  }

  private heard(link: Link, message: unknown): void {
    const { t, state } = (message ?? {}) as { t?: string; state?: MacState }
    const device = Boolean(link.channel.peer.device)
    if (t === 'devices') {
      link.heardAt = this.now()
      // Only your Macs say who your devices are
      if (!device) this.heardDevices(message as Partial<DevicesMessage>)
      return
    }
    if (t !== 'state') {
      link.heardAt = this.now()
      this.emit('message', link.channel.peer.id, message)
      return
    }
    // A device's state says only that it is there: never a Mac, no lease
    if (device) {
      link.heardAt = this.now()
      this.seenDevice(link.channel.peer.id)
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
      devices: file.devices ?? {},
      removed: file.removed ?? {},
    }
    if (value.id !== file.id) this.write(value)
    return value
  }

  private readGroup(): Buffer | undefined {
    try {
      const key = Buffer.from(
        readFileSync(
          path.join(this.options.dataDir, GROUP_FILE),
          'utf8'
        ).trim(),
        'base64'
      )
      return key.length === 32 ? key : undefined
    } catch {
      return undefined
    }
  }

  /** Keeps the key your Macs know each other by, for you alone to read */
  private setGroup(key: Buffer): void {
    const file = path.join(this.options.dataDir, GROUP_FILE)
    try {
      writeFileSync(file, `${key.toString('base64')}\n`, { mode: 0o600 })
      chmodSync(file, 0o600)
    } catch (err) {
      this.options.log(
        `Macs: could not save ${GROUP_FILE}: ${(err as Error).message}`
      )
    }
    this.group = key
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
