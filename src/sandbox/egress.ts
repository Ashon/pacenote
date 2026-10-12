import { chmodSync, mkdirSync, rmSync } from 'node:fs'
import { lookup } from 'node:dns/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import type { Logger } from '../logger.js'
import { normalizeDomain } from './allowlist.js'

/** The only port CONNECT goes to, as with the Docker sandbox's proxy */
const TLS_PORT = 443
/** Headers that belong to one hop, not to the request passed on */
const HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]
/** Connections at once, across every VM */
const MAX_CONNECTIONS = 256
/** A tunnel or request with nothing passing for this long is closed. */
const IDLE_MS = 10 * 60_000

/**
 * Addresses no allowed name may lead to: this Mac itself (loopback), the
 * link-local range (where cloud metadata services answer), "any" and
 * multicast. The proxy runs on this Mac, so a name resolving to 127.0.0.1
 * would reach this Mac's own services. Private ranges stay reachable: an
 * internal service is allowed by its name.
 */
const LOCAL = new net.BlockList()
LOCAL.addSubnet('0.0.0.0', 8, 'ipv4')
LOCAL.addSubnet('127.0.0.0', 8, 'ipv4')
LOCAL.addSubnet('169.254.0.0', 16, 'ipv4')
LOCAL.addSubnet('224.0.0.0', 3, 'ipv4')
LOCAL.addAddress('::', 'ipv6')
LOCAL.addAddress('::1', 'ipv6')
LOCAL.addSubnet('fe80::', 10, 'ipv6')
LOCAL.addSubnet('ff00::', 8, 'ipv6')

/** Whether an address is one no allowed name may lead to (LOCAL) */
export function isLocalAddress(address: string): boolean {
  // An IPv4 address written as IPv6 (::ffff:127.0.0.1) is the IPv4 one.
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1]
  if (v4) return LOCAL.check(v4, 'ipv4')
  const family = net.isIP(address)
  if (family === 0) return true
  return LOCAL.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

/** The addresses a name resolves to */
export type Resolve = (host: string) => Promise<string[]>

const resolveAll: Resolve = async (host) =>
  (await lookup(host, { all: true })).map((entry) => entry.address)

/**
 * The way out of the built-in VM sandbox: an HTTP proxy on a unix socket,
 * which pacenote-vm relays into each VM (the image forwards 127.0.0.1:3128 to
 * it). Like the Docker sandbox's egress proxy (sandbox/proxy), it lets through
 * only the allowed host names, exactly: HTTPS through CONNECT to port 443, and
 * plain HTTP requests. It looks each name up itself and connects to the
 * address it found, so the answer cannot change in between, and never to
 * this Mac's own addresses (LOCAL).
 */
export class EgressProxy {
  private readonly server: http.Server
  private readonly sockets = new Set<net.Socket>()

