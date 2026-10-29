import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
  type KeyObject,
} from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { RawData, WebSocket } from 'ws'
import { localized } from '../i18n/locale.js'
import { text } from './channel.text.js'
import type { DeviceKind } from './types.js'

/**
 * The channel between two of your Macs, over a WebSocket on your network.
 *
 * Both Macs hold the same key, and that is what they know each other by: the
 * one derived from your Slack app's token (macsKey), or one a Mac with no
 * Slack app of its own made and handed over when you added the next (Add a
 * Mac, macs.ts). It proves each side to the other, and nothing else gets in. A
 * Mac with another key (another workspace's Slack app, your company's Pace)
 * never pairs with them.
 *
 * 1. The dialing Mac says hello: its group, id, name and a fresh nonce.
 * 2. The other answers with its own and a proof: an HMAC under the key of
 *    both nonces and both ids.
 * 3. The dialing Mac checks it and sends its own proof.
 * Then each direction has a key of its own, derived from the key and both
 * nonces, and every message is sealed with AES-256-GCM under it, numbered so
 * that none can be played again. The key never crosses the network on this
 * channel: only Add a Mac's setup channel (below) hands it to a new Mac.
 */

const PROTOCOL = 1
const ALGORITHM = 'aes-256-gcm'
/** How long a Mac has to finish the handshake */
const HANDSHAKE_MS = 5_000

/**
 * A device of yours (types.ts DeviceKind) holds a key of its own, not your
 * Macs': deviceKey of theirs and its id, which any of your Macs works out
 * again as it says hello, and none does once you remove it.
 */
export const isDeviceKind = (value: unknown): value is DeviceKind =>
  value === 'phone' || value === 'tablet'

/** The key a device of yours holds, from your Macs' key and its id */
export function deviceKey(key: Buffer, id: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      key,
      Buffer.from(id, 'utf8'),
      'pacenote-device key v1',
      32
    )
  )
}

/** The key two Macs with this Slack app token share */
export function macsKey(appToken: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', appToken, 'pacenote-macs', 'key v1', 32)
  )
}

/**
 * What Macs with the same key show on the network (Bonjour), so each dials
 * only its own: one way, it gives nothing of the key away
 */
export function macsGroup(key: Buffer): string {
  return createHmac('sha256', key).update('group').digest('hex').slice(0, 16)
}

/** Who a Mac is, as it says hello: a device of yours says which kind */
export interface MacHello {
  id: string
  name: string
  device?: DeviceKind
}

interface HelloMessage {
  t: 'hello'
  v: number
  group: string
  id: string
  name: string
  nonce: string
  proof?: string
  /** A device of yours, with a key of its own (deviceKey) */
  device?: DeviceKind
}

const proof = (
  key: Buffer,
  role: 'dialer' | 'listener',
  dialer: { id: string; nonce: string },
  listener: { id: string; nonce: string }
) =>
  createHmac('sha256', key)
    .update(
      [role, dialer.nonce, listener.nonce, dialer.id, listener.id].join('\n')
    )
    .digest('base64')

const same = (a: string, b: string) => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** This Mac's hello in your Macs' group, with its proof once it has one */
const helloOf = (group: string, me: MacHello, nonce: string, signed?: string) =>
  JSON.stringify({
    t: 'hello',
    v: PROTOCOL,
    group,
    id: me.id,
    name: me.name,
    nonce,
    proof: signed,
    ...(me.device && { device: me.device }),
  } satisfies HelloMessage)

/**
 * A handshake that did not go through, and why, in the app's language (as
 * Settings > Macs and the setup show it)
 */
class HandshakeError extends Error {}

/** A handshake turned down: the socket closes, and the error says why */
function refuse(ws: WebSocket, message: string): HandshakeError {
  ws.close()
  return new HandshakeError(message)
}

/** A handshake's next frame, the socket closed if none comes as it should */
const closing = <T>(ws: WebSocket, frame: Promise<T>) =>
  frame.catch((err: unknown) => {
    ws.close()
    throw err
  })

