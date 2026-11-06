import { createHash, randomBytes } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { Duplex } from 'node:stream'
import { type WebSocket, WebSocketServer } from 'ws'
import { BodyTooLargeError, readBody, sendJson } from '../http.js'
import { localized, type Locale } from '../i18n/locale.js'
import type { Logger } from '../logger.js'
import type { AccessRequest, HubAccess } from './access.js'
import type { Pairings } from './pairing.js'
import { Grants, type MentionEvent } from './policy.js'
import {
  CONNECT_COMMAND,
  HEX64,
  HUB_CLOSE,
  HUB_PATHS,
  type HubAdminAct,
  type HubAdminView,
  type HubMe,
  type HubMemberView,
  type HubMessage,
  type HubPerson,
  type HubTeam,
  type HubUser,
  type PairConfirmResponse,
  PAIRING_ID,
  PING,
  PONG,
  SLACK_USER_ID,
} from './protocol.js'
import { text } from './server.text.js'
import type { DesktopRecord, DesktopStore } from './store.js'

/**
 * The hub's side of Slack: calls made with the bot token, which never leaves
 * the hub
 */
export interface SlackGateway {
  /** Calls a Web API method, forwarding the body as the desktop sent it */
  call(
    method: string,
    body: string,
    contentType: string
  ): Promise<{
    status: number
    json: Record<string, unknown>
    retryAfter?: string
  }>
  download(url: string): Promise<Response>
  upload(
    url: string,
    body: Buffer,
    contentType: string | undefined
  ): Promise<Response>
  postEphemeral(
    channel: string,
    user: string,
    text: string,
    threadTs?: string
  ): Promise<void>
  userName(userId: string): Promise<string>
  /** The workspace's people, for admins to add (users.list) */
  people(): Promise<SlackPerson[]>
}

/** Someone in the workspace, and every name they go by, to search */
export interface SlackPerson {
  user: HubUser
  names: string[]
}

/** The installer's desktop, until it connects with its own name */
const INSTALLER_LABEL = 'Pacenote, from the installer'

interface HubOptions {
  store: DesktopStore
  pairings: Pairings
  slack: SlackGateway
  team: HubTeam
  /** Who may pair and use the hub, and who manages it */
  access: HubAccess
  /**
   * The URL desktops reach the hub at, for rewritten upload URLs. Else taken
   * from the request (X-Forwarded-*).
   */
  publicUrl?: string
  /**
   * Where Slack serves files (slackFilesOrigin of SLACK_API_URL). Default
   * https://files.slack.com
   */
  filesOrigin?: string
  /** The language of the hub's notes in Slack (HUB_NOTES_LANGUAGE). English */
  notesLocale?: Locale
  log: Logger
}

const MAX_API_BODY = 2 * 1024 * 1024
const MAX_UPLOAD_BODY = 50 * 1024 * 1024
const UPLOAD_TTL_MS = 10 * 60_000
const HEARTBEAT_MS = 30_000
/** How long the workspace's people are kept for admins' searches */
const PEOPLE_TTL_MS = 5 * 60_000
/** The most people a search answers */
const PEOPLE_FOUND = 20

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * The hub server: pairing (HTTP), desktop connections (WebSocket /connect),
 * mention routing, and the Slack proxy desktops make their calls through. Runs
 * behind HTTPS in production (docs/team-hub.md).
 */
export class HubServer {
  readonly http: Server
  private readonly wss = new WebSocketServer({ noServer: true })
  /** Desktop id -> its live connection */
  private readonly sockets = new Map<string, WebSocket>()
  private readonly grants = new Map<string, Grants>()
  /** Upload key -> the Slack upload URL it stands for */
  private readonly uploads = new Map<
    string,
    { desktopId: string; url: string; expiresAt: number }
  >()
  private readonly alive = new WeakMap<WebSocket, boolean>()
  private readonly heartbeat: NodeJS.Timeout
  /** Names Slack gave for member IDs the hub has no name for */
  private readonly names = new Map<string, string>()
  private people?: { at: number; list: SlackPerson[] }

