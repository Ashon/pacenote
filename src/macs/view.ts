import { heardLately, type LinkSeen } from './claims.js'
import type { MacsFile } from './store.js'
import {
  away,
  type AddingView,
  type DeviceRecord,
  type DeviceView,
  type MacState,
  type MacStatus,
  type MacsView,
  type MacUse,
  type MacView,
} from './types.js'

/** Pace on a Mac: running, whether its Slack connection is open, its AI */
export interface PaceSeen {
  ready: boolean
  answering: boolean
  reasoner?: string
}

/**
 * This Mac's status. Pace not following you, it answers here; else from who
 * holds the lease (here: whether this Mac's connection is open still)
 */
export function myStatus(input: {
  /** Pace follows the Mac you use: on, with your own Slack app */
  follows: boolean
  id: string
  holder: string | undefined
  here: boolean
  answering: boolean
}): MacStatus {
  if (!input.follows) return 'answering'
  const { holder } = input
  if (holder === undefined || holder === input.id)
    return input.answering ? 'answering' : 'moving'
  return input.here ? 'moving' : 'standing-by'
}

/** Another Mac's status, from what it last said and who holds the lease */
export function otherStatus(input: {
  id: string
  state: MacState | undefined
  reachable: boolean
  holder: string | undefined
}): MacStatus {
  const { state } = input
  if (!input.reachable || !state) return 'out-of-reach'
  if (input.holder === input.id) return state.answering ? 'answering' : 'moving'
  return state.answering ? 'moving' : 'standing-by'
}

/** Your devices, those linked to this Mac first, then the latest seen */
export function deviceViews(
  devices: Record<string, DeviceRecord>,
  links: ReadonlyMap<string, LinkSeen>,
  now: number
): DeviceView[] {
  return Object.entries(devices)
    .map(([id, record]) => {
      const link = links.get(id)
      const connected = Boolean(
        link?.channel.peer.device && heardLately(link, now)
      )
      return {
        id,
        ...record,
        connected,
        ...(link && { address: link.address }),
      }
    })
    .sort(
      (a, b) =>
        Number(b.connected) - Number(a.connected) ||
        (b.lastSeen ?? b.pairedAt).localeCompare(a.lastSeen ?? a.pairedAt)
    )
}

/** Settings > Devices, from what this Mac keeps and hears */
export function macsView(input: {
  now: number
  /** This Mac */
  me: {
    id: string
    name: string
    use: MacUse
    pace: PaceSeen
    status: MacStatus
  }
  file: MacsFile
  /** The channels open now, by the other Mac's or device's id */
  links: ReadonlyMap<string, LinkSeen>
  /** Your own Slack app is set up here (MacsView.paceFollows) */
  ownApp: boolean
  paired: boolean
  /** Pace follows the Mac you use (on, with your own Slack app) */
  follows: boolean
  blocked: boolean
  moved: MacsView['moved']
  adding: AddingView | undefined
}): MacsView {
  const { now, me, file, links } = input
  const lease = file.lease
  const here: MacView = {
    id: me.id,
    name: me.name,
    here: true,
    status: me.status,
    away: away(me.use),
    asleep: false,
    notReady: !me.pace.ready,
    reasoner: me.pace.reasoner,
  }
  const others: MacView[] = []
  const ids = new Set([
    ...Object.keys(file.known),
    ...[...links.values()].flatMap((link) =>
      link.state && !link.channel.peer.device ? [link.state.id] : []
    ),
  ])
  for (const id of ids) {
    if (id === me.id) continue
    const link = links.get(id)
    const state = link?.state
    const known = file.known[id]
    const reachable = Boolean(link && heardLately(link, now))
    others.push({
      id,
      name: state?.name ?? known?.name ?? id,
      here: false,
      status: otherStatus({ id, state, reachable, holder: lease?.holder }),
      away: state ? away(state.use) : false,
      asleep: state?.use.asleep ?? false,
      notReady: state ? !state.ready : false,
      lastSeen: known?.lastSeen,
      reasoner: state?.reasoner,
      address: link?.address ?? known?.address,
      ...(reachable && state?.collecting && { collecting: state.collecting }),
    })
  }
  const { adding } = input
  return {
    paceFollows: input.ownApp,
    paired: input.paired,
    follow: file.follow,
    macs: [here, ...others.filter((mac) => !file.ignored.includes(mac.id))],
    ...(input.follows && lease ? { holder: lease.holder } : {}),
    addresses: file.addresses,
    blocked: input.blocked,
    moved: input.moved,
    ...(adding && { adding }),
    devices: deviceViews(file.devices, links, now),
  }
}
