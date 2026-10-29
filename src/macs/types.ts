/**
 * Your Macs: Pacenote on each Mac you pair (Add a device), or set up with the
 * same Slack app, finds the others on your network by itself; Todo is the same
 * on each, and Pace answers on the one you're using (docs/macs.md). What the
 * desktop app (apps/desktop/src/macs.ts) and its screens share. Has no Node
 * APIs, so the UI imports it too.
 */

/**
 * Which Mac answers: the one that claimed it last. A claim raises the term, so
 * the Macs settle on the later lease whatever order they hear of claims in.
 */
export interface Lease {
  /** The answering Mac's id */
  holder: string
  term: number
  /** When it was claimed (epoch ms) */
  at: number
}

/** How a Mac is used now, from its keyboard, mouse and screen */
export interface MacUse {
  /** Seconds since the last keyboard or mouse input */
  idle: number
  locked: boolean
  /** Going to sleep: said as it goes, since it says nothing once asleep */
  asleep: boolean
}

/** What a Mac tells the others when it changes, and every few seconds */
export interface MacState {
  id: string
  name: string
  version: string
  use: MacUse
  lease?: Lease
  /** Pace runs there and can answer: started, not waiting for setup */
  ready: boolean
  /** Its Slack connection is open */
  answering: boolean
  /** Pace's reasoner there, as the status bar says it ("claude@vm") */
  reasoner?: string
  /** Collect now runs there, since then */
  collecting?: string
  /**
   * The Slack app Pace answers through there, one way (macsGroup of its
   * key): Pace follows you only between Macs of the same app. Pacenote before
   * 0.6.13 does not say it.
   */
  app?: string
  /**
   * Where it can be reached away from your network: its Tailscale addresses,
   * as host:port (network.ts tailnetAddresses). A device paired with it keeps
   * them and dials them too; Pacenote before 0.6.14 does not say them.
   */
  reach?: string[]
}

/**
 * The desktop app's message to Pace: { type, here } opens (here) or closes its
 * Slack connection. PACENOTE_STANDBY=1 starts it closed.
 */
export const ANSWER_HERE = 'pacenote:answer-here'

/** Input this recent makes a Mac the one you're using */
const IN_USE_IDLE_S = 60
/** No input for this long and you have left a Mac */
const AWAY_IDLE_S = 5 * 60

export const inUse = (use: MacUse) =>
  !use.asleep && !use.locked && use.idle < IN_USE_IDLE_S

/** Locked, going to sleep, or no input for 5 minutes */
export const away = (use: MacUse) =>
  use.asleep || use.locked || use.idle >= AWAY_IDLE_S

/**
 * The later of two leases: the higher term. Two Macs claim the same term only
 * apart from each other (each alone, or out of reach of the other), and then
 * the Mac that claimed first keeps it, as the one already answering; the
 * holder's id settles the rest.
 */
export function laterLease(
  a: Lease | undefined,
  b: Lease | undefined
): Lease | undefined {
  if (!a) return b
  if (!b) return a
  if (a.term !== b.term) return a.term > b.term ? a : b
  if (a.at !== b.at) return a.at < b.at ? a : b
  return a.holder >= b.holder ? a : b
}

/**
 * - answering: Pace answers there
 * - standing-by: another Mac answers; this one would take over
 * - moving: Pace is on its way there (connecting) or away from it (an answer
 *   still finishing, the connection open until the next Mac's is)
 * - out-of-reach: not heard from lately (asleep, off the network, quit)
 */
export type MacStatus = 'answering' | 'standing-by' | 'moving' | 'out-of-reach'

export interface MacView {
  id: string
  name: string
  /** This Mac */
  here: boolean
  status: MacStatus
  /** Locked, going to sleep, or no input for 5 minutes */
  away: boolean
  asleep: boolean
  /** Not running Pace, or Pace waits for setup */
  notReady: boolean
  /** When it was last heard from (other Macs) */
  lastSeen?: string
  reasoner?: string
  /** Where it was reached: its .local name or the address you added */
  address?: string
  /** Collect now runs there, since then */
  collecting?: string
}

