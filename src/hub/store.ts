import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { HubUser } from './protocol.js'

/**
 * A paired desktop. The hub keeps only the token's SHA-256, never the token.
 */
export interface DesktopRecord {
  id: string
  tokenHash: string
  user: HubUser
  label: string
  pairedAt: string
  lastSeenAt?: string
}

interface StoreFile {
  version: 1
  desktops: DesktopRecord[]
  /** Token hashes the installer paired (HUB_PAIR), each paired only once */
  seeded?: string[]
}

/**
 * Paired desktops, in a JSON file in the hub's data folder
 * (HUB_DATA_DIR/desktops.json). One desktop per member: pairing again replaces
 * the member's previous desktop.
 */
export class DesktopStore {
  private desktops: DesktopRecord[]
  private seeded: string[]

  constructor(private readonly file: string) {
    const stored = existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as StoreFile)
      : undefined
    this.desktops = stored?.desktops ?? []
    this.seeded = stored?.seeded ?? []
  }

  list(): readonly DesktopRecord[] {
    return this.desktops
  }

  byTokenHash(tokenHash: string): DesktopRecord | undefined {
    return this.desktops.find((d) => d.tokenHash === tokenHash)
  }

  byUser(userId: string): DesktopRecord | undefined {
    return this.desktops.find((d) => d.user.id === userId)
  }

  /**
   * Adds a paired desktop and returns the member's previous one, which it
   * replaces.
   */
  add(
    tokenHash: string,
    user: HubUser,
    label: string
  ): { desktop: DesktopRecord; replaced?: DesktopRecord } {
    const replaced = this.byUser(user.id)
    const desktop: DesktopRecord = {
      id: randomBytes(8).toString('hex'),
      tokenHash,
      user,
      label,
      pairedAt: new Date().toISOString(),
    }
    this.desktops = [
      ...this.desktops.filter((d) => d.user.id !== user.id),
      desktop,
    ]
    this.save()
    return { desktop, replaced }
  }

  /**
   * Pairs the installer's desktop, the first time the hub starts with it.
   * Later starts leave it alone, so a desktop the member paired since, or
   * disconnected, stays as they left it. Returns whether it paired now.
   */
  seed(tokenHash: string, user: HubUser, label: string): boolean {
    if (this.seeded.includes(tokenHash)) return false
    this.seeded = [...this.seeded, tokenHash]
    this.add(tokenHash, user, label)
    return true
  }

  remove(id: string): void {
    this.desktops = this.desktops.filter((d) => d.id !== id)
    this.save()
  }

  touch(id: string): void {
    const desktop = this.desktops.find((d) => d.id === id)
    if (!desktop) return
    desktop.lastSeenAt = new Date().toISOString()
    this.save()
  }

  private save(): void {
    mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    const data: StoreFile = {
      version: 1,
      desktops: this.desktops,
      ...(this.seeded.length > 0 ? { seeded: this.seeded } : {}),
    }
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}