/** A channel the handshake opened: sealed messages, both ways */
export class MacChannel extends EventEmitter<{
  message: [unknown]
  close: []
}> {
  private sent = 0n
  private received = -1n
  private closed = false

  constructor(
    private readonly ws: WebSocket,
    incoming: Incoming,
    private readonly keys: { send: Buffer; receive: Buffer },
    /** The other Mac */
    readonly peer: MacHello,
    /** Whether this Mac dialed */
    readonly dialed: boolean
  ) {
    super()
    ws.on('close', () => this.ended())
    ws.on('error', () => this.close())
    // Frames that came with the handshake's last one are handed over first,
    // once whoever opened the channel listens: a device asks at once, and a
    // message said before then would be lost (Incoming keeps them till then)
    setImmediate(() =>
      incoming.hand((frame) => {
        if (this.closed) return
        if (!frame.binary) return this.close()
        const message = this.open(frame.data)
        if (message === undefined) return this.close()
        this.emit('message', message)
      })
    )
  }

  send(message: unknown): void {
    if (this.closed) return
    const counter = this.sent++
    const header = Buffer.alloc(8)
    header.writeBigUInt64BE(counter)
    const cipher = createCipheriv(ALGORITHM, this.keys.send, iv(counter))
    const body = Buffer.concat([
      cipher.update(JSON.stringify(message), 'utf8'),
      cipher.final(),
    ])
    this.ws.send(Buffer.concat([header, body, cipher.getAuthTag()]))
  }

  close(): void {
    this.ws.close()
    this.ended()
  }

  private ended(): void {
    if (this.closed) return
    this.closed = true
    this.emit('close')
  }

  /** The message in a frame; undefined for one forged, altered or replayed */
  private open(frame: Buffer): unknown {
    if (frame.length < 8 + 16) return undefined
    const counter = frame.readBigUInt64BE(0)
    if (counter <= this.received) return undefined
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.keys.receive,
        iv(counter)
      )
      decipher.setAuthTag(frame.subarray(frame.length - 16))
      const text = Buffer.concat([
        decipher.update(frame.subarray(8, frame.length - 16)),
        decipher.final(),
      ]).toString('utf8')
      this.received = counter
      return JSON.parse(text) as unknown
    } catch {
      return undefined
    }
  }
}

/** A message's IV: its number, which never repeats under one key */
function iv(counter: bigint): Buffer {
  const value = Buffer.alloc(12)
  value.writeBigUInt64BE(counter, 4)
  return value
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
}

/** The two directions' keys, from the shared key and both nonces */
function sessionKeys(
  key: Buffer,
  dialerNonce: string,
  listenerNonce: string
): { dialer: Buffer; listener: Buffer } {
  const bytes = Buffer.from(
    hkdfSync(
      'sha256',
      key,
      Buffer.concat([
        Buffer.from(dialerNonce, 'base64'),
        Buffer.from(listenerNonce, 'base64'),
      ]),
      'pacenote-macs session',
      64
    )
  )
  return { dialer: bytes.subarray(0, 32), listener: bytes.subarray(32) }
}

interface Frame {
  data: Buffer
  binary: boolean
}

/**
 * A socket's frames from the start: the handshake reads them one at a time,
 * and the channel takes over the rest, those that came in the same read as
 * the handshake's last one included.
 */
class Incoming {
  private readonly queue: Frame[] = []
  private waiter?: (frame: Frame | undefined) => void
  private handler?: (frame: Frame) => void
  private ended = false

  constructor(ws: WebSocket) {
    ws.on('message', (data, binary) =>
      this.push({ data: toBuffer(data), binary })
    )
    ws.on('close', () => {
      this.ended = true
      this.waiter?.(undefined)
    })
  }

  /** The next frame as a hello, within the handshake's time */
  next<T = HelloMessage>(timeoutMs: number): Promise<T> {
    const t = localized(text)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = undefined
        reject(new HandshakeError(t.noAnswer))
      }, timeoutMs)
      const take = (frame: Frame | undefined) => {
        clearTimeout(timer)
        if (!frame) return reject(new HandshakeError(t.closed))
        try {
          if (frame.binary) throw new Error('binary')
          resolve(JSON.parse(frame.data.toString('utf8')) as T)
        } catch {
          reject(new HandshakeError(t.unexpected))
        }
      }
      const queued = this.queue.shift()
      if (queued) take(queued)
      else if (this.ended) take(undefined)
      else this.waiter = take
    })
  }

  hand(handler: (frame: Frame) => void): void {
    this.handler = handler
    for (const frame of this.queue.splice(0)) handler(frame)
  }

  private push(frame: Frame): void {
    if (this.handler) return this.handler(frame)
    const waiter = this.waiter
    this.waiter = undefined
    if (waiter) waiter(frame)
    else this.queue.push(frame)
  }
}

