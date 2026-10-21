import { isIPv4, isIPv6 } from 'node:net'

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
