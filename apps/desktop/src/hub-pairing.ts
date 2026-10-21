import { hostname } from 'node:os'
import { HubClient, newHubToken } from '../../../src/hub/client.js'
import { localized } from '../../../src/i18n/locale.js'
import type {
  PairConfirmResponse,
  PairStartResponse,
  PairStatus,
} from '../../../src/hub/protocol.js'
import type { SettingsIssue } from '../../../src/settings/fields.js'
import type { SettingsStore } from './settings.js'
import { text } from './hub-pairing.text.js'

/**
 * Pairs this desktop with the team hub (docs/team-hub.md). The token is made
 * here and stays in the main process until it is saved to the settings file;
 * the UI only sees the code and who sent it.
 */
export class HubPairing {
  private pending?: {
    client: HubClient
    url: string
    pairingId: string
    token: string
  }

  constructor(
    private readonly settings: SettingsStore,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async start(url: unknown): Promise<PairStartResponse> {
    const given = typeof url === 'string' ? url.trim() : ''
    if (
      !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$))/.test(
        given
      )
    )
      throw new Error(
        /^http:\/\//.test(given)
          ? localized(text).useHttps
          : localized(text).enterAddress
      )
    const hubUrl = given.replace(/\/+$/, '')
    const client = new HubClient(hubUrl, this.fetchImpl)
    const { token, tokenHash } = newHubToken()
    const started = await client
      .pairStart(tokenHash, hostname().replace(/\.local$/, ''))
      .catch((err: unknown) => {
        throw new Error(pairStartFailure(hubUrl, (err as Error).message))
      })
    this.pending = { client, url: hubUrl, pairingId: started.pairingId, token }
    return started
  }

  status(): Promise<PairStatus> {
    if (!this.pending) return Promise.resolve({ status: 'expired' })
    return this.pending.client.pairStatus(this.pending.pairingId)
  }

  /**
   * Confirms the member who sent the code, then saves the hub connection to
   * the settings file.
   */
  async confirm(): Promise<PairConfirmResponse & { issues: SettingsIssue[] }> {
    const pending = this.pending
    if (!pending) throw new Error(localized(text).noPairing)
    const confirmed = await pending.client.pairConfirm(
      pending.pairingId,
      pending.token
    )
    this.pending = undefined
    const issues = this.settings.save({
      SLACK_CONNECTION: 'hub',
      HUB_URL: pending.url,
      HUB_TOKEN: pending.token,
    })
    return { ...confirmed, issues }
  }

  cancel(): void {
    this.pending = undefined
  }

  /** Unpairs at the hub (best effort) and forgets the token. */
  async disconnect(env: NodeJS.ProcessEnv): Promise<SettingsIssue[]> {
    const url = env.HUB_URL?.trim()
    const token = env.HUB_TOKEN?.trim()
    if (url && token)
      await new HubClient(url, this.fetchImpl)
        .disconnect(token)
        .catch(() => undefined)
    return this.settings.save({ HUB_TOKEN: null })
  }
}

/**
 * Why a hub did not hand out a code, in words that say what to check: the
 * address, the network, or whoever runs the hub
 */
export function pairStartFailure(url: string, error: string): string {
  const t = localized(text)
  if (
    /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|getaddrinfo|certificate|self.signed/i.test(
      error
    )
  )
    return t.unreachable(url)
  if (/\bHTTP (404|405)\b/.test(error)) return t.noHub(url)
  if (/\bHTTP 5\d\d\b/.test(error)) return t.hubProblem(url, error)
  return t.turnedDown(url, error)
}
