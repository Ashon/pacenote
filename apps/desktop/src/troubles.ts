import { setupSettingsRoute } from '../../../src/settings/fields.js'
import type { BotStatus, SupervisorState } from '../../../src/runtime/types.js'

/**
 * Something about Pace you would want to know with the window closed: that it
 * stopped, needs setup, lost Slack, or cannot answer. The app tells each one
 * once as a macOS notification, and the menu bar shows them while they last.
 */
export interface Trouble {
  /** The same trouble keeps its key while it lasts */
  key: string
  title: string
  body: string
  /** Where clicking the notification goes */
  route: string
}

/** How long Slack may be away before it counts as lost, not a blip */
export const SOCKET_LOST_MS = 2 * 60_000

/**
 * The troubles now. status is the running bot's, or undefined when none runs,
 * which leaves what only it can tell unknown (see unknownWithoutBot).
 */
export function currentTroubles(
  supervisor: SupervisorState | undefined,
  status: BotStatus | undefined,
  now = Date.now()
): Trouble[] {
  const troubles: Trouble[] = []
  const phase = supervisor?.phase
  // Stopped on its own, until it runs again: the starts in between are part
  // of the same trouble.
  if (
    phase === 'failed' ||
    phase === 'crashed' ||
    (phase === 'starting' && (supervisor?.restarts ?? 0) > 0)
  ) {
    troubles.push({
      key: 'exit',
      title: 'Pace stopped',
      body: [
        supervisor?.message,
        supervisor?.retryAt !== undefined && 'Pacenote starts it again.',
      ]
        .filter(Boolean)
        .join(' '),
      route: '#/bot',
    })
  }
  if (phase === 'setup') {
    troubles.push({
      key: 'setup',
      title: 'Pace needs setup',
      body: supervisor?.message ?? 'Some settings need fixing.',
      route: setupSettingsRoute(supervisor?.issues),
    })
  }
  if (!status) return troubles
  const since = Date.parse(status.socket.since)
  if (
    status.state === 'running' &&
    !status.standby &&
    status.socket.state !== 'connected' &&
    now - since >= SOCKET_LOST_MS
  ) {
    troubles.push({
      key: 'socket',
      title: 'Pace lost its connection to Slack',
      body: 'New mentions wait until it reconnects.',
      route: '#/bot',
    })
  }
  for (const problem of status.problems) {
    const text = problemText(problem)
    troubles.push({
      key: `problem:${text}`,
      title: 'Pace needs attention',
      body: text,
      route: '#/bot',
    })
  }
  return troubles
}

/**
 * A problem without when it was last seen ("(last at 14:20)"), which changes
 * while the problem stays the same
 */
function problemText(problem: string): string {
  return problem.replace(/\s*\((?:last at|checked at)[^)]*\)$/, '')
}

/** Troubles only a running bot can tell about, kept while none runs */
export function unknownWithoutBot(key: string): boolean {
  return key === 'socket' || key.startsWith('problem:')
}

/**
 * The troubles to tell about: the ones not told yet. said keeps what was told,
 * and forgets a trouble once it is gone, so it is told again if it comes back.
 * known says whether a trouble missing now is really gone.
 */
export function newTroubles(
  said: Set<string>,
  troubles: readonly Trouble[],
  known: (key: string) => boolean = () => true
): Trouble[] {
  const keys = new Set(troubles.map((trouble) => trouble.key))
  for (const key of said) if (!keys.has(key) && known(key)) said.delete(key)
  const fresh = troubles.filter((trouble) => !said.has(trouble.key))
  for (const trouble of fresh) said.add(trouble.key)
  return fresh
}