export interface MacsView {
  /**
   * Pace follows the Mac you're using: your own Slack app (Socket Mode). With
   * the team hub, or with Pace not set up, your Macs only keep Todo the same.
   */
  paceFollows: boolean
  /**
   * This Mac has a key to know your other Macs by: your Slack app's, or the
   * one Add a device made or brought
   */
  paired: boolean
  /**
   * Settings > Devices: Follow the Mac you're using, or Find your other Macs
   */
  follow: boolean
  /** This Mac first, then the others it knows */
  macs: MacView[]
  /** The Mac that holds the lease: Pace answers there, or is on its way */
  holder?: string
  /** Addresses added by hand, for Macs on another network (Tailscale) */
  addresses: string[]
  /** macOS keeps Pacenote off the local network (Privacy & Security) */
  blocked: boolean
  /** The last time Pace moved to this Mac, and from which */
  moved?: { from: string; at: string }
  /** Add a device: this Mac waits for a new one to set up from it */
  adding?: AddingView
  /**
   * Your iPhone, iPad and Android devices, each with a key of its own: paired
   * here or with any of your Macs. Pacenote before 0.6.14 keeps none.
   */
  devices: DeviceView[]
}

/**
 * An iPhone, iPad or Android device of yours (its app is in development). It
 * holds a key of its own, not your Macs' (channel.ts deviceKey).
 */
export type DeviceKind = 'phone' | 'tablet'

/** A device of yours paired with your Macs */
export interface DeviceView {
  id: string
  name: string
  device: DeviceKind
  pairedAt: string
  /** The Mac it paired with */
  by?: string
  /** Linked to this Mac now */
  connected: boolean
  lastSeen?: string
  /** Where it reached this Mac from */
  address?: string
}

/**
 * A device as your Macs keep it (macs.json) and tell each other: one you
 * removed is kept apart, in removed, so none of them lets it in again
 */
export interface DeviceRecord {
  name: string
  device: DeviceKind
  pairedAt: string
  by?: string
  lastSeen?: string
}

/**
 * Settings > Devices > Add a device: this Mac shows itself on your network for
 * 10 minutes, for a new Mac's setup to connect to it, and sends what that one
 * needs once you Allow
 */
export interface AddingView {
  /** It waits until then */
  until: string
  /** A new Mac or a device asks, and the number both show */
  request?: { name: string; code: string; device?: DeviceKind }
  /** How it ended: sent, you said Not this one, or it stopped waiting */
  result?: {
    kind: 'sent' | 'declined' | 'expired'
    name?: string
    device?: DeviceKind
  }
}

/**
 * The settings a new Mac takes from the one already set up: your Slack app,
 * who Pace answers, and how Todo collects. Not the AI, the sandbox, folders,
 * ops tools or anything else this Mac chose for itself, and never an AI
 * sign-in.
 */
export const SETUP_KEYS = [
  'SLACK_CONNECTION',
  'SLACK_APP_TOKEN',
  'SLACK_BOT_TOKEN',
  'MENTION_ALLOWED_USERS',
  'TASKS',
  'TASKS_DMS',
  'TASKS_EXCLUDE_CHANNELS',
  'TASKS_NAMES',
  'TASKS_GROUPS',
] as const

/** What a Mac with no Slack app of its own takes: how Todo collects */
export const TODO_SETUP_KEYS = [
  'TASKS',
  'TASKS_DMS',
  'TASKS_EXCLUDE_CHANNELS',
  'TASKS_NAMES',
  'TASKS_GROUPS',
] as const satisfies readonly (typeof SETUP_KEYS)[number][]

/** What the Mac already set up sends the new one, once you Allow */
export interface SetupPayload {
  /** SETUP_KEYS, as that Mac has them */
  values: Partial<Record<(typeof SETUP_KEYS)[number], string>>
  /** Who Pace answers, as that Mac's setup knew you */
  me?: { id: string; name: string }
  /**
   * The key your Macs know each other by (base64), so the new one pairs with
   * no Slack app of its own. Pacenote before 0.6.13 sends none.
   */
  group?: string
}

/**
 * Where a Mac takes another's settings from (setup.ts):
 * - pace: Pace's setup, which takes your Slack app and who Pace answers
 * - todo: Todo's first run, which takes how Todo collects
 * - join: Settings > Devices on a Mac set up already, which takes the key alone
 */
export type FromMacMode = 'pace' | 'todo' | 'join'

/** A new Mac's setup taking it from your other Mac, step by step */
export type FromMacState =
  | { step: 'idle' }
  | {
      step: 'looking'
      /** Macs waiting in Add a device on this network */
      found: { instance: string; name: string }[]
    }
  /** retrying: the first try did not get through, and it tries again */
  | { step: 'connecting'; name: string; retrying?: boolean }
  /** Compare the number, then Allow on the other Mac */
  | { step: 'confirming'; name: string; code: string }
  | { step: 'copied'; name: string; me?: { id: string; name: string } }
  | { step: 'error'; message: string }
