import { isHubUrl } from '../../../src/hub/address.js'
import { HubClient, newHubToken } from '../../../src/hub/client.js'
import { hubInstallCommand } from '../../../src/hub/install.js'
import { HUB_PATHS, type HubInstallState } from '../../../src/hub/protocol.js'
import { localized } from '../../../src/i18n/locale.js'
import type { SettingsStore } from './settings.js'
import { text } from './hub-pairing.text.js'

const ID = /^[UW][A-Z0-9]+$/

/**
 * Installing a team hub from Pacenote (deploy/hub/install.sh): writes the
 * command for the server, then waits for the hub at its address and, once it
 * answers, switches Pace to it. To switch with no code to send in Slack, the
 * token is made here and only its hash goes into the command, with your
 * Slack member ID; the hub pairs it once when it first starts (HUB_PAIR). The
 * token stays in this process until it is saved, as in HubPairing.
 */
export class HubInstall {
  private state: HubInstallState = { step: 'idle' }
  private token?: string
  private timer?: NodeJS.Timeout
  private until = 0
  private checking = false

  constructor(
    private readonly options: {
      settings: SettingsStore
      /** Pacenote's version: the installer and the hub image of the same one */
      version: string
      /** Saves have been made; restarts or starts Pace on them */
      apply: () => Promise<boolean>
      onChange: (state: HubInstallState) => void
      fetchImpl?: typeof fetch
      /** How often to look for the hub, and for how long */
      pollMs?: number
      waitMs?: number
    }
  ) {}

  current(): HubInstallState {
    return this.state
  }

  /**
   * The command for these choices. switchHere: Pace switches to the hub once
   * it answers (Settings); otherwise this Mac pairs with a code (setup, which
   * starts Pace after its review).
   */
  command(input: unknown): HubInstallState {
    const given = (input ?? {}) as Record<string, unknown>
    const t = localized(text)
    const url = String(given.url ?? '')
      .trim()
      .replace(/\/+$/, '')
    if (!isHubUrl(url))
      throw new Error(/^http:\/\//.test(url) ? t.useHttps : t.enterAddress)
    const allow = String(given.allow ?? '')
      .split(',')
      .map((id) => id.trim().toUpperCase())
      .filter(Boolean)
    if (allow.some((id) => !ID.test(id))) throw new Error(t.memberIds)
    const lang = given.lang === 'ko' ? 'ko' : 'en'
    // You, as Pace answers you now: your own Slack app's member ID
    const values = this.options.settings.fileValues()
    const member =
      values.SLACK_CONNECTION === 'hub'
        ? undefined
        : (values.MENTION_ALLOWED_USERS ?? '')
            .split(',')
            .map((id) => id.trim().toUpperCase())
            .find((id) => ID.test(id))
    const switches = given.switchHere === true && Boolean(member)
    const made = switches ? newHubToken() : undefined
    this.token = made?.token
    const command = hubInstallCommand({
      version: this.options.version,
      url,
      // You can always use the hub you install
      allow:
        member && allow.length > 0 && !allow.includes(member)
          ? [member, ...allow]
          : allow,
      lang,
      pair:
        made && member
          ? { user: member, tokenHash: made.tokenHash }
          : undefined,
    })
    this.set({ step: 'waiting', url, command, switches })
    this.wait()
    return this.state
  }

  /** Looks for the hub every so often, for a while, from now */
  private wait(): void {
    this.until = Date.now() + (this.options.waitMs ?? 30 * 60_000)
    clearInterval(this.timer)
    this.timer = setInterval(
      () => void this.check(),
      this.options.pollMs ?? 2_000
    )
    void this.check()
  }

  /**
   * Waits again after giving up, for the same command: the one already run
   * on the server still pairs this Mac
   */
  resume(): HubInstallState {
    const state = this.state
    if (state.step !== 'gave-up') return state
    this.set({
      step: 'waiting',
      url: state.url,
      command: state.command,
      switches: Boolean(this.token),
    })
    this.wait()
    return this.state
  }

  cancel(): void {
    clearInterval(this.timer)
    this.token = undefined
    this.set({ step: 'idle' })
  }

  /**
   * Looks for the hub now (a pacenote:// link for it came back from the
   * installer): it answers when the installer says it does.
   */
  async check(url?: string): Promise<void> {
    const state = this.state
    if (state.step !== 'waiting' && state.step !== 'gave-up') return
    if (url && url !== state.url) return
    if (this.checking) return
    this.checking = true
    try {
      if (!(await this.answers(state.url))) {
        if (state.step === 'waiting' && Date.now() > this.until) {
          clearInterval(this.timer)
          this.set({ step: 'gave-up', url: state.url, command: state.command })
        }
        return
      }
      clearInterval(this.timer)
      const token = this.token
      if (!token) return this.set({ step: 'up', url: state.url })
      // The hub pairs the installer's desktop before it starts answering.
      const me = await new HubClient(state.url, this.options.fetchImpl)
        .me(token)
        .catch(() => undefined)
      if (!me) return this.set({ step: 'up', url: state.url })
      const issues = this.options.settings.save({
        SLACK_CONNECTION: 'hub',
        HUB_URL: state.url,
        HUB_TOKEN: token,
      })
      this.token = undefined
      if (issues.length > 0) return this.set({ step: 'up', url: state.url })
      const started = await this.options.apply()
      this.set({
        step: 'switched',
        url: state.url,
        user: me.user,
        team: me.team,
        started,
      })
    } finally {
      this.checking = false
    }
  }

  private async answers(url: string): Promise<boolean> {
    const fetchImpl = this.options.fetchImpl ?? fetch
    try {
      const res = await fetchImpl(`${url}${HUB_PATHS.health}`, {
        signal: AbortSignal.timeout(3_000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private set(state: HubInstallState): void {
    this.state = state
    this.options.onChange(state)
  }
}
