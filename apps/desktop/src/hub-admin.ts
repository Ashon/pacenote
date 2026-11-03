import { HubClient } from '../../../src/hub/client.js'
import type {
  HubAdminAct,
  HubAdminView,
  HubPerson,
} from '../../../src/hub/protocol.js'
import type { SettingsStore } from './settings.js'

/**
 * Managing the team hub, for its admins (docs/team-hub.md): who may use it,
 * who manages it, and each member's Mac. The hub answers this desktop's own
 * token, which stays in the main process. Errors are the hub's codes
 * (not_admin, not_yourself, set_in_hub_env), not_found from a hub before
 * 0.6.18, or not_paired here.
 */
export class HubAdmin {
  constructor(
    private readonly settings: SettingsStore,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  view(): Promise<HubAdminView> {
    const { client, token } = this.hub()
    return client.admin(token)
  }

  /** The hub checks the change itself */
  act(act: unknown): Promise<HubAdminView> {
    if (!act || typeof act !== 'object' || !('do' in act))
      throw new Error('invalid_request')
    const { client, token } = this.hub()
    return client.adminAct(token, act as HubAdminAct)
  }

  async people(words: unknown): Promise<HubPerson[]> {
    const q = typeof words === 'string' ? words.trim().slice(0, 100) : ''
    if (!q) return []
    const { client, token } = this.hub()
    return (await client.people(token, q)).people
  }

  private hub(): { client: HubClient; token: string } {
    const env = this.settings.effectiveEnv()
    const url = env.HUB_URL?.trim()
    const token = env.HUB_TOKEN?.trim()
    if (env.SLACK_CONNECTION !== 'hub' || !url || !token)
      throw new Error('not_paired')
    return { client: new HubClient(url, this.fetchImpl), token }
  }
}
