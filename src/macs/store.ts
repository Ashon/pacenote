import { randomUUID } from 'node:crypto'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readJson, writeJson } from '../json-file.js'
import type { DeviceRecord, Lease } from './types.js'

export const MACS_FILE = 'macs.json'
/**
 * The key Add a device made or brought (base64), kept apart from macs.json and
 * readable by you alone, as settings.json's secrets are
 */
export const GROUP_FILE = 'macs-key'

/** Another Mac, as last heard from */
export interface KnownMac {
  name: string
  lastSeen: string
  address?: string
}

/** What this Mac keeps of your Macs and devices (MACS_FILE) */
export interface MacsFile {
  version: 1
  /** This Mac, for the others */
  id: string
  follow: boolean
  /** Added by hand, for Macs on another network (Tailscale) */
  addresses: string[]
  /** Macs you stopped following to */
  ignored: string[]
  /** The latest lease this Mac heard of, so a restart knows who answers */
  lease?: Lease
  /** The other Macs, as last heard from */
  known: Record<string, KnownMac>
  /** Your devices (DeviceRecord), paired here or with your other Macs */
  devices: Record<string, DeviceRecord>
  /** Devices you removed, and when: no Mac of yours lets them in again */
  removed: Record<string, string>
}

/**
 * macs.json as read: anything missing or not of its kind is left at its
 * default, and a Mac with no id yet is given one (newId)
 */
export function macsFileOf(
  file: Partial<MacsFile>,
  newId: () => string = randomUUID
): MacsFile {
  return {
    version: 1,
    id: typeof file.id === 'string' && file.id ? file.id : newId(),
    // Off until you turn it on: then this Mac looks on your network, and
    // macOS asks once whether it may
    follow: file.follow === true,
    addresses: Array.isArray(file.addresses) ? file.addresses : [],
    ignored: Array.isArray(file.ignored) ? file.ignored : [],
    ...(file.lease ? { lease: file.lease } : {}),
    known: file.known ?? {},
    devices: file.devices ?? {},
    removed: file.removed ?? {},
  }
}

/** The key in GROUP_FILE's text: 32 bytes as base64, or none */
export function groupKeyOf(text: string): Buffer | undefined {
  const key = Buffer.from(text.trim(), 'base64')
  return key.length === 32 ? key : undefined
}

/**
 * Where this Mac keeps your Macs: macs.json, and the key Add a device made or
 * brought (GROUP_FILE), each written as it changes. One it cannot write is
 * said in the log, and kept as it is until the next save.
 */
export class MacsStore {
  private value: MacsFile
  private key?: Buffer

  constructor(
    private readonly dataDir: string,
    private readonly log: (message: string) => void
  ) {
    this.value = this.read()
    this.key = this.readGroup()
  }

  /** macs.json, as this Mac last saved it */
  get file(): MacsFile {
    return this.value
  }

  /** The key Add a device made or brought (GROUP_FILE) */
  get group(): Buffer | undefined {
    return this.key
  }

  save(patch: Partial<MacsFile>): void {
    this.value = { ...this.value, ...patch }
    this.write(this.value)
  }

  /** Keeps the key your Macs know each other by, for you alone to read */
  setGroup(key: Buffer): void {
    const file = path.join(this.dataDir, GROUP_FILE)
    try {
      writeFileSync(file, `${key.toString('base64')}\n`, { mode: 0o600 })
      chmodSync(file, 0o600)
    } catch (err) {
      this.log(`Macs: could not save ${GROUP_FILE}: ${(err as Error).message}`)
    }
    this.key = key
  }

  private read(): MacsFile {
    const file = readJson<Partial<MacsFile>>(
      path.join(this.dataDir, MACS_FILE),
      {}
    )
    const value = macsFileOf(file)
    if (value.id !== file.id) this.write(value)
    return value
  }

  private readGroup(): Buffer | undefined {
    try {
      return groupKeyOf(
        readFileSync(path.join(this.dataDir, GROUP_FILE), 'utf8')
      )
    } catch {
      return undefined
    }
  }

  private write(value: MacsFile): void {
    try {
      writeJson(path.join(this.dataDir, MACS_FILE), value)
    } catch (err) {
      this.log(`Macs: could not save ${MACS_FILE}: ${(err as Error).message}`)
    }
  }
}