/**
 * The Mac that dialed: says hello first, checks the answer, proves itself.
 * A device dials as one, with its own key and your Macs' group.
 */
export async function dial(
  ws: WebSocket,
  options: { key: Buffer; me: MacHello; group?: string; timeoutMs?: number }
): Promise<MacChannel> {
  const { key, me } = options
  const t = localized(text)
  const incoming = new Incoming(ws)
  const nonce = randomBytes(16).toString('base64')
  const answer = incoming.next(options.timeoutMs ?? HANDSHAKE_MS)
  const group = options.group ?? macsGroup(key)
  ws.send(helloOf(group, me, nonce))
  const hello = await closing(ws, answer)
  const dialer = { id: me.id, nonce }
  if (
    hello.t !== 'hello' ||
    hello.v !== PROTOCOL ||
    typeof hello.id !== 'string' ||
    typeof hello.nonce !== 'string' ||
    !hello.proof ||
    !same(hello.proof, proof(key, 'listener', dialer, hello))
  )
    throw refuse(ws, t.otherApp)
  if (hello.id === me.id) throw refuse(ws, t.thisMac)
  ws.send(helloOf(group, me, nonce, proof(key, 'dialer', dialer, hello)))
  const keys = sessionKeys(key, nonce, hello.nonce)
  return new MacChannel(
    ws,
    incoming,
    { send: keys.dialer, receive: keys.listener },
    { id: hello.id, name: String(hello.name ?? hello.id) },
    true
  )
}

/**
 * The Mac that listened: answers with its proof, then checks the dialer's.
 * A device proves itself with its own key (deviceKey): none for one you
 * removed.
 */
export async function accept(
  ws: WebSocket,
  options: {
    key: Buffer
    me: MacHello
    deviceKey?: (id: string) => Buffer | undefined
    timeoutMs?: number
  }
): Promise<MacChannel> {
  const { me } = options
  const timeoutMs = options.timeoutMs ?? HANDSHAKE_MS
  const t = localized(text)
  const incoming = new Incoming(ws)
  const hello = await closing(ws, incoming.next(timeoutMs))
  if (
    hello.t !== 'hello' ||
    hello.v !== PROTOCOL ||
    typeof hello.id !== 'string' ||
    typeof hello.nonce !== 'string'
  )
    throw refuse(ws, t.unexpected)
  const group = macsGroup(options.key)
  if (hello.group !== group) throw refuse(ws, t.otherApp)
  if (hello.id === me.id) throw refuse(ws, t.thisMac)
  const device = isDeviceKind(hello.device) ? hello.device : undefined
  const key = device ? options.deviceKey?.(hello.id) : options.key
  if (!key) throw refuse(ws, t.removed)
  const nonce = randomBytes(16).toString('base64')
  const listener = { id: me.id, nonce }
  const confirmed = incoming.next(timeoutMs)
  ws.send(helloOf(group, me, nonce, proof(key, 'listener', hello, listener)))
  const second = await closing(ws, confirmed)
  if (
    second.id !== hello.id ||
    second.nonce !== hello.nonce ||
    !second.proof ||
    !same(second.proof, proof(key, 'dialer', hello, listener))
  )
    throw refuse(ws, t.otherApp)
  const keys = sessionKeys(key, hello.nonce, nonce)
  return new MacChannel(
    ws,
    incoming,
    { send: keys.listener, receive: keys.dialer },
    {
      id: hello.id,
      name: String(hello.name ?? hello.id),
      ...(device && { device }),
    },
    false
  )
}

/**
 * Setting up a new Mac from one already set up (Settings > Macs > Add a Mac,
 * and Connect to your other Mac in the new Mac's setup or Settings). The new
 * Mac has no key yet, so the two cannot know each other by it: this once,
 * they agree on a key with X25519, and both show a 6-digit number made from
 * it. Someone in between on the network would agree on a key with each, and
 * the numbers would differ, so you compare them before you Allow. What follows
 * is sealed as on any channel.
 */

