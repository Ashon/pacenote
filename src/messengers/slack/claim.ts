import { App, SocketModeReceiver } from '@slack/bolt'
import { localized, type Locale } from '../../i18n/locale.js'
import type { Logger } from '../../logger.js'
import type { ClaimedUser } from '../../settings/setup.js'
import { slackApiBase } from './api.js'
import { text } from './claim.text.js'
import { slackLogger } from './logger.js'

export interface ClaimListener {
  stop(): Promise<void>
}

/**
 * "@Pace it's me": before Pace answers anyone, setup listens on your own Slack
 * app for a mention and says who made it, so that person can become the one
 * Pace answers. It reads only who mentioned Pace, where, and the few words they
 * wrote (shown beside their name), tells them alone to confirm in Pacenote,
 * and never asks the AI. People from other organizations in a shared channel
 * are passed over.
 */
export async function listenForClaim(options: {
  appToken: string
  botToken: string
  apiUrl?: string
  log: Logger
  onMention: (user: ClaimedUser) => void
  /** The language of Pace's own notes in Slack (NOTES_LANGUAGE). English */
  notesLocale?: Locale
}): Promise<ClaimListener> {
  const { log } = options
  const apiUrl = slackApiBase(options.apiUrl)
  const receiver = new SocketModeReceiver({
    appToken: options.appToken,
    logger: slackLogger(log.child('socket'), 'info'),
    installerOptions: { clientOptions: { slackApiUrl: apiUrl } },
  })
  const app = new App({
    token: options.botToken,
    receiver,
    logger: slackLogger(log.child('bolt'), 'info'),
    clientOptions: { slackApiUrl: apiUrl },
  })
  const auth = await app.client.auth.test()
  app.event('app_mention', async ({ event, client }) => {
    if (!event.user || event.bot_id) return
    if (event.user_team && auth.team_id && event.user_team !== auth.team_id)
      return
    const [user, channel] = await Promise.all([
      client.users.info({ user: event.user }).catch(() => undefined),
      client.conversations
        .info({ channel: event.channel })
        .catch(() => undefined),
    ])
    const profile = user?.user
    const said = (event.text ?? '')
      .replace(/<@[A-Z0-9]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
    options.onMention({
      id: event.user,
      name: profile?.profile?.display_name || profile?.name || event.user,
      ...(profile?.real_name ? { realName: profile.real_name } : {}),
      channel: channel?.channel?.name
        ? `#${channel.channel.name}`
        : event.channel,
      team: auth.team ?? '',
      ...(said ? { said } : {}),
    })
    await client.chat
      .postEphemeral({
        channel: event.channel,
        user: event.user,
        text: localized(text, options.notesLocale ?? 'en').confirm,
        thread_ts: event.thread_ts,
      })
      .catch((err: unknown) =>
        log.warn(`Could not answer the mention: ${(err as Error).message}`)
      )
  })
  app.error(async (err) => {
    log.warn(`Listening for the mention: ${err.message}`)
  })
  await app.start()
  log.info(`Listening for "@Pace it's me" in ${auth.team ?? 'Slack'}`)
  return {
    async stop() {
      await app.stop()
    },
  }
}
