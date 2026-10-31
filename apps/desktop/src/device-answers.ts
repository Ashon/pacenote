import type { HistoryReader } from '../../../src/history/reader.js'
import { apiForDevice } from '../../../src/local-api.js'
import {
  API_ASK,
  DEVICE_ASKS,
  argsFromDevice,
  valueForDevice,
  type DeviceAsk,
} from '../../../src/macs/asks.js'

/**
 * What your devices ask this Mac, answered as its own screen answers: each
 * screen's bridge channel holds the function the window calls, and a device
 * of yours is answered by that same one (asks.ts says what goes either way).
 * main.ts registers the channels as it wires the window's IPC (bridge) and
 * hands answer to DeviceAsks, which keeps the Macs' channel.
 */
export class DeviceAnswers {
  /** The screens' bridge, by channel */
  private readonly bridged = new Map<string, (...args: unknown[]) => unknown>()

  constructor(
    private readonly options: {
      /** The read-only /api the screens fetch, answered for a device */
      reader: HistoryReader
      /** The name the device goes by, as Your devices has it (logs) */
      peerName: (peer: string) => string
      log: (message: string) => void
    }
  ) {}

  /** A bridge channel the window calls too (registerBotIpc, recap:write) */
  bridge(channel: string, run: (...args: unknown[]) => unknown): void {
    this.bridged.set(channel, run)
  }

  /** A device's ask, answered as this Mac's own screen is */
  async answer(
    what: DeviceAsk,
    args: unknown[],
    peer: string
  ): Promise<unknown> {
    const { reader, peerName, log } = this.options
    if (what === API_ASK) return apiForDevice(reader, args[0])
    const run = this.bridged.get(DEVICE_ASKS[what])
    if (!run) throw new Error(`${what} is not answered on this Mac`)
    const taken = argsFromDevice(what, args)
    if (what === 'settings.save')
      log(
        `Settings changed from ${peerName(peer)}: ${Object.keys(
          (taken[0] ?? {}) as object
        ).join(', ')}`
      )
    else if (!/\.(get|state|now|status|validate)$/.test(what))
      log(`${peerName(peer)} asked: ${what}`)
    return valueForDevice(what, await run(...taken))
  }
}
