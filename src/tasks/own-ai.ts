import { failureCause } from '../mention/failure.js'
import { REASONER_IDS, type ReasonerId } from '../reasoners/ids.js'

/**
 * Pacenote's own work on this Mac (Collect now, the looks done judge, Recap's
 * Write it up and reply drafts) and the CLIs that do it: what the desktop app
 * (apps/desktop/src/own-ai.ts) and its UI share. Has no Node APIs, so the UI
 * imports it too.
 */

export const OWN_CLIS = REASONER_IDS
export type OwnCli = ReasonerId

export const CLI_NAMES: Record<OwnCli, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

export const otherCli = (cli: OwnCli): OwnCli =>
  cli === 'claude' ? 'codex' : 'claude'

export const isOwnCli = (value: unknown): value is OwnCli =>
  value === 'claude' || value === 'codex'

/**
 * Why a CLI could not do the work, so the other one may: at its usage limit,
 * overloaded, signed out, not on this Mac, or without its Slack connector
 */
export type Unable = 'limit' | 'unavailable' | 'auth' | 'missing' | 'connector'

/** An attempt that could not run, with the error it gave */
export interface Refusal {
  unable: Unable
  error: string
}

/**
 * Whether an error means the CLI could not do the work at all. A timeout or a
 * run that went wrong part way is not: the other CLI would likely do the same.
 */
export function unableFrom(error: string): Unable | undefined {
  const cause = failureCause(error)
  if (cause === 'limit' || cause === 'unavailable' || cause === 'auth')
    return cause
  if (cause === 'setup') return 'missing'
  return undefined
}

const MINUTE = 60_000
const UNITS: Record<string, number> = {
  s: 1000,
  m: MINUTE,
  h: 60 * MINUTE,
  d: 24 * 60 * MINUTE,
}

/**
 * When a limit resets, from the CLI's error: Claude Code's
 * "limit reached|<epoch>", "try again in 3 hours", "resets 3pm" or "Try again
 * at 3:05 PM" (the next such time)
 */
export function resetFrom(error: string, now: Date): Date | undefined {
  const epoch = /limit reached\|(\d{10})\b/i.exec(error)
  if (epoch) return new Date(Number(epoch[1]) * 1000)
  const after =
    /\b(?:try again|resets?) in (\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?|h|hours?|d|days?)\b/i.exec(
      error
    )
  if (after)
    return new Date(
      now.getTime() + Number(after[1]) * UNITS[after[2]![0]!.toLowerCase()]!
    )
  const clock =
    /\b(?:resets?|try again)(?: at)? (\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/i.exec(
      error
    )
  if (clock) {
    const hour = (Number(clock[1]) % 12) + (/p/i.test(clock[3]!) ? 12 : 0)
    const at = new Date(now)
    at.setHours(hour, Number(clock[2] ?? 0), 0, 0)
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
    return at
  }
  return undefined
}

/** What a CLI last did for Pacenote's own work */
export interface CliState {
  at: string
  /** Why it could not, the last time; none when it did */
  unable?: Unable
  /** Until when it rests (at its limit or overloaded) */
  until?: string
}

export type OwnAiState = Partial<Record<OwnCli, CliState>>

/**
 * The CLIs a piece of work goes to, in order: the chosen one, then the other
 * when it may take over; a resting chosen one goes last, so work goes to one
 * that can do it
 */
export function cliOrder(
  chosen: OwnCli,
  fallback: boolean,
  state: OwnAiState
): OwnCli[] {
  if (!fallback) return [chosen]
  const other = otherCli(chosen)
  return state[chosen]?.until && !state[other]?.until
    ? [other, chosen]
    : [chosen, other]
}

/** A switch to the other CLI: from which, why, and until when it rests */
export interface Switch {
  from: OwnCli
  unable: Unable
  until?: string
}

/** Why a CLI could not, as a line reads it: "at its usage limit" */
export const UNABLE_WORDS: Record<Unable, string> = {
  limit: 'at its usage limit',
  unavailable: 'overloaded',
  auth: 'signed out',
  missing: 'not on this Mac',
  connector: 'without its Slack connector',
}

/**
 * A switch as a line reads it: "Claude Code was at its usage limit". With
 * until, the time it rests to goes after it in the UI.
 */
export const switchWords = (switched: Switch): string =>
  `${CLI_NAMES[switched.from]} was ${UNABLE_WORDS[switched.unable]}`

/** A CLI on this Mac, as Settings shows it */
export interface CliReadiness {
  installed: boolean
  signedIn: boolean
  /** codex older than the version Pacenote needs */
  tooOld?: boolean
}

/** The CLI chosen, whether the other one takes over, what each last did */
export interface OwnAiNow {
  chosen: OwnCli
  fallback: boolean
  state: OwnAiState
}

/**
 * Pacenote's own work as Settings > Todo shows it: OwnAiNow, with each CLI on
 * this Mac
 */
export interface OwnAiView extends OwnAiNow {
  clis: Record<OwnCli, CliReadiness>
}

/** The part of a CLI's check Settings shows */
export const cliReadiness = (check: {
  installed: boolean
  signedIn: boolean
  tooOld?: boolean
}): CliReadiness => ({
  installed: check.installed,
  signedIn: check.signedIn,
  ...(check.tooOld ? { tooOld: true } : {}),
})
