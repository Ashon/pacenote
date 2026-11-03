import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { HubAccessRule, HubUser } from './protocol.js'

/** Someone on the hub's list of members, and who put them there */
export interface ListedMember {
  user: HubUser
  addedAt: string
  /**
   * The admin who added them; none for one hub.env listed, or one on the hub
   * already when it became for listed members
   */
  addedBy?: HubUser
}

/**
 * Someone the hub turned away, who is waiting for an admin to add them. The
 * hub tells them where they asked once one does.
 */
export interface AccessRequest {
  user: HubUser
  at: string
  channel: string
  threadTs?: string
  /** The pairing code they sent: bound for them if it is still good then */
  code?: string
}

interface AccessFile {
  version: 1
  rule: HubAccessRule
  members: ListedMember[]
  /** Admins made in Pacenote (or the hub's first member) */
  admins: HubUser[]
  requests: AccessRequest[]
  /** HUB_ALLOWED_USERS IDs already added, each added only once */
  seeded: string[]
}

/** Requests kept, the newest */
const MAX_REQUESTS = 50

/**
 * Who may use the hub and who manages it, in a JSON file in the hub's data
 * folder (HUB_DATA_DIR/access.json); in memory with no file.
 * - The rule: everyone in the workspace, or the members listed. Admins can
 *   always use it.
 * - HUB_ALLOWED_USERS adds each member it names once, the first time the hub
 *   starts with them; a hub that starts with some is for listed members. The
 *   list is the admins' after that, as HUB_PAIR's pairing is the member's.
 * - HUB_ADMINS are admins whatever the file says. With none, the hub's first
 *   member is its admin (claimFirst).
 */
export class HubAccess {
  private data: AccessFile

  constructor(
    private readonly file: string | undefined,
    private readonly env: {
      members?: readonly string[]
      admins?: readonly string[]
    } = {}
  ) {
    const stored =
      file && existsSync(file)
        ? (JSON.parse(readFileSync(file, 'utf8')) as Partial<AccessFile>)
        : undefined
    this.data = {
      version: 1,
      rule: stored?.rule === 'members' ? 'members' : 'everyone',
      members: stored?.members ?? [],
      admins: stored?.admins ?? [],
      requests: stored?.requests ?? [],
      seeded: stored?.seeded ?? [],
    }
    const fresh = (env.members ?? []).filter(
      (id) => !this.data.seeded.includes(id)
    )
    if (fresh.length === 0) return
    if (!stored) this.data.rule = 'members'
    const at = new Date().toISOString()
    for (const id of fresh)
      if (!this.listed(id))
        // Named by ID until Slack says more (fillNames)
        this.data.members.push({ user: { id, name: id }, addedAt: at })
    this.data.seeded.push(...fresh)
    this.save()
  }

  rule(): HubAccessRule {
    return this.data.rule
  }

  members(): readonly ListedMember[] {
    return this.data.members
  }

  requests(): readonly AccessRequest[] {
    return this.data.requests
  }

  /** Admins by ID: hub.env's, then those made here */
  adminIds(): string[] {
    return [
      ...new Set([
        ...(this.env.admins ?? []),
        ...this.data.admins.map((admin) => admin.id),
      ]),
    ]
  }

  isAdmin(userId: string): boolean {
    return this.adminIds().includes(userId)
  }

  /** hub.env names them an admin (HUB_ADMINS): Pacenote cannot change it */
  fixedAdmin(userId: string): boolean {
    return (this.env.admins ?? []).includes(userId)
  }

  listed(userId: string): boolean {
    return this.data.members.some((member) => member.user.id === userId)
  }

  allows(userId: string): boolean {
    return (
      this.data.rule === 'everyone' ||
      this.listed(userId) ||
      this.isAdmin(userId)
    )
  }

  /**
   * Makes them the hub's admin if it has none yet: the installer, or the
   * first member to pair. Returns whether it did.
   */
  claimFirst(user: HubUser): boolean {
    if (this.adminIds().length > 0) return false
    this.data.admins.push(user)
    this.save()
    return true
  }

  /**
   * Sets the rule. For listed members, those in keep (the members paired
   * now) go on the list, so nobody using the hub is cut off.
   */
  setRule(rule: HubAccessRule, keep: readonly HubUser[]): void {
    if (rule === 'members') {
      const at = new Date().toISOString()
      for (const user of keep)
        if (!this.listed(user.id)) this.data.members.push({ user, addedAt: at })
    }
    this.data.rule = rule
    this.save()
  }

  /**
   * Puts them on the list, and returns the request this answers, which it
   * takes away
   */
  add(user: HubUser, by: HubUser): AccessRequest | undefined {
    const request = this.data.requests.find((r) => r.user.id === user.id)
    this.data.requests = this.data.requests.filter((r) => r !== request)
    if (!this.listed(user.id))
      this.data.members.push({
        user,
        addedAt: new Date().toISOString(),
        addedBy: by,
      })
    this.save()
    return request
  }

  /** Takes them off the list, and off the admins made here */
  remove(userId: string): void {
    this.data.members = this.data.members.filter((m) => m.user.id !== userId)
    this.data.admins = this.data.admins.filter((a) => a.id !== userId)
    this.save()
  }

  setAdmin(user: HubUser, admin: boolean): void {
    this.data.admins = this.data.admins.filter((a) => a.id !== user.id)
    if (admin) this.data.admins.push(user)
    this.save()
  }

  /** Someone turned away asks to be added; their latest ask counts */
  ask(request: AccessRequest): void {
    this.data.requests = [
      ...this.data.requests.filter((r) => r.user.id !== request.user.id),
      request,
    ].slice(-MAX_REQUESTS)
    this.save()
  }

  decline(userId: string): void {
    this.data.requests = this.data.requests.filter((r) => r.user.id !== userId)
    this.save()
  }

  /** Members and admins named by ID only, for Slack to name */
  unnamed(): string[] {
    return [
      ...this.data.members.map((m) => m.user),
      ...this.data.admins,
    ].flatMap((user) => (user.name === user.id ? [user.id] : []))
  }

  /** Their name, wherever it is kept by ID only */
  rename(user: HubUser): void {
    for (const member of this.data.members)
      if (member.user.id === user.id) member.user = user
    this.data.admins = this.data.admins.map((a) =>
      a.id === user.id ? user : a
    )
    this.save()
  }

  private save(): void {
    if (!this.file) return
    mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, {
      mode: 0o600,
    })
    renameSync(tmp, this.file)
  }
}
