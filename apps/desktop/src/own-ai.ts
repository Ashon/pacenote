import path from 'node:path'
import {
  cliOrder,
  OWN_CLIS,
  resetFrom,
  type CliState,
  type OwnAiNow,
  type OwnAiState,
  type OwnCli,
  type Refusal,
  type Switch,
} from '../../../src/tasks/own-ai.js'
import { readJson, writeJson } from '../../../src/tasks/store.js'

/**
 * Pacenote's own work on this Mac: Collect now, the looks done judge, Recap's
 * Write it up and reply drafts. It runs on the CLI chosen in Settings > Todo
 * and, when that one cannot (at its usage limit, overloaded, signed out, not
 * on this Mac, or without its Slack connector), on the other one. A CLI at its
 * limit rests until the limit resets, so the next piece of work goes to the
 * other one first. What each CLI last did is kept (own-ai.json) for Settings
 * and Todo to show.
 */

/** How a piece of work went: its result, which CLI gave it, and any switch */
export interface Ran<R> {
  result: R
  by: OwnCli
  switched?: Switch
}

const FILE = 'own-ai.json'
const MINUTE = 60_000
/** How long a CLI rests at its limit when its error does not say */
const LIMIT_REST_MS = 60 * MINUTE
/** and when it is overloaded */
const UNAVAILABLE_REST_MS = 10 * MINUTE
/** A weekly limit is the longest there is */
const MAX_REST_MS = 7 * 24 * 60 * MINUTE

export class OwnAi {
  constructor(
    private readonly options: {
      /** Where what each CLI last did is kept; in memory without one */
      dataDir?: string
      /** The CLI chosen in Settings > Todo */
      chosen: () => OwnCli
      /** Whether the other one may do the work when the chosen one cannot */
      fallback: () => boolean
      /** Called when what a CLI last did changes */
      onChange?: () => void
      now?: () => Date
    }
  ) {}

  private memory: OwnAiState = {}

  /** The CLI chosen in Settings > Todo */
  chosen(): OwnCli {
    return this.options.chosen()
  }

  /** Whether the other one takes over when the chosen one cannot */
  fallback(): boolean {
    return this.options.fallback()
  }

  /** The CLI chosen, whether the other one takes over, what each last did */
  now(): OwnAiNow {
    return {
      chosen: this.chosen(),
      fallback: this.fallback(),
      state: this.state(),
    }
  }

  /**
   * What each CLI last did. A rest that ended is dropped with its reason: the
   * CLI may well work again.
   */
  state(): OwnAiState {
    const now = this.clock().getTime()
    const kept = this.read()
    const state: OwnAiState = {}
    for (const cli of OWN_CLIS) {
      const entry = kept[cli]
      if (!entry) continue
      state[cli] =
        entry.until && Date.parse(entry.until) <= now ? { at: entry.at } : entry
    }
    return state
  }

  /** Until when a CLI rests; undefined when it does not */
  restingUntil(cli: OwnCli): string | undefined {
    return this.state()[cli]?.until
  }

  /**
   * Runs one piece of work: on the chosen CLI, or first on the other while the
   * chosen one rests, then on the other one when the first could not. With
   * background, work that only one would try while it rests is not started
   * (the looks done judge waits for the reset instead).
   */
  async run<R>(
    attempt: (cli: OwnCli, switched?: Switch) => Promise<R>,
    refusal: (result: R) => Refusal | undefined,
    options: { background?: boolean } = {}
  ): Promise<Ran<R> | { resting: string }> {
    const chosen = this.options.chosen()
    const state = this.state()
    const order = cliOrder(chosen, this.options.fallback(), state)
    if (options.background && order.every((cli) => state[cli]?.until))
      return {
        resting: order
          .map((cli) => state[cli]!.until!)
          .sort()
          .at(0)!,
      }
    let switched: Switch | undefined =
      order[0] !== chosen
        ? {
            from: chosen,
            unable: state[chosen]!.unable ?? 'limit',
            until: state[chosen]!.until,
          }
        : undefined
    let ran: Ran<R> | undefined
    for (const cli of order) {
      const result = await attempt(cli, switched)
      ran = { result, by: cli, ...(switched ? { switched } : {}) }
      const refused = refusal(result)
      const until = this.keep(cli, refused)
      if (!refused) return ran
      switched = { from: cli, unable: refused.unable, until }
    }
    return ran!
  }

  /** Keeps how a CLI's attempt went, and returns until when it rests */
  private keep(cli: OwnCli, refused: Refusal | undefined): string | undefined {
    const now = this.clock()
    let until: string | undefined
    if (refused?.unable === 'limit' || refused?.unable === 'unavailable') {
      const reset =
        refused.unable === 'limit'
          ? resetFrom(refused.error, now)?.getTime()
          : undefined
      const rest =
        reset && reset > now.getTime()
          ? Math.min(reset - now.getTime(), MAX_REST_MS)
          : refused.unable === 'limit'
            ? LIMIT_REST_MS
            : UNAVAILABLE_REST_MS
      until = new Date(now.getTime() + rest).toISOString()
    }
    const entry: CliState = {
      at: now.toISOString(),
      ...(refused ? { unable: refused.unable } : {}),
      ...(until ? { until } : {}),
    }
    const next = { ...this.read(), [cli]: entry }
    if (this.options.dataDir)
      try {
        writeJson(path.join(this.options.dataDir, FILE), next)
      } catch {
        // What a CLI last did is only shown; work goes on without it.
      }
    else this.memory = next
    this.options.onChange?.()
    return until
  }

  private read(): OwnAiState {
    return this.options.dataDir
      ? readJson<OwnAiState>(path.join(this.options.dataDir, FILE), {})
      : this.memory
  }

  private clock(): Date {
    return this.options.now?.() ?? new Date()
  }
}

/**
 * Whether a piece of work's result says its CLI could not do it at all: an
 * error with unable (judge, recap, draft)
 */
export const refusalOf = (result: object): Refusal | undefined =>
  'error' in result &&
  'unable' in result &&
  typeof result.error === 'string' &&
  typeof result.unable === 'string'
    ? { unable: result.unable as Refusal['unable'], error: result.error }
    : undefined
