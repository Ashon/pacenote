import { isIP } from 'node:net'
import { privateAddress } from '../macs/network.js'

/** Names that exist only on a local network: mDNS, and those set aside */
const LOCAL_NAME = /\.(local|internal|lan|home\.arpa)$/i

/**
 * A team hub's address: https, or http on a network of your own, where a hub
 * often has no certificate a Mac trusts: localhost, a private address
 * (10.0.0.5, 192.168.1.20, Tailscale's 100.64/10), or a name that exists only
 * there (hub.local, hub.internal, a name without a dot). There the hub token
 * and the threads cross the network unencrypted. A public name needs https,
 * which Caddy or a tunnel gets a certificate for by itself.
 */
export function isHubUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  if (url.protocol !== 'http:') return false
  // [fd7a::1] in a URL is the address fd7a::1
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1')
  if (isIP(host)) return privateAddress(host)
  return !host.includes('.') || LOCAL_NAME.test(host)
}
