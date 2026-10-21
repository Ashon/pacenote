import { away, inUse, type Lease, type MacUse } from './types.js'

/**
 * Which of your Macs answers, decided on each Mac from what it hears from the
 * others. No Mac decides for another: each claims the lease when the rules
 * say so, and all settle on the latest claim (laterLease).
 *
 * The rules, for a Mac that runs Pace and does not hold the lease:
 * - No other Mac holds it, or the one that does is out of reach, no longer
 *   runs Pace, or cannot open its Slack connection: claim, so that some Mac
 *   answers.
 * - The Mac that holds it is going to sleep: claim.
 * - It is away (locked, or 5 minutes without input) while you use this one:
 *   claim. Pace follows you from one Mac to the other.
 * - Otherwise stand by. Using both side by side keeps Pace where it is.
 * "Answer here" claims at once.
 */

/** Why a Mac claims the lease */
export type ClaimReason =
  'none' | 'holder-gone' | 'holder-asleep' | 'holder-away' | 'asked'

/** Another Mac, as this one last heard of it */
export interface PeerSeen {
  id: string
  use: MacUse
  ready: boolean
  answering: boolean
  /** Heard from lately, over an open channel */
  reachable: boolean
  /** Holds the lease, but has not opened its Slack connection for a while */
  stalled?: boolean
}

export function claimReason(input: {
  me: { id: string; use: MacUse; ready: boolean }
  lease: Lease | undefined
  peers: readonly PeerSeen[]
}): ClaimReason | undefined {
  const { me, lease, peers } = input
  if (!me.ready || lease?.holder === me.id) return undefined
  if (!lease) return 'none'
  const holder = peers.find((peer) => peer.id === lease.holder)
  if (!holder?.reachable || !holder.ready || holder.stalled)
    return 'holder-gone'
  if (holder.use.asleep) return 'holder-asleep'
  if (away(holder.use) && inUse(me.use)) return 'holder-away'
  return undefined
}

/** The lease a claim makes: this Mac's, one term past the latest */
export function claim(id: string, lease: Lease | undefined, at: number): Lease {
  return { holder: id, term: (lease?.term ?? 0) + 1, at }
}

/**
 * How long a Mac that lost the lease keeps its Slack connection open while the
 * next one connects: a handover opens the new connection before it closes the
 * old one, so no mention falls between them
 */
export const HANDOVER_MS = 20_000

/**
 * Whether this Mac's Slack connection should be open: it holds the lease, or
 * it held it a moment ago and the Mac that holds it now has not connected yet
 */
export function shouldAnswer(input: {
  me: { id: string }
  lease: Lease | undefined
  peers: readonly PeerSeen[]
  /** When this Mac last held the lease (epoch ms), if it did */
  heldUntil?: number
  now: number
}): boolean {
  const { me, lease, peers } = input
  if (!lease || lease.holder === me.id) return true
  const holder = peers.find((peer) => peer.id === lease.holder)
  if (holder?.answering) return false
  return (
    input.heldUntil !== undefined && input.now - input.heldUntil < HANDOVER_MS
  )
}
