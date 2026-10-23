import { SETTING_GROUPS } from './fields.js'

/**
 * The connections Pace reaches through the ops broker (Settings > Tools), each
 * with a Read switch and, where Pace can change something, a Write switch.
 * Read is on and Write off until set. A connection is in use once its fields
 * are filled in and Read is on; its writes need Read too.
 */
export const CONNECTIONS = ['files', 'github', 'jira', 'k8s', 'ssh'] as const

export type ConnectionId = (typeof CONNECTIONS)[number]

/** Each connection's switches, by setting name */
export const SWITCHES: Record<ConnectionId, { read: string; write?: string }> =
  {
    files: { read: 'OPS_FS_READ' },
    github: { read: 'OPS_GIT_READ', write: 'OPS_GIT_WRITE' },
    jira: { read: 'OPS_JIRA_READ', write: 'OPS_JIRA_WRITE' },
    k8s: { read: 'OPS_K8S_READ' },
    ssh: { read: 'OPS_SSH_READ' },
  }

/**
 * What a connection's writes need besides it: draft PRs start from the work
 * folder
 */
const WRITE_NEEDS: Partial<Record<ConnectionId, string[]>> = {
  github: ['OPS_FS_ROOT'],
}

export interface ConnectionState {
  id: ConnectionId
  /** Its fields that must be set and are not */
  missing: string[]
  /** Its Read switch */
  read: boolean
  /** Its Write switch; none for a connection Pace only reads */
  write?: boolean
  /** In use: its fields set and Read on */
  reads: boolean
  /** Writes in use: it reads, Write is on and what writing needs is set */
  writes: boolean
  /** With Write on, what writing still needs */
  writeMissing: string[]
}

/**
 * Settings as a screen or a process sees them: a value by name, and whether
 * it is set
 */
export interface SettingsLookup {
  value: (key: string) => string | undefined
  isSet: (key: string) => boolean
}

export function connectionStates(settings: SettingsLookup): ConnectionState[] {
  return CONNECTIONS.map((id) => {
    const requires =
      SETTING_GROUPS.find((group) => group.id === id)?.requires ?? []
    const missing = requires.filter((key) => !settings.isSet(key))
    const switches = SWITCHES[id]
    const read = settings.value(switches.read) !== 'off'
    const write = switches.write
      ? settings.value(switches.write) === 'on'
      : undefined
    const reads = missing.length === 0 && read
    const writeMissing = write
      ? (WRITE_NEEDS[id] ?? []).filter((key) => !settings.isSet(key))
      : []
    return {
      id,
      missing,
      read,
      write,
      reads,
      writes: reads && Boolean(write) && writeMissing.length === 0,
      writeMissing,
    }
  })
}

/**
 * Settings by name, the way Pace reads them from the file and the
 * environment
 */
export function lookupIn(
  values: Record<string, string | undefined>
): SettingsLookup {
  return {
    value: (key) => values[key]?.trim(),
    isSet: (key) => Boolean(values[key]?.trim()),
  }
}

/**
 * What the broker may offer (its TOOLS): each connection in use by its id,
 * and its writes as "<id>-write"
 */
export function brokerTools(
  values: Record<string, string | undefined>
): string[] {
  return connectionStates(lookupIn(values)).flatMap((state) => [
    ...(state.reads ? [state.id] : []),
    ...(state.writes ? [`${state.id}-write`] : []),
  ])
}
