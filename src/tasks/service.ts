import { WebClient } from '@slack/web-api'
import type { Logger } from '../logger.js'
import type { Reasoner } from '../reasoners/types.js'
import { collectTasks } from './collect.js'
import type { TasksSettings } from './settings.js'
import type { SlackUserClient } from './slack.js'
import type { TasksStatus } from './types.js'

export interface TasksServiceOptions {
  dataDir: string
  timezone: string
  /**
   * The Slack Web API base for the user token; undefined through the team hub,
   * where tasks are not available yet
   */
  slackApiUrl?: string
  /** A reasoner with no tools */
  reasoner: Pick<Reasoner, 'complete'>
  settings: () => TasksSettings
  onStatus: (status: TasksStatus) => void
  log: Logger
  /** For tests: the Slack client for a token */
  client?: (token: string) => SlackUserClient
}

/**
 * Collects your tasks when the desktop app asks (Collect now), one collection
 * at a time, and reports how it goes in the bot status.
 */
export class TasksService {
  private state: TasksStatus

  constructor(private readonly options: TasksServiceOptions) {
    this.state = this.idle()
  }

  get status(): TasksStatus {
    return this.state
  }

  async collect(): Promise<void> {
    if (this.state.state === 'collecting') return
    const settings = this.options.settings()
    const off = this.offReason(settings)
    if (off) {
      this.set({ ...this.idle(), error: off })
      return
    }
    const { log } = this.options
    const client =
      this.options.client?.(settings.userToken!) ??
      new WebClient(settings.userToken, {
        slackApiUrl: this.options.slackApiUrl,
      })
    this.set({ state: 'collecting', step: 'reading', detail: 'Reading Slack' })
    try {
      const result = await collectTasks({
        client,
        dataDir: this.options.dataDir,
        reasoner: this.options.reasoner,
        timezone: this.options.timezone,
        dms: settings.dms,
        exclude: settings.exclude,
        log,
        onStep: (step) =>
          this.set({
            state: 'collecting',
            step,
            detail: step === 'reading' ? 'Reading Slack' : 'Picking out tasks',
          }),
      })
      log.info(
        `Collected tasks: ${result.found} new, ${result.closed} closed by themselves, ${result.looked} places looked at`
      )
      this.set({ state: 'idle', collectedAt: new Date().toISOString() })
    } catch (err) {
      const message = slackError(err) ?? (err as Error).message
      log.warn(`Collecting tasks failed: ${message}`)
      this.set({ ...this.idle(), error: message })
    }
  }

  private idle(): TasksStatus {
    const off = this.offReason(this.options.settings())
    return off
      ? { state: 'off', detail: off, collectedAt: this.state?.collectedAt }
      : { state: 'idle', collectedAt: this.state?.collectedAt }
  }

  private offReason(settings: TasksSettings): string | undefined {
    if (!settings.on) return 'Tasks are off. Turn them on in Settings > Tasks.'
    if (this.options.slackApiUrl === undefined)
      return 'Tasks work with your own Slack app for now, not through the team hub.'
    if (!settings.userToken)
      return 'Tasks need a Slack user token. Add it in Settings > Tasks.'
    return undefined
  }

  private set(status: TasksStatus): void {
    this.state = status
    this.options.onStatus(status)
  }
}

/** Slack's reasons, said plainly where it helps */
function slackError(err: unknown): string | undefined {
  const code = (err as { data?: { error?: unknown } }).data?.error
  if (typeof code !== 'string') return undefined
  if (code === 'missing_scope')
    return 'The Slack user token lacks a scope tasks need (channels:history, groups:history, channels:read, groups:read, users:read; im and mpim ones for DMs). Add them to the app and reinstall it.'
  if (
    code === 'invalid_auth' ||
    code === 'token_revoked' ||
    code === 'not_authed'
  )
    return 'Slack rejected the user token. Get it again from OAuth & Permissions and save it in Settings > Tasks.'
  return `Slack answered ${code}.`
}
