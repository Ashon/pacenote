import { App, SocketModeReceiver } from '@slack/bolt'
import type { Config } from '../../config.js'
import { HUB_PATHS } from '../../hub/protocol.js'
import type { Logger } from '../../logger.js'
import type { SocketState } from '../../runtime/types.js'
import type { MessengerConnection } from '../types.js'
import { Directory } from './directory.js'
import { slackFileAccess } from './files.js'
import { HubReceiver } from './hub-receiver.js'
import { slackLogger } from './logger.js'
import { SlackMessenger } from './messenger.js'

/** How each state of the connection is logged */
type States = Record<SocketState, { level: 'info' | 'warn'; text: string }>

const SOCKET_STATES: States = {
  connecting: { level: 'info', text: 'Connecting to Slack' },
  connected: { level: 'info', text: 'Socket Mode connected, receiving events' },
  reconnecting: { level: 'warn', text: 'Socket Mode reconnecting' },
  disconnecting: { level: 'info', text: 'Closing Socket Mode connection' },
  disconnected: { level: 'warn', text: 'Socket Mode disconnected' },
}

const HUB_STATES: States = {
  connecting: { level: 'info', text: 'Connecting to the team hub' },
  connected: {
    level: 'info',
    text: "Connected to the team hub, receiving this member's mentions",
  },
  reconnecting: { level: 'warn', text: 'Reconnecting to the team hub' },
  disconnecting: { level: 'info', text: 'Closing the team hub connection' },
  disconnected: { level: 'warn', text: 'Disconnected from the team hub' },
}

/**
 * Socket Mode with the member's own Slack app, reporting its states and
 * received events
 */
function socketModeReceiver(
  slack: Extract<Config['slack'], { kind: 'app' }>,
  socketLog: Logger,
  level: Config['logLevel'],
  onState: (state: SocketState) => void
): SocketModeReceiver {
  const receiver = new SocketModeReceiver({
    appToken: slack.appToken,
    logger: slackLogger(socketLog, level),
    // apps.connections.open, which hands out the WebSocket URL, goes to the
    // same Web API as everything else.
    installerOptions: { clientOptions: { slackApiUrl: slack.apiUrl } },
    clientPingTimeout: slack.socket.clientPingTimeoutMs,
    serverPingTimeout: slack.socket.serverPingTimeoutMs,
    pingPongLoggingEnabled: slack.socket.pingPongLogging,
  })
  for (const state of Object.keys(SOCKET_STATES) as SocketState[])
    receiver.client.on(state, () => onState(state))
  receiver.client.on(
    'slack_event',
    (args: {
      type?: string
      envelope_id?: string
      retry_num?: number
      body?: { event?: { type?: string } }
    }) => {
      const kind = [args.type, args.body?.event?.type].filter(Boolean).join('/')
      socketLog.info(
        `Received event ${kind} (envelope ${args.envelope_id ?? '-'}${args.retry_num ? `, retry ${args.retry_num}` : ''})`
      )
    }
  )
  return receiver
}

interface SlackConnectOptions {
  config: Config
  log: Logger
  /**
   * The connection's state (Socket Mode, or the hub's websocket), for the
   * status file
   */
  onState: (state: SocketState) => void
  /**
   * The hub refused this desktop for good (revoked, unknown token); the bot
   * cannot go on
   */
  onFatal: (err: Error) => void
  /** Called when the connection's limits() changes */
  onLimits?: () => void
}

/**
 * Connects to Slack with the member's own app (Socket Mode) or through the team
 * hub, and checks who the bot is (auth.test). Mentions start arriving with
 * start().
 */
export async function connectSlack(
  options: SlackConnectOptions
): Promise<MessengerConnection> {
  const { config, log } = options
  const slack = config.slack
  // Sends the Slack connection's logs and Bolt's to the same logger (console +
  // file).
  const socketLog = log.child('socket')
  let stopping = false
  /** Closed on purpose while another of your Macs answers */
  let standingBy = false
  const states = slack.kind === 'hub' ? HUB_STATES : SOCKET_STATES
  const onState = (state: SocketState) => {
    options.onState(state)
    const { level, text } = states[state]
    // Disconnecting during shutdown, or to stand by, is expected.
    socketLog[(stopping || standingBy) && level === 'warn' ? 'info' : level](
      text
    )
  }
  const receiver =
    slack.kind === 'hub'
      ? new HubReceiver({
          url: slack.hubUrl,
          token: slack.hubToken,
          log: socketLog,
          onState,
          onFatal: options.onFatal,
        })
      : socketModeReceiver(slack, socketLog, config.logLevel, onState)

  // With the team hub, Slack Web API calls go to the hub, which makes them with
  // the bot token it keeps.
  const app = new App({
    token: slack.kind === 'hub' ? slack.hubToken : slack.botToken,
    receiver,
    logger: slackLogger(log.child('bolt'), config.logLevel),
    clientOptions: {
      slackApiUrl:
        slack.kind === 'hub' ? `${slack.hubUrl}${HUB_PATHS.api}` : slack.apiUrl,
    },
  })
  const auth = await app.client.auth.test()
  /** Standing by and back, one after another */
  let changing: Promise<void> = Promise.resolve()
  const botUserId = auth.user_id
  if (!botUserId) throw new Error('Could not determine the bot user ID.')

  const messenger = new SlackMessenger({
    client: app.client,
    directory: new Directory(app.client, log.child('directory')),
    botUserId,
    workspaceUrl: auth.url,
    files: slackFileAccess(slack),
    // You, with your own app; with the team hub, the member it connected as
    owner:
      receiver instanceof HubReceiver
        ? () => receiver.member
        : () => config.mention.owner,
    scopes: auth.response_metadata?.scopes,
    notesLocale: config.notesLocale,
    onLimits: options.onLimits,
    log: log.child('slack'),
  })

  return {
    messenger,
    bot: {
      user: auth.user ?? botUserId,
      userId: botUserId,
      team: auth.team ?? '',
    },
    limits: () => messenger.limits,
    async start(onMention, startOptions) {
      app.event('app_mention', async ({ event }) => {
        const mention = SlackMessenger.mention(event, auth.team_id)
        if (mention) await onMention(mention)
      })
      app.error(async (err) => {
        log.error('Slack event handling error', err)
      })
      if (startOptions?.standby && receiver instanceof SocketModeReceiver) {
        standingBy = true
        socketLog.info('Standing by: another of your Macs answers')
        return
      }
      await app.start()
    },
    ...(receiver instanceof SocketModeReceiver
      ? {
          standby: (on: boolean) => {
            // One change at a time, in the order asked
            changing = changing.then(async () => {
              if (stopping || on === standingBy) return
              standingBy = on
              socketLog.info(
                on
                  ? 'Standing by: another of your Macs answers'
                  : 'Answering on this Mac again'
              )
              await (on ? app.stop() : app.start()).catch((err: unknown) =>
                socketLog.warn(
                  `Could not ${on ? 'close' : 'open'} the Slack connection: ${(err as Error).message}`
                )
              )
            })
            return changing
          },
        }
      : {}),
    async stop() {
      stopping = true
      await changing
      if (!standingBy) await app.stop()
    },
  }
}
