/**
 * How long your Macs wait for each other, and how often they look again
 * (macs.ts). Tests shorten some of them through Macs' options.
 */

/** How often this Mac looks again by itself (tests shorten it: tickMs) */
export const TICK_MS = 2_000
/** How often this Mac tells the others its state, changed or not */
export const HEARTBEAT_MS = 5_000
/** A Mac not heard from for this long is out of reach */
export const SILENT_MS = 15_000
/** How often to dial the Macs found or added that no channel is open to */
export const DIAL_MS = 10_000
/** How long a dial waits for the other Mac's socket to open */
export const HANDSHAKE_MS = 5_000
/**
 * A Mac that holds the lease but has not opened its Slack connection for this
 * long is passed over, so some Mac answers
 */
export const STALLED_MS = 60_000
/**
 * A Mac that just claimed the lease waits this long before it claims again
 * by itself (Answer here aside), so two Macs whose rules disagree for a moment
 * never take it back and forth
 */
export const CLAIM_COOLDOWN_MS = 15_000
/**
 * Unreachable this long, as macOS answers while Local Network access is off,
 * before Settings > Devices says so: the first time, macOS is still asking
 */
export const BLOCKED_MS = 30_000
/** How often to dial again while the network turns this Mac away */
export const REDIAL_MS = 2_000
/** How long after the network first turned it away this Mac dials that often */
export const REDIAL_FOR_MS = 60_000
/**
 * Just started, how long this Mac waits to hear from the one that answered
 * before taking over from it
 */
export const STARTUP_MS = 15_000
/** How long Add a device waits for the new Mac */
export const ADDING_MS = 10 * 60_000
/** Setup just finished: how long the new Mac waits to hear the others */
export const CLAIM_WAIT_MS = 30_000
/** How often a Mac or device heard from is written to macs.json, unchanged */
export const SEEN_SAVE_MS = 60_000

/**
 * How often to dial now: REDIAL_MS for a while after the network turned this
 * Mac away (since unreachableSince), DIAL_MS otherwise
 */
export function dialEvery(
  unreachableSince: number | undefined,
  now: number
): number {
  return unreachableSince !== undefined &&
    now - unreachableSince < REDIAL_FOR_MS
    ? REDIAL_MS
    : DIAL_MS
}
