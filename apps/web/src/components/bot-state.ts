import type { BotStatusView, SupervisorState } from '@runtime/types'
import { localized } from '@src/i18n/locale'
import { text, type BotStateName } from './bot-state.text'

export type BotTone = 'ok' | 'busy' | 'warn' | 'error' | 'off'

export const TONE_CLASS: Record<
  BotTone,
  { text: string; dot: string; bg: string }
> = {
  ok: {
    text: 'text-status-succeeded',
    dot: 'bg-status-succeeded',
    bg: 'bg-status-succeeded/10 border-status-succeeded/25',
  },
  busy: {
    text: 'text-status-running',
    dot: 'bg-status-running',
    bg: 'bg-status-running/10 border-status-running/30',
  },
  warn: {
    text: 'text-status-interrupted',
    dot: 'bg-status-interrupted',
    bg: 'bg-status-interrupted/10 border-status-interrupted/30',
  },
  error: {
    text: 'text-status-failed',
    dot: 'bg-status-failed',
    bg: 'bg-status-failed/10 border-status-failed/30',
  },
  off: {
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground/50',
    bg: 'bg-muted border-border',
  },
}

/** Phases that say what Pace is doing on their own, without its status */
const DECISIVE = new Set(['building', 'stopping', 'setup', 'failed', 'crashed'])

/**
 * Whether Pace's state can be told yet: its status has come, or the app's
 * phase says it alone. Until then a label would only guess ("Stopped").
 */
export const botKnown = (
  view: BotStatusView | undefined,
  supervisor: SupervisorState | undefined
) =>
  view !== undefined ||
  DECISIVE.has(supervisor?.phase ?? '') ||
  Boolean(supervisor?.off)

/**
 * Combines the status file (bot.json) and the desktop supervisor state into a
 * one-line status.
 */
export function describeBot(
  view: BotStatusView | undefined,
  supervisor: SupervisorState | undefined
): { tone: BotTone; label: string } {
  const t = localized(text)
  const state = (tone: BotTone, name: BotStateName) => ({
    tone,
    label: t[name],
  })
  const phase = supervisor?.phase
  // Off on purpose (Todo alone): said as such, not as stopped
  if (supervisor?.off && phase === 'idle') return state('off', 'off')
  if (phase === 'building') return state('busy', 'building')
  if (phase === 'stopping') return state('busy', 'stopping')
  // Missing settings are something to do, not an error: amber, and named for
  // what is needed.
  if (phase === 'setup') return state('warn', 'setup')
  if (phase === 'failed') return state('error', 'failed')
  if (phase === 'crashed') return state('error', 'crashed')
  const status = view?.alive ? view.status : undefined
  if (!status) {
    return phase === 'starting'
      ? state('busy', 'starting')
      : state('off', 'stopped')
  }
  if (status.state === 'starting') return state('busy', 'starting')
  if (status.state === 'stopping') return state('busy', 'stopping')
  // Another of your Macs answers (Settings > Devices)
  if (status.standby) return state('off', 'standingBy')
  switch (status.socket.state) {
    case 'connected':
      return state('ok', 'connected')
    case 'connecting':
    case 'reconnecting':
      return state('warn', 'reconnecting')
    default:
      return state('error', 'disconnected')
  }
}