  constructor(private readonly options: HubOptions) {
    this.http = createServer((req, res) => {
      this.handle(req, res).catch((err: unknown) => {
        if (err instanceof BodyTooLargeError) {
          if (!res.headersSent)
            json(
              res,
              413,
              { ok: false, error: 'too_large' },
              {
                Connection: 'close',
              }
            )
          else res.end()
          return
        }
        options.log.error(`Request failed: ${req.method} ${req.url}`, err)
        if (!res.headersSent) json(res, 500, { ok: false, error: 'hub_error' })
        else res.end()
      })
    })
    this.http.on('upgrade', (req, socket, head) =>
      this.upgrade(req, socket, head)
    )
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS)
    this.heartbeat.unref()
  }

  listen(port: number, host = '0.0.0.0'): Promise<number> {
    return new Promise((resolve) => {
      this.http.listen(port, host, () => {
        const address = this.http.address()
        resolve(typeof address === 'object' && address ? address.port : port)
      })
    })
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeat)
    for (const ws of this.sockets.values()) ws.close(1001, 'Hub shutting down')
    await new Promise<void>((resolve) => this.http.close(() => resolve()))
  }

  /**
   * Pairs the desktop of whoever ran the installer (HUB_PAIR), once: their
   * Pacenote made the token and switches to the hub as soon as it answers, with
   * no code to send in Slack. They are the hub's admin if it has none; a
   * member the hub does not allow is left out.
   */
  async pairInstaller(pair: {
    user: string
    tokenHash: string
  }): Promise<void> {
    const { store, slack, access, log } = this.options
    const name = await slack.userName(pair.user).catch(() => pair.user)
    const user = { id: pair.user, name }
    if (access.claimFirst(user))
      log.info(`${name} (${pair.user}), who installed the hub, is its admin`)
    if (!access.allows(pair.user)) {
      log.warn(
        `HUB_PAIR names ${pair.user}, who is not on the hub's members; not paired`
      )
      return
    }
    if (store.seed(pair.tokenHash, user, INSTALLER_LABEL))
      log.info(`Paired ${name} (${pair.user})'s desktop from the installer`)
  }

  /**
   * The hub's first admin, for one with none yet (from before admins, started
   * without HUB_PAIR or HUB_ADMINS): the member who paired first
   */
  claimAdmin(): void {
    const [first] = [...this.options.store.list()].sort((a, b) =>
      a.pairedAt.localeCompare(b.pairedAt)
    )
    if (first && this.options.access.claimFirst(first.user))
      this.options.log.info(
        `${first.user.name} (${first.user.id}), the first member paired, is the hub's admin; HUB_ADMINS names others`
      )
  }

  /** Slack's names for the members and admins hub.env named by ID */
  async fillNames(): Promise<void> {
    const { access, slack } = this.options
    const ids = new Set([
      ...access.unnamed(),
      ...access.adminIds().filter((id) => !this.knownName(id)),
    ])
    for (const id of ids) {
      const name = await slack.userName(id).catch(() => undefined)
      if (!name || name === id) continue
      this.names.set(id, name)
      access.rename({ id, name })
    }
  }

  /**
   * Routes an app_mention (its event_callback body) to the member's desktop, or
   * handles "connect <code>".
   */
  async handleMention(body: Record<string, unknown>): Promise<void> {
    const event = body.event as (MentionEvent & { text?: string }) | undefined
    const user = event?.user
    if (!event || !user) return
    const { slack, store, log } = this.options
    const t = localized(text, this.options.notesLocale ?? 'en')
    const notice = (message: string) =>
      slack
        .postEphemeral(event.channel, user, message, event.thread_ts)
        .catch((err: unknown) =>
          log.warn(
            `Could not send a notice to ${user}: ${(err as Error).message}`
          )
        )
    const command = CONNECT_COMMAND.exec(event.text ?? '')
    const code = command && `${command[1]}-${command[2]}`
    const { access } = this.options
    if (!access.allows(user)) {
      if (access.adminIds().length === 0) return notice(t.notAllowed)
      // Someone turned away waits for an admin, with the code they sent
      const name = await slack.userName(user).catch(() => user)
      access.ask({
        user: { id: user, name },
        at: new Date().toISOString(),
        channel: event.channel,
        threadTs: event.thread_ts,
        code: code ?? undefined,
      })
      log.info(`${name} (${user}) asked to be added to the hub`)
      return notice(t.asked)
    }

    if (code) {
      const name = await slack.userName(user).catch(() => user)
      const bound = this.options.pairings.bind(code, { id: user, name })
      log.info(`Pairing code from ${name} (${user}): ${bound.result}`)
      return notice(
        bound.result === 'bound'
          ? t.paired(bound.label)
          : bound.result === 'taken'
            ? t.takenCode
            : t.unknownCode
      )
    }

    const desktop = store.byUser(user)
    if (!desktop) return notice(t.notPaired)
    const ws = this.sockets.get(desktop.id)
    if (!ws || ws.readyState !== ws.OPEN) return notice(t.offline)
    this.grantsOf(desktop.id).add(event)
    send(ws, { type: 'event', body })
    log.info(
      `Routed a mention in ${event.channel} to ${desktop.user.name}'s desktop (${desktop.label})`
    )
  }

  private grantsOf(desktopId: string): Grants {
    let grants = this.grants.get(desktopId)
    if (!grants)
      this.grants.set(
        desktopId,
        (grants = new Grants(Date.now, this.options.filesOrigin))
      )
    return grants
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://hub')
    const { pairings, store, team } = this.options

    if (req.method === 'GET' && url.pathname === HUB_PATHS.health)
      return json(res, 200, { ok: true })

    if (req.method === 'POST' && url.pathname === HUB_PATHS.pairStart) {
      const body = await readJson(req)
      const tokenHash = String(body?.tokenHash ?? '')
      const label =
        String(body?.label ?? '').slice(0, 100) || 'Pacenote desktop'
      if (!HEX64.test(tokenHash))
        return json(res, 400, { error: 'invalid_request' })
      const started = pairings.start(tokenHash, label)
      if (!started) return json(res, 429, { error: 'too_many_pairings' })
      return json(res, 200, started)
    }
    if (req.method === 'GET' && url.pathname === HUB_PATHS.pairStatus) {
      const pairingId = url.searchParams.get('pairingId') ?? ''
      if (!PAIRING_ID.test(pairingId))
        return json(res, 400, { error: 'invalid_request' })
      return json(res, 200, pairings.status(pairingId))
    }
    if (req.method === 'POST' && url.pathname === HUB_PATHS.pairConfirm) {
      const body = await readJson(req)
      const pairingId = String(body?.pairingId ?? '')
      const token = String(body?.token ?? '')
      if (!PAIRING_ID.test(pairingId) || !HEX64.test(token))
        return json(res, 400, { error: 'invalid_request' })
      const confirmed = pairings.confirm(pairingId, sha256(token))
      if (!confirmed) return json(res, 409, { error: 'not_confirmable' })
      const { desktop, replaced } = store.add(
        sha256(token),
        confirmed.user,
        confirmed.label
      )
      if (replaced)
        this.drop(replaced, HUB_CLOSE.replaced, 'Paired a new desktop')
      this.options.log.info(
        `Paired ${desktop.user.name} (${desktop.user.id}) with "${desktop.label}"${replaced ? `, replacing "${replaced.label}"` : ''}`
      )
      if (this.options.access.claimFirst(desktop.user))
        this.options.log.info(
          `${desktop.user.name}, the hub's first member, is its admin`
        )
      return json(res, 200, {
        user: desktop.user,
        team,
      } satisfies PairConfirmResponse)
    }

    // Everything below needs a paired desktop's token.
    const desktop = this.authenticate(req)
    if (!desktop)
      // Slack API calls get a Slack-shaped error (HTTP 200), so the desktop's
      // Slack client reports hub_unauthorized.
      return json(res, url.pathname.startsWith(HUB_PATHS.api) ? 200 : 401, {
        ok: false,
        error: 'hub_unauthorized',
      })

    if (req.method === 'GET' && url.pathname === HUB_PATHS.me) {
      const ws = this.sockets.get(desktop.id)
      return json(res, 200, {
        user: desktop.user,
        team,
        connected: Boolean(ws && ws.readyState === ws.OPEN),
        admin: this.options.access.isAdmin(desktop.user.id),
      } satisfies HubMe)
    }
    if (req.method === 'POST' && url.pathname === HUB_PATHS.disconnect) {
      store.remove(desktop.id)
      this.drop(desktop, HUB_CLOSE.revoked, 'Disconnected from the app')
      this.options.log.info(
        `Unpaired ${desktop.user.name}'s desktop "${desktop.label}"`
      )
      return json(res, 200, { ok: true })
    }
    if (
      url.pathname === HUB_PATHS.admin ||
      url.pathname === HUB_PATHS.adminPeople
    ) {
      if (!this.options.access.isAdmin(desktop.user.id))
        return json(res, 403, { error: 'not_admin' })
      if (req.method === 'GET' && url.pathname === HUB_PATHS.admin)
        return json(res, 200, this.adminView(desktop.user))
      if (req.method === 'POST' && url.pathname === HUB_PATHS.admin) {
        const error = await this.act(desktop.user, await readJson(req))
        if (error)
          return json(res, error === 'invalid_request' ? 400 : 409, { error })
        return json(res, 200, this.adminView(desktop.user))
      }
      if (req.method === 'GET' && url.pathname === HUB_PATHS.adminPeople)
        return json(res, 200, {
          people: await this.findPeople(url.searchParams.get('q') ?? ''),
        })
    }
    if (req.method === 'POST' && url.pathname.startsWith(HUB_PATHS.api))
      return this.proxyApi(
        req,
        res,
        desktop,
        url.pathname.slice(HUB_PATHS.api.length)
      )
    if (req.method === 'GET' && url.pathname === HUB_PATHS.files)
      return this.proxyDownload(res, desktop, url.searchParams.get('url') ?? '')
    if (req.method === 'POST' && url.pathname === HUB_PATHS.upload)
      return this.proxyUpload(
        req,
        res,
        desktop,
        url.searchParams.get('key') ?? ''
      )
    return json(res, 404, { error: 'not_found' })
  }

  /**
   * The hub as its admins see it: who is on it, their Macs, and who waits.
   * Nothing of any message.
   */
  private adminView(you: HubUser): HubAdminView {
    const { access, store, team } = this.options
    const users = new Map<string, HubUser>()
    for (const member of access.members())
      users.set(member.user.id, member.user)
    for (const id of access.adminIds())
      if (!users.has(id)) users.set(id, this.userKnown(id))
    // A paired Mac's name for its member is the latest
    for (const desktop of store.list()) users.set(desktop.user.id, desktop.user)
    const members = [...users.values()].map((user): HubMemberView => {
      const listed = access.members().find((m) => m.user.id === user.id)
      const desktop = store.byUser(user.id)
      const ws = desktop && this.sockets.get(desktop.id)
      return {
        user,
        admin: access.isAdmin(user.id),
        fixedAdmin: access.fixedAdmin(user.id),
        listed: Boolean(listed),
        addedAt: listed?.addedAt,
        addedBy: listed?.addedBy,
        desktop: desktop && {
          label: desktop.label,
          pairedAt: desktop.pairedAt,
          lastSeenAt: desktop.lastSeenAt,
          connected: Boolean(ws && ws.readyState === ws.OPEN),
        },
      }
    })
    // Admins first, then by name
    members.sort(
      (a, b) =>
        Number(b.admin) - Number(a.admin) ||
        a.user.name.localeCompare(b.user.name)
    )
    return {
      team,
      you,
      rule: access.rule(),
      members,
      requests: [...access.requests()]
        .reverse()
        .map((request) => ({ user: request.user, at: request.at })),
    }
  }

  /** An admin's change (HubAdminAct), or why it cannot be made */
  private async act(
    you: HubUser,
    body: Record<string, unknown> | undefined
  ): Promise<string | undefined> {
    const { access, log } = this.options
    const act = body as Partial<HubAdminAct> | undefined
    if (act?.do === 'rule') {
      if (act.rule !== 'everyone' && act.rule !== 'members')
        return 'invalid_request'
      access.setRule(
        act.rule,
        this.options.store.list().map((desktop) => desktop.user)
      )
      log.info(
        `${you.name} opened the hub to ${act.rule === 'members' ? 'listed members' : 'everyone in the workspace'}`
      )
      return undefined
    }
    const id = act && 'user' in act ? act.user : undefined
    if (typeof id !== 'string' || !SLACK_USER_ID.test(id))
      return 'invalid_request'
    // Your own Mac and access are yours, in Settings
    if (id === you.id) return 'not_yourself'
    const user = await this.userOf(id)
    switch (act?.do) {
      case 'add': {
        const request = access.add(user, you)
        log.info(`${you.name} added ${user.name} (${id}) to the hub's members`)
        if (request) await this.tellAdded(request)
        return undefined
      }
      case 'decline':
        access.decline(id)
        log.info(`${you.name} declined ${user.name} (${id})'s request`)
        return undefined
      case 'remove':
        if (access.fixedAdmin(id)) return 'set_in_hub_env'
        access.remove(id)
        this.unpair(id, 'Removed from the hub by an admin')
        log.info(`${you.name} removed ${user.name} (${id}) from the hub`)
        return undefined
      case 'disconnect':
        this.unpair(id, 'Disconnected by an admin')
        log.info(`${you.name} disconnected ${user.name} (${id})'s desktop`)
        return undefined
      case 'admin':
        if (typeof act.admin !== 'boolean') return 'invalid_request'
        if (access.fixedAdmin(id)) return 'set_in_hub_env'
        access.setAdmin(user, act.admin)
        log.info(
          `${you.name} ${act.admin ? 'made' : 'took'} ${user.name} (${id}) ${act.admin ? 'an admin' : 'off the admins'}`
        )
        return undefined
    }
    return 'invalid_request'
  }

  /**
   * Tells someone an admin added where they asked, and binds the code they
   * sent if their pairing is still waiting for it
   */
  private async tellAdded(request: AccessRequest): Promise<void> {
    const t = localized(text, this.options.notesLocale ?? 'en')
    const bound = request.code
      ? this.options.pairings.bind(request.code, request.user)
      : undefined
    await this.options.slack
      .postEphemeral(
        request.channel,
        request.user.id,
        bound?.result === 'bound' ? t.addedPairing(bound.label) : t.added,
        request.threadTs
      )
      .catch((err: unknown) =>
        this.options.log.warn(
          `Could not tell ${request.user.name} they were added: ${(err as Error).message}`
        )
      )
  }

  /** Unpairs a member's Mac and closes its connection */
  private unpair(userId: string, reason: string): void {
    const desktop = this.options.store.byUser(userId)
    if (!desktop) return
    this.options.store.remove(desktop.id)
    this.drop(desktop, HUB_CLOSE.revoked, reason)
  }

  /** People in the workspace whose names have these words in them */
  private async findPeople(q: string): Promise<HubPerson[]> {
    const words = q.trim().toLowerCase()
    if (!words) return []
    if (!this.people || this.people.at < Date.now() - PEOPLE_TTL_MS)
      this.people = { at: Date.now(), list: await this.options.slack.people() }
    const { access } = this.options
    return this.people.list
      .filter(
        (person) =>
          person.user.id.toLowerCase() === words ||
          person.names.some((name) => name.toLowerCase().includes(words))
      )
      .slice(0, PEOPLE_FOUND)
      .map(({ user }) => ({
        user,
        member: access.listed(user.id) || access.isAdmin(user.id),
      }))
  }

  /** A name the hub has for a member ID already */
  private knownName(id: string): string | undefined {
    const { access, store } = this.options
    const named = (user?: HubUser) =>
      user && user.name !== user.id ? user.name : undefined
    return (
      named(store.byUser(id)?.user) ??
      named(access.members().find((m) => m.user.id === id)?.user) ??
      named(access.requests().find((r) => r.user.id === id)?.user) ??
      this.names.get(id) ??
      this.people?.list.find((person) => person.user.id === id)?.user.name
    )
  }

  private userKnown(id: string): HubUser {
    return { id, name: this.knownName(id) ?? id }
  }

  /** A member by ID, named as the hub knows them or as Slack does */
  private async userOf(id: string): Promise<HubUser> {
    const known = this.knownName(id)
    if (known) return { id, name: known }
    const name = await this.options.slack.userName(id).catch(() => id)
    if (name !== id) this.names.set(id, name)
    return { id, name }
  }

  private async proxyApi(
    req: IncomingMessage,
    res: ServerResponse,
    desktop: DesktopRecord,
    method: string
  ): Promise<void> {
    if (!/^[a-zA-Z]+(\.[a-zA-Z]+)+$/.test(method))
      return json(res, 404, { ok: false, error: 'unknown_method' })
    const raw = (await readBody(req, MAX_API_BODY)).toString('utf8')
    const contentType =
      req.headers['content-type'] ?? 'application/x-www-form-urlencoded'
    const args = parseArgs(raw, contentType)
    const grants = this.grantsOf(desktop.id)
    const decision = grants.authorize(method, args)
    if (!decision.ok) {
      this.options.log.warn(
        `Refused ${method} from ${desktop.user.name}'s desktop: ${decision.error}`
      )
      // Same shape as a Slack error, so the desktop's Slack client reports it
      // as one.
      return json(res, 200, { ok: false, error: decision.error })
    }
    const result = await this.options.slack.call(
      method,
      withoutToken(raw, contentType),
      contentType
    )
    grants.observe(method, args, result.json)
    if (
      method === 'files.getUploadURLExternal' &&
      typeof result.json.upload_url === 'string'
    )
      result.json.upload_url = this.rewriteUpload(
        req,
        desktop.id,
        result.json.upload_url
      )
    if (result.retryAfter) res.setHeader('Retry-After', result.retryAfter)
    return json(res, result.status, result.json)
  }

  private async proxyDownload(
    res: ServerResponse,
    desktop: DesktopRecord,
    fileUrl: string
  ): Promise<void> {
    if (!this.grantsOf(desktop.id).canDownload(fileUrl))
      return json(res, 403, { ok: false, error: 'file_not_granted' })
    const upstream = await this.options.slack.download(fileUrl)
    res.statusCode = upstream.status
    for (const header of [
      'content-type',
      'content-length',
      'content-disposition',
    ]) {
      const value = upstream.headers.get(header)
      if (value) res.setHeader(header, value)
    }
    res.end(Buffer.from(await upstream.arrayBuffer()))
  }

  private async proxyUpload(
    req: IncomingMessage,
    res: ServerResponse,
    desktop: DesktopRecord,
    key: string
  ): Promise<void> {
    const upload = this.uploads.get(key)
    if (
      !upload ||
      upload.desktopId !== desktop.id ||
      upload.expiresAt < Date.now()
    )
      return json(res, 403, { ok: false, error: 'upload_not_granted' })
    this.uploads.delete(key)
    const upstream = await this.options.slack.upload(
      upload.url,
      await readBody(req, MAX_UPLOAD_BODY),
      req.headers['content-type']
    )
    res.statusCode = upstream.status
    res.end(await upstream.text())
  }

  private rewriteUpload(
    req: IncomingMessage,
    desktopId: string,
    url: string
  ): string {
    const key = randomBytes(16).toString('hex')
    this.uploads.set(key, {
      desktopId,
      url,
      expiresAt: Date.now() + UPLOAD_TTL_MS,
    })
    for (const [k, v] of this.uploads)
      if (v.expiresAt < Date.now()) this.uploads.delete(k)
    return `${this.publicUrl(req)}${HUB_PATHS.upload}?key=${key}`
  }

  private publicUrl(req: IncomingMessage): string {
    if (this.options.publicUrl) return this.options.publicUrl.replace(/\/$/, '')
    const proto = String(req.headers['x-forwarded-proto'] ?? 'http')
      .split(',')[0]!
      .trim()
    const host = String(
      req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost'
    )
    return `${proto}://${host}`
  }

  private authenticate(req: IncomingMessage): DesktopRecord | undefined {
    const token = /^Bearer ([0-9a-f]{64})$/.exec(
      req.headers.authorization ?? ''
    )?.[1]
    return token ? this.options.store.byTokenHash(sha256(token)) : undefined
  }

  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', 'http://hub')
    const desktop =
      url.pathname === HUB_PATHS.connect ? this.authenticate(req) : undefined
    if (!desktop) {
      socket.end(
        'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
      )
      return
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.attach(desktop, ws))
  }

  private attach(desktop: DesktopRecord, ws: WebSocket): void {
    const previous = this.sockets.get(desktop.id)
    if (previous)
      previous.close(HUB_CLOSE.replaced, 'Replaced by a newer connection')
    this.sockets.set(desktop.id, ws)
    this.alive.set(ws, true)
    this.options.store.touch(desktop.id)
    this.options.log.info(
      `${desktop.user.name}'s desktop "${desktop.label}" connected`
    )
    ws.on('pong', () => this.alive.set(ws, true))
    ws.on('message', (data) => {
      this.alive.set(ws, true)
      if (data.toString() === PING) ws.send(PONG)
    })
    ws.on('close', () => {
      if (this.sockets.get(desktop.id) !== ws) return
      this.sockets.delete(desktop.id)
      this.options.log.info(
        `${desktop.user.name}'s desktop "${desktop.label}" disconnected`
      )
    })
    send(ws, { type: 'ready', user: desktop.user, team: this.options.team })
  }

  /** Closes a desktop's connection and forgets its grants. */
  private drop(desktop: DesktopRecord, code: number, reason: string): void {
    const ws = this.sockets.get(desktop.id)
    if (ws) {
      if (code === HUB_CLOSE.revoked) send(ws, { type: 'revoked', reason })
      ws.close(code, reason)
      this.sockets.delete(desktop.id)
    }
    this.grants.delete(desktop.id)
  }

  private beat(): void {
    for (const ws of this.sockets.values()) {
      if (this.alive.get(ws) === false) {
        ws.terminate()
        continue
      }
      this.alive.set(ws, false)
      ws.ping()
    }
  }
}

