import { isIPv4, isIPv6 } from 'node:net'
import { networkInterfaces } from 'node:os'

/**
 * Whether an address is on a network of your own: this Mac, a home or office
 * network (10/8, 172.16/12, 192.168/16, link-local), or a private network
 * such as Tailscale (100.64/10, fd00::/8). The channel between your Macs takes
 * connections only from these, so nothing reaches it from the internet.
 */
export function privateAddress(address: string | undefined): boolean {
  if (!address) return false
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  const ip = mapped ? mapped[1]! : address
  if (isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }
  if (isIPv6(ip)) {
    const lower = ip.toLowerCase()
    return (
      lower === '::1' ||
      /^f[cd][0-9a-f]{2}:/.test(lower) ||
      /^fe[89ab][0-9a-f]:/.test(lower)
    )
  }
  return false
}

/** The port Pacenote listens on for your other Macs, unless it is taken */
export const MACS_PORT = 49213

/**
 * An address added by hand as host and port: "macbook-air.local",
 * "100.68.0.12:49213" or "[fd7a::1]:49213"
 */
export function hostPort(
  address: string
): { host: string; port: number } | undefined {
  const text = address.trim()
  if (!text || /\s/.test(text)) return undefined
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(text)
  if (bracketed)
    return { host: bracketed[1]!, port: Number(bracketed[2] ?? MACS_PORT) }
  if (isIPv6(text)) return { host: text, port: MACS_PORT }
  const colon = text.lastIndexOf(':')
  if (colon < 0) return { host: text, port: MACS_PORT }
  const port = Number(text.slice(colon + 1))
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return undefined
  return { host: text.slice(0, colon), port }
}

/**
 * This Mac's addresses on your Tailscale network, as host:port for the port
 * it listens on (MacState.reach): what a device paired with it dials when it
 * is away from your network. Tailscale's tunnel (utun on macOS) holds them,
 * in its ranges: 100.64.0.0/10 and fd7a:115c:a1e0::/48. None without
 * Tailscale.
 */
export function tailnetAddresses(
  port: number,
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()
): string[] {
  const found: string[] = []
  for (const [name, entries] of Object.entries(interfaces)) {
    if (!/^(utun|tailscale)/.test(name)) continue
    for (const { address, family, internal } of entries ?? []) {
      if (internal) continue
      const [a, b] = address.split('.').map(Number) as [number, number]
      if (family === 'IPv4' && a === 100 && b >= 64 && b <= 127)
        found.push(`${address}:${port}`)
      else if (family === 'IPv6' && /^fd7a:115c:a1e0:/i.test(address))
        found.push(`[${address}]:${port}`)
    }
  }
  return found
}
