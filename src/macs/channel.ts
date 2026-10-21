import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { RawData, WebSocket } from 'ws'

/**
 * The channel between two of your Macs, over a WebSocket on your network.
 *
 * Both Macs hold the same Slack app token, and that is what they know each
 * other by: a key derived from it (macsKey) proves each side to the other, and
 * nothing else gets in. A Mac set up with another Slack app (another
 * workspace, your company's Pace) has another key, and the two never pair.
 *
 * 1. The dialing Mac says hello: its group, id, name and a fresh nonce.
 * 2. The other answers with its own and a proof: an HMAC under the key of
 *    both nonces and both ids.
 * 3. The dialing Mac checks it and sends its own proof.
 * Then each direction has a key of its own, derived from the key and both
 * nonces, and every message is sealed with AES-256-GCM under it, numbered so
 * that none can be played again. The app token never crosses the network.
 */

const PROTOCOL = 1
const ALGORITHM = 'aes-256-gcm'
/** How long a Mac has to finish the handshake */
export const HANDSHAKE_MS = 5_000

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

/** Who a Mac is, as it says hello */
export interface MacHello {
  id: string
  name: string
}

interface HelloMessage {
  t: 'hello'
  v: number
  group: string
  id: string
  name: string
  nonce: string
  proof?: string
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

/** A handshake that did not go through, and why */
export class HandshakeError extends Error {}

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
    // Frames that came with the handshake's last one are handed over first.
    incoming.hand((frame) => {
      if (this.closed) return
      if (!frame.binary) return this.close()
      const message = this.open(frame.data)
      if (message === undefined) return this.close()
      this.emit('message', message)
    })
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
  next(timeoutMs: number): Promise<HelloMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = undefined
        reject(new HandshakeError('The other Mac did not answer in time.'))
      }, timeoutMs)
      const take = (frame: Frame | undefined) => {
        clearTimeout(timer)
        if (!frame)
          return reject(
            new HandshakeError('The other Mac closed the connection.')
          )
        try {
          if (frame.binary) throw new Error('binary')
          resolve(JSON.parse(frame.data.toString('utf8')) as HelloMessage)
        } catch {
          reject(new HandshakeError('The other Mac said something unexpected.'))
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

/** The Mac that dialed: says hello first, checks the answer, proves itself */
export async function dial(
  ws: WebSocket,
  options: { key: Buffer; me: MacHello; timeoutMs?: number }
): Promise<MacChannel> {
  const { key, me } = options
  const incoming = new Incoming(ws)
  const nonce = randomBytes(16).toString('base64')
  const answer = incoming.next(options.timeoutMs ?? HANDSHAKE_MS)
  ws.send(
    JSON.stringify({
      t: 'hello',
      v: PROTOCOL,
      group: macsGroup(key),
      id: me.id,
      name: me.name,
      nonce,
    } satisfies HelloMessage)
  )
  const hello = await answer.catch((err: unknown) => {
    ws.close()
    throw err
  })
  const dialer = { id: me.id, nonce }
  if (
    hello.t !== 'hello' ||
    hello.v !== PROTOCOL ||
    typeof hello.id !== 'string' ||
    typeof hello.nonce !== 'string' ||
    !hello.proof ||
    !same(hello.proof, proof(key, 'listener', dialer, hello))
  ) {
    ws.close()
    throw new HandshakeError('The other Mac runs Pace with another Slack app.')
  }
  if (hello.id === me.id) {
    ws.close()
    throw new HandshakeError('That is this Mac.')
  }
  ws.send(
    JSON.stringify({
      t: 'hello',
      v: PROTOCOL,
      group: macsGroup(key),
      id: me.id,
      name: me.name,
      nonce,
      proof: proof(key, 'dialer', dialer, hello),
    } satisfies HelloMessage)
  )
  const keys = sessionKeys(key, nonce, hello.nonce)
  return new MacChannel(
    ws,
    incoming,
    { send: keys.dialer, receive: keys.listener },
    { id: hello.id, name: String(hello.name ?? hello.id) },
    true
  )
}

/** The Mac that listened: answers with its proof, then checks the dialer's */
export async function accept(
  ws: WebSocket,
  options: { key: Buffer; me: MacHello; timeoutMs?: number }
): Promise<MacChannel> {
  const { key, me } = options
  const timeoutMs = options.timeoutMs ?? HANDSHAKE_MS
  const fail = (message: string) => {
    ws.close()
    return new HandshakeError(message)
  }
  const incoming = new Incoming(ws)
  const hello = await incoming.next(timeoutMs).catch((err: unknown) => {
    ws.close()
    throw err
  })
  if (
    hello.t !== 'hello' ||
    hello.v !== PROTOCOL ||
    typeof hello.id !== 'string' ||
    typeof hello.nonce !== 'string'
  )
    throw fail('The other Mac said something unexpected.')
  if (hello.group !== macsGroup(key))
    throw fail('The other Mac runs Pace with another Slack app.')
  if (hello.id === me.id) throw fail('That is this Mac.')
  const nonce = randomBytes(16).toString('base64')
  const listener = { id: me.id, nonce }
  const confirmed = incoming.next(timeoutMs)
  ws.send(
    JSON.stringify({
      t: 'hello',
      v: PROTOCOL,
      group: macsGroup(key),
      id: me.id,
      name: me.name,
      nonce,
      proof: proof(key, 'listener', hello, listener),
    } satisfies HelloMessage)
  )
  const second = await confirmed.catch((err: unknown) => {
    ws.close()
    throw err
  })
  if (
    second.id !== hello.id ||
    second.nonce !== hello.nonce ||
    !second.proof ||
    !same(second.proof, proof(key, 'dialer', hello, listener))
  )
    throw fail('The other Mac runs Pace with another Slack app.')
  const keys = sessionKeys(key, hello.nonce, nonce)
  return new MacChannel(
    ws,
    incoming,
    { send: keys.listener, receive: keys.dialer },
    { id: hello.id, name: String(hello.name ?? hello.id) },
    false
  )
}
