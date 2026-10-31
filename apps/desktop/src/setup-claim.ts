import { getLocale, isLocale, localized } from '../../../src/i18n/locale.js'
import type { Logger } from '../../../src/logger.js'
import {
  listenForClaim,
  type ClaimListener,
} from '../../../src/messengers/slack/claim.js'
import type { BotSupervisor } from './bot.js'
import { text } from './main.text.js'
import type { SettingsStore } from './settings.js'
import type { SetupStore } from './setup.js'
import type { MainWindow } from './window.js'

/**
 * Setup listening for "@Pace it's me" on your own Slack app, until you say
 * who of those who answered is you. Pace on the same app would take some of
 * the mentions meanwhile, so it stops while setup listens and runs again if
 * you leave without confirming anyone. Listening starts, stops and is
 * confirmed one at a time, in the order asked: a screen left while it still
 * connects stops the listener it was waiting for.
 */
export class SetupClaim {
  private listener: ClaimListener | undefined
  /**
   * Pace was running when listening began, and runs again if listening ends
   * without anyone confirmed
   */
  private paused = false
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly options: {
      settings: SettingsStore
      setup: SetupStore
      supervisor: BotSupervisor | undefined
      window: MainWindow
      log: Logger
    }
  ) {}

  /** Listens on the Slack app the settings name */
  start(): Promise<{ ok: true }> {
    return this.step(async () => {
      await this.stopListening()
      const { settings, supervisor, window, log } = this.options
      const env = settings.effectiveEnv()
      const appToken = env.SLACK_APP_TOKEN?.trim()
      const botToken = env.SLACK_BOT_TOKEN?.trim()
      if (!appToken || !botToken)
        throw new Error(localized(text).bothTokensFirst)
      if (supervisor?.current.phase === 'external')
        throw new Error(localized(text).runningElsewhere)
      if (supervisor?.managing) {
        this.paused = true
        await supervisor.stop()
      }
      this.listener = await listenForClaim({
        appToken,
        botToken,
        apiUrl: env.SLACK_API_URL,
        // The reply is for you: in Pace's notes language once chosen, the
        // app's until then
        notesLocale: isLocale(env.NOTES_LANGUAGE)
          ? env.NOTES_LANGUAGE
          : getLocale(),
        log: log.child('setup'),
        onMention: (user) => window.send('pacenote:setup:claimed', user),
      })
      return { ok: true as const }
    })
  }

  /** You are this one of those who answered */
  confirm(
    raw: unknown
  ): Promise<{ issues: ReturnType<SettingsStore['save']> }> {
    return this.step(async () => {
      const user = (raw ?? {}) as { id?: unknown; name?: unknown }
      if (
        typeof user.id !== 'string' ||
        !/^[UW][A-Z0-9]+$/.test(user.id) ||
        typeof user.name !== 'string'
      )
        throw new Error(localized(text).notAMember)
      await this.stopListening()
      // Pace answers only you, so this is the one it answers: saying it
      // again replaces the one before, and a wrong "Yes" is undone by the
      // right one.
      const issues = this.options.settings.save({
        MENTION_ALLOWED_USERS: user.id,
      })
      if (issues.length === 0) {
        this.paused = false
        this.options.setup.save({ me: { id: user.id, name: user.name } })
      }
      return { issues }
    })
  }

  /** Left without confirming: Pace runs again if listening stopped it. */
  leave(): Promise<void> {
    return this.step(async () => {
      await this.stopListening()
      if (this.paused) {
        this.paused = false
        await this.options.supervisor?.start()
      }
    })
  }

  /**
   * Pace starts here or answers elsewhere: it takes the mentions from here on,
   * so setup stops listening rather than share them.
   */
  paceStarted(elsewhere: boolean): void {
    if (!this.listener) return
    void this.step(async () => {
      if (!this.listener) return
      await this.stopListening()
      this.paused = false
      this.options.window.send(
        'pacenote:setup:claim-ended',
        elsewhere
          ? localized(text).startedElsewhere
          : localized(text).startedHere
      )
    })
  }

  /** The app quits */
  stop(): Promise<void> {
    return this.stopListening()
  }

  private async stopListening(): Promise<void> {
    const listening = this.listener
    this.listener = undefined
    await listening?.stop().catch(() => undefined)
  }

  private step<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }
}