function send(ws: WebSocket, message: HubMessage): void {
  ws.send(JSON.stringify(message))
}

const json = sendJson

async function readJson(
  req: IncomingMessage
): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(
      (await readBody(req, 64 * 1024)).toString('utf8')
    ) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Web API arguments as strings, the way the policy reads them (nested values
 * stay JSON strings)
 */
/**
 * A call's body as the hub passes it on: without the token in it. The
 * desktop's Slack client puts its hub token in some calls (Bolt's auth.test),
 * and Slack takes a token in the body over the bot token in the header, so
 * it would answer invalid_auth, and the hub token would reach Slack.
 */
export function withoutToken(raw: string, contentType: string): string {
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || !('token' in parsed))
        return raw
      const rest = { ...(parsed as Record<string, unknown>) }
      delete rest.token
      return JSON.stringify(rest)
    } catch {
      return raw
    }
  }
  const params = new URLSearchParams(raw)
  if (!params.has('token')) return raw
  params.delete('token')
  return params.toString()
}

function parseArgs(raw: string, contentType: string): Record<string, string> {
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [
          key,
          typeof value === 'string' ? value : JSON.stringify(value),
        ])
      )
    } catch {
      return {}
    }
  }
  return Object.fromEntries(new URLSearchParams(raw))
}
