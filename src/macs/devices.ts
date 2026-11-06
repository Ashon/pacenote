import type { MacsFile } from './store.js'
import type { DeviceRecord } from './types.js'

/** Your devices and the ones you removed, as macs.json keeps them */
export type YourDevices = Pick<MacsFile, 'devices' | 'removed'>

/**
 * Your devices, as one Mac tells the others when it links to them and when
 * one is paired or removed. Pacenote before 0.6.14 leaves it alone.
 */
export interface DevicesMessage extends YourDevices {
  t: 'devices'
}

export function devicesMessage(kept: YourDevices): DevicesMessage {
  return { t: 'devices', devices: kept.devices, removed: kept.removed }
}

/**
 * What another Mac knows of your devices (heard), kept with this one's: a
 * device removed on any Mac is removed on all, the first removal kept.
 * undefined when it changes nothing here.
 */
export function mergeDevices(
  kept: YourDevices,
  heard: Partial<DevicesMessage>
): YourDevices | undefined {
  const removed = { ...kept.removed }
  for (const [id, at] of Object.entries(heard.removed ?? {}))
    if (typeof at === 'string' && (!removed[id] || at < removed[id]!))
      removed[id] = at
  const devices: Record<string, DeviceRecord> = {}
  for (const [id, record] of Object.entries({
    ...(heard.devices ?? {}),
    ...kept.devices,
  })) {
    if (removed[id]) continue
    const theirs = heard.devices?.[id]
    const mine = kept.devices[id]
    // The later sighting wins: the Mac it is linked to says it last
    const seen = (r?: DeviceRecord) => r?.lastSeen ?? r?.pairedAt ?? ''
    devices[id] =
      theirs && mine ? (seen(theirs) > seen(mine) ? theirs : mine) : record
  }
  if (
    JSON.stringify(devices) === JSON.stringify(kept.devices) &&
    JSON.stringify(removed) === JSON.stringify(kept.removed)
  )
    return undefined
  return { devices, removed }
}