const SETUP_PROTOCOL = 1

interface SetupHello {
  t: 'setup'
  v: number
  id: string
  name: string
  /** X25519 public key, DER (SPKI), base64 */
  key: string
  nonce: string
  /** A device of yours asking, not a Mac */
  device?: DeviceKind
  /**
   * The Mac waiting gives a device a key of its own (Pacenote 0.6.14 and
   * later), not your Macs' key
   */
  devices?: 1
}

/** A setup channel, with the number both Macs show */
interface SetupOpened {
  channel: MacChannel
  code: string
}

/** This Mac's setup hello, and the private key behind it */
function setupHello(me: MacHello): {
  privateKey: KeyObject
  hello: SetupHello
} {
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  return {
    privateKey,
    hello: {
      t: 'setup',
      v: SETUP_PROTOCOL,
      id: me.id,
      name: me.name,
      key: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      nonce: randomBytes(16).toString('base64'),
      ...(me.device ? { device: me.device } : { devices: 1 }),
    },
  }
}

/** The number to compare and the two directions' keys */
function setupSecrets(
  privateKey: KeyObject,
  dialer: SetupHello,
  listener: SetupHello,
  peerKey: string
): { code: string; dialer: Buffer; listener: Buffer } {
  const shared = diffieHellman({
    privateKey,
    publicKey: createPublicKey({
      key: Buffer.from(peerKey, 'base64'),
      format: 'der',
      type: 'spki',
    }),
  })
  const bytes = Buffer.from(
    hkdfSync(
      'sha256',
      shared,
      Buffer.concat([
        Buffer.from(dialer.nonce, 'base64'),
        Buffer.from(listener.nonce, 'base64'),
      ]),
      ['pacenote-macs setup', dialer.key, listener.key].join('\n'),
      68
    )
  )
  return {
    code: String(bytes.readUInt32BE(64) % 1_000_000).padStart(6, '0'),
    dialer: bytes.subarray(0, 32),
    listener: bytes.subarray(32, 64),
  }
}

const isSetupHello = (value: Partial<SetupHello>): value is SetupHello =>
  value.t === 'setup' &&
  value.v === SETUP_PROTOCOL &&
  typeof value.id === 'string' &&
  typeof value.key === 'string' &&
  typeof value.nonce === 'string'

/** The new Mac: asks the one already set up */
export async function setupDial(
  ws: WebSocket,
  options: { me: MacHello; timeoutMs?: number }
): Promise<SetupOpened> {
  const incoming = new Incoming(ws)
  const { privateKey, hello } = setupHello(options.me)
  const answer = incoming.next<Partial<SetupHello>>(
    options.timeoutMs ?? HANDSHAKE_MS
  )
  ws.send(JSON.stringify(hello))
  const peer = await closing(ws, answer)
  if (!isSetupHello(peer)) throw refuse(ws, localized(text).notWaiting)
  const secrets = setupSecrets(privateKey, hello, peer, peer.key)
  return {
    code: secrets.code,
    channel: new MacChannel(
      ws,
      incoming,
      { send: secrets.dialer, receive: secrets.listener },
      { id: peer.id, name: String(peer.name ?? peer.id) },
      true
    ),
  }
}

/** The Mac already set up, while Add a Mac waits: answers the new one */
export async function setupAccept(
  ws: WebSocket,
  options: { me: MacHello; timeoutMs?: number }
): Promise<SetupOpened> {
  const incoming = new Incoming(ws)
  const peer = await closing(
    ws,
    incoming.next<Partial<SetupHello>>(options.timeoutMs ?? HANDSHAKE_MS)
  )
  if (!isSetupHello(peer)) throw refuse(ws, localized(text).unexpected)
  const { privateKey, hello } = setupHello(options.me)
  ws.send(JSON.stringify(hello))
  const secrets = setupSecrets(privateKey, peer, hello, peer.key)
  const device = isDeviceKind(peer.device) ? peer.device : undefined
  return {
    code: secrets.code,
    channel: new MacChannel(
      ws,
      incoming,
      { send: secrets.listener, receive: secrets.dialer },
      {
        id: peer.id,
        name: String(peer.name ?? peer.id),
        ...(device && { device }),
      },
      false
    ),
  }
}
