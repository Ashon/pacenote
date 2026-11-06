import type { MacChannel } from './channel.js'
import { ADDING_MS } from './timing.js'
import type { AddingView, DeviceKind } from './types.js'

/** The setup channel to a new Mac or device, as far as Add a device goes */
export type SetupChannel = Pick<MacChannel, 'peer' | 'send' | 'close'>

/** A new Mac or device that asks to set up from this one */
export interface AddingRequest {
  name: string
  /** The number both show */
  code: string
  channel: SetupChannel
  device?: DeviceKind
}

/** One Add a device, from when it starts waiting until it ends */
export interface AddingRun {
  /** It waits until then (epoch ms) */
  until: number
  timer?: NodeJS.Timeout
  /** This Mac shown on your network for the new one's setup (Bonjour) */
  advert?: { stop(): void }
  request?: AddingRequest
  /** How it ended, said until you close it */
  result?: AddingView['result']
}

/**
 * Add a device, while it waits or until you close what it says: who asks, and
 * how it ended. Showing this Mac on your network, the setup channel and what
 * goes over it are the Macs class's (macs.ts).
 */
export class Adding {
  private run?: AddingRun

  /**
   * Waits for a new Mac or device for ADDING_MS from now, then calls expired;
   * advert is stopped once it no longer waits
   */
  start(options: {
    now: number
    expired: () => void
    advert?: { stop(): void }
  }): void {
    const timer = setTimeout(options.expired, ADDING_MS)
    timer.unref?.()
    this.run = { until: options.now + ADDING_MS, timer, advert: options.advert }
  }

  /** Waiting: a new Mac may connect, and nothing has ended it yet */
  get waiting(): boolean {
    return Boolean(this.run && !this.run.result)
  }

  /** Ended, and saying how until you close it */
  get ended(): boolean {
    return Boolean(this.run?.result)
  }

  /** Who asks now, while it waits */
  get request(): AddingRequest | undefined {
    return this.run?.result ? undefined : this.run?.request
  }

  /** The run a new Mac may ask in now: waiting, with no one asking yet */
  free(): AddingRun | undefined {
    const run = this.run
    return run && !run.result && !run.request ? run : undefined
  }

  /**
   * Someone asks in that run, once their setup channel opened; false when the
   * run ended or went away meanwhile, or another asked first
   */
  ask(run: AddingRun, request: AddingRequest): boolean {
    if (this.run !== run || run.request || run.result) return false
    run.request = request
    return true
  }

  /**
   * The one who asked in that run went away (its channel closed); false when
   * it was not the one asking, or the run had ended
   */
  left(run: AddingRun, channel: SetupChannel): boolean {
    if (run.request?.channel !== channel || run.result) return false
    run.request = undefined
    return true
  }

  /**
   * It ended: it stops showing this Mac, and says how. false when it was not
   * waiting.
   */
  end(
    kind: NonNullable<AddingView['result']>['kind'],
    name?: string,
    device?: DeviceKind
  ): boolean {
    const run = this.run
    if (!run || run.result) return false
    if (kind === 'expired') run.request?.channel.send({ t: 'setup-expired' })
    this.clear()
    this.run = {
      until: run.until,
      result: { kind, ...(name ? { name } : {}), ...(device && { device }) },
    }
    return true
  }

  /** It goes away: no longer shown or waited for, the one asking let go */
  clear(): void {
    const run = this.run
    if (!run) return
    run.advert?.stop()
    clearTimeout(run.timer)
    run.request?.channel.close()
    this.run = undefined
  }

  /** What Settings > Devices shows of it, while there is one */
  view(): AddingView | undefined {
    const run = this.run
    if (!run) return undefined
    return {
      until: new Date(run.until).toISOString(),
      ...(run.request && {
        request: {
          name: run.request.name,
          code: run.request.code,
          ...(run.request.device && { device: run.request.device }),
        },
      }),
      ...(run.result && { result: run.result }),
    }
  }
}
