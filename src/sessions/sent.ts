/**
 * What you sent a session Pacenote runs, against its log. Pacenote shows what
 * you sent until its log has it; its tool tells it back as it reads it
 * (Claude Code's --replay-user-messages), but logs it first: on a session's
 * first turn by a second or more, while it starts. Pure, so it is tested
 * without a session.
 */

import type { SessionItem } from '../tasks/types.js'

/** How much of a message you sent Pacenote keeps while it waits */
export const QUEUED_CHARS = 4000

/** Logged this long before Pacenote says it sent it, still after: the clocks */
const SLACK_MS = 1000

/** What you sent, as Pacenote keeps it: cut to QUEUED_CHARS, and when */
export interface Sent {
  text: string
  /** When Pacenote sent it (ISO) */
  at: string
}

/**
 * The same words: its log keeps a turn whole (to the page's cap), what you
 * sent is kept cut, so a cut one is the start of the turn
 */
const sameWords = (sent: string, logged: string) => {
  const a = sent.trim()
  const b = logged.trim()
  return a === b || (sent.length >= QUEUED_CHARS && b.startsWith(a))
}

/**
 * What you sent that its log does not have yet, in order. A turn of yours in
 * it stands for one thing you sent before it with its words, the first sent
 * first, so the same words sent twice wait until both are in. A turn without
 * its time, or one sent at a time not known, can only be the last of yours.
 */
export function notLogged<T extends Sent>(
  sent: readonly T[],
  items: readonly SessionItem[] | undefined
): T[] {
  const yours = (items ?? []).filter((item) => item.role === 'user')
  const last = yours.at(-1)
  const taken = new Set<SessionItem>()
  return sent.filter((one) => {
    const at = Date.parse(one.at)
    const turn = yours.find(
      (item) =>
        !taken.has(item) &&
        sameWords(one.text, item.text) &&
        (item.at && !Number.isNaN(at)
          ? Date.parse(item.at) >= at - SLACK_MS
          : item === last)
    )
    if (!turn) return true
    taken.add(turn)
    return false
  })
}
