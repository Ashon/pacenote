import type { ClaimReason, PeerSeen } from './lease.js'
import { SILENT_MS, STARTUP_MS } from './timing.js'
import type { DeviceKind, Lease, MacState } from './types.js'

/** A channel to another Mac or a device, as this Mac last heard from it */
export interface LinkSeen {
  channel: { peer: { device?: DeviceKind } }
  /** What it last said of itself (a Mac's state) */
  state?: MacState
  heardAt: number
  /** Since when it has said its Slack connection is not open */
  closedSince?: number
  /** Where it was reached */
  address?: string
}

/** Heard from lately: not out of reach */
export const heardLately = (link: LinkSeen, now: number) =>
  now - link.heardAt < SILENT_MS

/**
 * The other Macs as lease.ts's rules see them: those you follow to that answer
 * through the same Slack app (sameApp)
 */
export function peersOf(input: {
  links: Iterable<LinkSeen>
  ignored: readonly string[]
  /** Who holds the lease, as this Mac knows it */
  holder: string | undefined
  sameApp: (state: MacState) => boolean
  now: number
  /** STALLED_MS, shorter in tests */
  stalledMs: number
}): PeerSeen[] {
  const { now } = input
  return [...input.links].flatMap((link) =>
    link.state &&
    !input.ignored.includes(link.state.id) &&
    input.sameApp(link.state)
      ? [
          {
            id: link.state.id,
            use: link.state.use,
            ready: link.state.ready,
            answering: link.state.answering,
            reachable: heardLately(link, now),
            // Holding the lease, it could not open its connection
            stalled:
              input.holder === link.state.id &&
              link.closedSince !== undefined &&
              now - link.closedSince >= input.stalledMs,
          },
        ]
      : []
  )
}

/**
 * Whether this Mac holds back a claim the rules make: just started, the Mac
 * that answered may not have been found yet; or it claimed a moment ago
 * (cooldownMs), and claims again only when you ask
 */
export function holdsBack(input: {
  reason: ClaimReason
  lease: Lease | undefined
  /** The Macs this one knows from before (macs.json) */
  known: Readonly<Record<string, unknown>>
  /** The Macs heard from since this one started */
  heardSinceStart: ReadonlySet<string>
  startedAt: number
  /** When this Mac last claimed the lease */
  claimedAt: number | undefined
  now: number
  /** CLAIM_COOLDOWN_MS, shorter in tests */
  cooldownMs: number
}): boolean {
  const { reason, lease, now } = input
  // Just started, the Mac that answered may not have been found yet
  const waiting =
    reason === 'holder-gone' &&
    lease !== undefined &&
    input.known[lease.holder] !== undefined &&
    !input.heardSinceStart.has(lease.holder) &&
    now - input.startedAt < STARTUP_MS
  const cooling =
    reason !== 'asked' &&
    input.claimedAt !== undefined &&
    now - input.claimedAt < input.cooldownMs
  return waiting || cooling
}

/** Why this Mac claimed the lease, as the log says it; from: the last holder */
export function claimWords(reason: ClaimReason, from?: string): string {
  return {
    none: 'no Mac answered',
    'holder-gone': `${from ?? 'the Mac that answered'} is out of reach`,
    'holder-asleep': `${from} went to sleep`,
    'holder-away': `${from} was left and this Mac is in use`,
    asked: 'you asked',
  }[reason]
}