  constructor(
    private readonly options: {
      /** Where it listens */
      socket: string
      /** The host names it lets through, asked again for every connection */
      allowed: () => Iterable<string>
      /**
       * Where a connection may go, by host (a name or an address) and port, in
       * place of the allowed names on 443: the broker's VM goes where its
       * settings name (vm-broker.ts)
       */
      permit?: (host: string, port: number) => boolean
      /** How names are looked up (tests point them at local servers) */
      resolve?: Resolve
      log?: Logger
    }
  ) {
    this.server = http.createServer(
      { headersTimeout: 30_000 },
      (req, res) => void this.forward(req, res)
    )
    this.server.maxConnections = MAX_CONNECTIONS
    this.server.on('connect', (req, client: net.Socket, head) => {
      void this.tunnel(req, client, head)
    })
    this.server.on('connection', (socket) => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
    })
  }

  get socket(): string {
    return this.options.socket
  }

  /** Listens on the socket, replacing one a past run left behind */
  async listen(): Promise<void> {
    // macOS cuts longer socket paths short, and then nothing connects.
    if (Buffer.byteLength(this.options.socket) > 103)
      throw new Error(
        `The egress socket path is too long for a unix socket: ${this.options.socket}`
      )
    mkdirSync(path.dirname(this.options.socket), { recursive: true })
    rmSync(this.options.socket, { force: true })
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.options.socket, () => {
        this.server.off('error', reject)
        resolve()
      })
    })
    // Only this account's processes, pacenote-vm among them, reach it.
    chmodSync(this.options.socket, 0o600)
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
    rmSync(this.options.socket, { force: true })
  }

  /** Whether a connection may go to the host and port */
  private permits(host: string, port: number, tunnel: boolean): boolean {
    const bare = host.replace(/^\[|\]$/g, '').toLowerCase()
    if (this.options.permit) return this.options.permit(bare, port)
    return (!tunnel || port === TLS_PORT) && this.allows(bare)
  }

  /** Whether the host is on the list (exact names, never an address) */
  allows(host: string): boolean {
    const name = normalizeDomain(host.replace(/^\[|\]$/g, ''))
    if (net.isIP(name)) return false
    for (const allowed of this.options.allowed())
      if (normalizeDomain(allowed) === name) return true
    return false
  }

  /**
   * Where an allowed name may be reached: the first address it resolves to
   * that is not this Mac's own, IPv4 first. Undefined, with the reason logged,
   * when there is none.
   */
  private async address(host: string, what: string) {
    let addresses: string[]
    try {
      const bare = host.replace(/^\[|\]$/g, '')
      addresses = net.isIP(bare)
        ? [bare]
        : await (this.options.resolve ?? resolveAll)(host)
    } catch (err) {
      this.refuse(what, `lookup failed: ${(err as Error).message}`)
      return undefined
    }
    const usable = addresses
      .filter((address) => !isLocalAddress(address))
      .sort((a, b) => net.isIP(a) - net.isIP(b))
    if (usable.length === 0)
      this.refuse(
        what,
        addresses.length
          ? 'it leads to this Mac or a local address'
          : 'no address'
      )
    return usable[0]
  }

  private refuse(what: string, why: string): void {
    this.options.log?.info(`Egress refused: ${what} (${why})`)
  }

  private async tunnel(
    req: http.IncomingMessage,
    client: net.Socket,
    head: Buffer
  ) {
    const target = /^([^:]+|\[[^\]]+\]):(\d+)$/.exec(req.url ?? '')
    const host = target?.[1] ?? ''
    const port = Number(target?.[2])
    client.on('error', () => undefined)
    const forbid = () =>
      client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n')
    if (!target || !this.permits(host, port, true)) {
      this.refuse(
        req.url ?? '?',
        target && port !== TLS_PORT && !this.options.permit
          ? 'only port 443'
          : 'not allowed'
      )
      forbid()
      return
    }
    const address = await this.address(host, req.url ?? host)
    if (!address) {
      forbid()
      return
    }
    const upstream = net.connect({ host: address, port })
    upstream.setTimeout(IDLE_MS, () => upstream.destroy())
    client.setTimeout(IDLE_MS, () => client.destroy())
    upstream.on('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('error', (err) => {
      this.options.log?.warn(`Egress to ${host} failed: ${err.message}`)
      if (client.writable && !upstream.readableEnded)
        client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n')
    })
    client.on('close', () => upstream.destroy())
    upstream.on('close', () => client.destroy())
  }

  private async forward(req: http.IncomingMessage, res: http.ServerResponse) {
    const forbid = () => res.writeHead(403, { 'Content-Length': '0' }).end()
    let url: URL | undefined
    try {
      url = new URL(req.url ?? '')
    } catch {
      // A request for the proxy itself, not one to pass on
    }
    if (
      !url ||
      url.protocol !== 'http:' ||
      !this.permits(url.hostname, Number(url.port || 80), false)
    ) {
      this.refuse(req.url ?? '?', 'not allowed')
      forbid()
      return
    }
    const address = await this.address(url.hostname, req.url ?? url.hostname)
    if (!address) {
      forbid()
      return
    }
    const headers = { ...req.headers }
    for (const name of HOP_HEADERS) delete headers[name]
    // The Host header still names the host; only the connection goes to the
    // address looked up.
    const upstream = http.request(
      {
        host: address,
        port: url.port || 80,
        method: req.method,
        path: `${url.pathname}${url.search}`,
        headers,
        timeout: IDLE_MS,
      },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers)
        reply.pipe(res)
      }
    )
    upstream.on('timeout', () => upstream.destroy(new Error('timed out')))
    upstream.on('error', (err) => {
      this.options.log?.warn(`Egress to ${url.hostname} failed: ${err.message}`)
      if (!res.headersSent) res.writeHead(502, { 'Content-Length': '0' })
      res.end()
    })
    req.pipe(upstream)
  }
}
