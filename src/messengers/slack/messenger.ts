import type { AppMentionEvent } from '@slack/types'
import type { WebClient } from '@slack/web-api'
import type { Logger } from '../../logger.js'
import type {
  ContextMessage,
  Download,
  Mark,
  Mention,
  MessageFile,
  Messenger,
  MessengerProfile,
  Request,
  Upload,
  Venue,
} from '../types.js'
import type { Directory } from './directory.js'
import {
  downloadSlackFile,
  settle,
  toMessageFile,
  type SlackFileAccess,
  type SlackFileRef,
} from './files.js'
import { chunkText } from '../text.js'
import {
  extractUserIds,
  renderSlackText,
  SLACK_CHUNK_LIMIT,
  slackPermalink,
  stripBotMention,
  toSlackMrkdwn,
} from './format.js'

/** Messages before a mention outside a thread, for context */
const ROOT_CONTEXT_MESSAGES = 10
/** Thread replies read for context */
const THREAD_CONTEXT_MESSAGES = 100
/** Files looked up again with files.info per request */
const MAX_FILE_LOOKUPS = 10
/** The reactions Pace puts on a mention while it works on it */
const REACTIONS: Record<Mark, string> = {
  working: 'eyes',
  slow: 'hourglass_flowing_sand',
}
/**
 * Why reactions do not work, by error, as the status shows it. Pace posts a
 * placeholder instead, which works, so these are limits rather than faults.
 */
const REACTION_LIMITS: Record<string, string> = {
  missing_scope:
    'Slack: the app does not have reactions:write, so Pace posts "Working on it..." while it works instead of reacting with 👀. Adding the scope (slack-app-manifest.yaml) and reinstalling the app turns reactions on.',
  method_not_allowed_by_hub:
    'Slack: the team hub does not relay reactions, so Pace posts "Working on it..." while it works instead of reacting with 👀. Updating the hub turns reactions on.',
}

export interface SlackMessengerOptions {
  client: WebClient
  directory: Directory
  botUserId: string
  /**
   * Workspace URL (https://xxx.slack.com/), for message links in the run
   * history
   */
  workspaceUrl?: string
  files: SlackFileAccess
  allowedUsers: readonly string[]
  /** The bot token's scopes, when Slack said (auth.test) */
  scopes?: readonly string[]
  /** Called when limits changes */
  onLimits?: () => void
  log: Logger
  fetchImpl?: typeof fetch
}

/**
 * Slack through the Web API: the bot's own app (Socket Mode), or the team hub
 * relaying the same calls.
 */
export class SlackMessenger implements Messenger {
  readonly id = 'slack'
  readonly profile: MessengerProfile = {
    name: 'Slack',
    venues: 'public channels',
    markup: 'Slack mrkdwn',
    public: true,
  }
  readonly allowedUsers: readonly string[]
  /** Reaction errors already logged, so each shows once */
  private readonly reactionWarnings = new Set<string>()
  /** Why reactions do not work, until one does */
  private reactionLimit: string | undefined

  constructor(private readonly options: SlackMessengerOptions) {
    this.allowedUsers = options.allowedUsers
    if (options.scopes && !options.scopes.includes('reactions:write'))
      this.reactionLimit = REACTION_LIMITS.missing_scope
  }

  /**
   * What works in a reduced way, for the status: reactions without the scope,
   * found at startup or when a reaction fails
   */
  get limits(): string[] {
    return this.reactionLimit ? [this.reactionLimit] : []
  }

  /**
   * An app_mention event as a Mention. None for mentions the bot does not
   * answer: from other bots and integrations.
   */
  static mention(event: AppMentionEvent): Mention | undefined {
    if (!event.user || event.bot_id) return undefined
    return {
      messenger: 'slack',
      conversation: event.channel,
      message: event.ts,
      thread: event.thread_ts ?? event.ts,
      inThread: Boolean(event.thread_ts),
      userId: event.user,
      text: event.text,
      files: ((event.files ?? []) as SlackFileRef[]).map(toMessageFile),
    }
  }

  async venue(mention: Mention): Promise<Venue> {
    const channel = await this.options.directory.channel(mention.conversation)
    return channel.isPublic
      ? { label: channel.label, answerable: true }
      : {
          label: channel.label,
          answerable: false,
          refusal: 'I only answer in public channels.',
        }
  }

  async request(mention: Mention): Promise<Request> {
    const names = await this.options.directory.userNames([
      mention.userId,
      ...extractUserIds(mention.text),
    ])
    return {
      text: renderSlackText(
        stripBotMention(mention.text, this.options.botUserId),
        names
      ),
      author: this.author(mention.userId, names),
      userName: names.get(mention.userId),
    }
  }

  /** The whole thread inside a thread, or the last few messages outside one */
  async context(
    mention: Mention,
    exclude: readonly string[]
  ): Promise<ContextMessage[]> {
    const { client, directory, log } = this.options
    try {
      const res = mention.inThread
        ? await client.conversations.replies({
            channel: mention.conversation,
            ts: mention.thread,
            limit: THREAD_CONTEXT_MESSAGES,
          })
        : await client.conversations.history({
            channel: mention.conversation,
            latest: mention.message,
            inclusive: false,
            limit: ROOT_CONTEXT_MESSAGES,
          })
      const messages = (res.messages ?? [])
        .filter(
          (m) => m.ts && !exclude.includes(m.ts) && (m.text || m.files?.length)
        )
        .sort((a, b) => Number(a.ts) - Number(b.ts))
      const names = await directory.userNames(
        messages.flatMap((m) => [
          ...(m.user ? [m.user] : []),
          ...extractUserIds(m.text ?? ''),
        ])
      )
      return messages.map((m) => ({
        id: m.ts!,
        at: Number(m.ts) * 1000,
        author: this.author(m.user, names),
        text: renderSlackText(m.text ?? '', names),
        files: ((m.files ?? []) as SlackFileRef[]).map(toMessageFile),
      }))
    } catch (err) {
      log.warn(`Failed to load conversation context: ${(err as Error).message}`)
      return []
    }
  }

  /**
   * Fills in files that arrived as a summary (file_access=check_file_info,
   * etc.) with files.info.
   */
  async resolveFiles(files: MessageFile[]): Promise<MessageFile[]> {
    const { client, log } = this.options
    let lookups = 0
    const resolved: MessageFile[] = []
    for (const file of files) {
      if (!file.partial || !file.id || lookups >= MAX_FILE_LOOKUPS) {
        resolved.push(settle(file))
        continue
      }
      lookups += 1
      try {
        const res = await client.files.info({ file: file.id })
        resolved.push(
          settle(
            toMessageFile({ name: file.name, ...(res.file as SlackFileRef) })
          )
        )
      } catch (err) {
        log.warn(`files.info failed for ${file.id}: ${(err as Error).message}`)
        resolved.push(settle(file))
      }
    }
    return resolved
  }

  download(file: MessageFile): Promise<Download> {
    return downloadSlackFile(file, this.options.files, this.options.fetchImpl)
  }

  async notice(mention: Mention, text: string): Promise<void> {
    await this.options.client.chat
      .postEphemeral({
        channel: mention.conversation,
        user: mention.userId,
        text,
        thread_ts: mention.inThread ? mention.thread : undefined,
      })
      .catch((err: unknown) =>
        this.options.log.warn(
          `Failed to send notice: ${(err as Error).message}`
        )
      )
  }

  async post(mention: Mention, text: string): Promise<string> {
    const res = await this.options.client.chat.postMessage({
      channel: mention.conversation,
      thread_ts: mention.thread,
      text,
    })
    return res.ts!
  }

  async update(mention: Mention, message: string, text: string): Promise<void> {
    await this.options.client.chat.update({
      channel: mention.conversation,
      ts: message,
      text,
    })
  }

  async remove(mention: Mention, message: string): Promise<boolean> {
    try {
      await this.options.client.chat.delete({
        channel: mention.conversation,
        ts: message,
      })
      return true
    } catch (err) {
      this.options.log.warn(
        `Could not delete the placeholder message (${slackError(err)}).`
      )
      return false
    }
  }

  async upload(mention: Mention, files: Upload[]): Promise<void> {
    await this.options.client.files.uploadV2({
      channel_id: mention.conversation,
      thread_ts: mention.thread,
      file_uploads: files.map(({ data, filename, title }) => ({
        file: data,
        filename,
        title,
      })),
    })
  }

  async mark(mention: Mention, mark: Mark): Promise<boolean> {
    try {
      await this.options.client.reactions.add({
        channel: mention.conversation,
        timestamp: mention.message,
        name: REACTIONS[mark],
      })
      this.setReactionLimit(undefined)
      return true
    } catch (err) {
      const error = slackError(err)
      // Still there from before a restart
      if (error === 'already_reacted') return true
      const limit = REACTION_LIMITS[error]
      if (limit) this.setReactionLimit(limit)
      this.warnReaction(
        error,
        limit ??
          `Could not react to a mention (${error}); posting "Working on it..." instead.`
      )
      return false
    }
  }

  async unmark(mention: Mention, mark: Mark): Promise<void> {
    await this.options.client.reactions
      .remove({
        channel: mention.conversation,
        timestamp: mention.message,
        name: REACTIONS[mark],
      })
      .catch((err: unknown) => {
        const error = slackError(err)
        if (error !== 'no_reaction')
          this.warnReaction(
            `remove:${error}`,
            `Could not take a reaction off a mention (${error}).`
          )
      })
  }

  render(markdown: string): string[] {
    return chunkText(toSlackMrkdwn(markdown), SLACK_CHUNK_LIMIT)
  }

  permalink(mention: Mention, message: string): string | undefined {
    const { workspaceUrl } = this.options
    return workspaceUrl
      ? slackPermalink(
          workspaceUrl,
          mention.conversation,
          message,
          mention.thread
        )
      : undefined
  }

  private setReactionLimit(limit: string | undefined): void {
    if (limit === this.reactionLimit) return
    this.reactionLimit = limit
    this.options.onLimits?.()
  }

  private warnReaction(key: string, message: string): void {
    if (this.reactionWarnings.has(key)) return
    this.reactionWarnings.add(key)
    this.options.log.warn(message)
  }

  private author(
    userId: string | undefined,
    names: Map<string, string>
  ): string {
    if (!userId) return '(bot)'
    const bot = userId === this.options.botUserId ? ' (bot)' : ''
    return `@${names.get(userId) ?? userId}${bot}`
  }
}

/** The error code of a failed Web API call (missing_scope), or its message */
function slackError(err: unknown): string {
  const code = (err as { data?: { error?: unknown } }).data?.error
  return typeof code === 'string' ? code : (err as Error).message
}
