/**
 * What the bot needs from a chat app (Slack today). A messenger turns the app's
 * events into Mentions and carries out the answer's side: reading the
 * conversation, fetching attached files, reacting, posting, editing and
 * uploading. The mention pipeline (src/mention) works only through this
 * interface, so a new chat app is a new adapter in src/messengers/<id> (with
 * its id in ids.ts) and nothing in the pipeline changes.
 *
 * Everything in a Mention is plain JSON, since an interrupted mention is stored
 * (inflight.json) and resumed after a restart.
 */

import type { MessengerId } from './ids.js'

export type { MessengerId }

/** A message that asks the bot something */
export interface Mention {
  messenger: MessengerId
  /** Where it was posted: a Slack channel ID */
  conversation: string
  /** The message's ID in the conversation (Slack ts) */
  message: string
  /**
   * The thread the answer goes to. For a message outside a thread, the message
   * itself starts one.
   */
  thread: string
  /**
   * Posted as a reply in an existing thread, so the whole thread is context
   * (otherwise the messages before it)
   */
  inThread: boolean
  userId: string
  /** The text in the messenger's own markup */
  text: string
  files: MessageFile[]
}

/** A file attached to a message, as the messenger describes it */
export interface MessageFile {
  id?: string
  name: string
  mimetype?: string
  /**
   * The messenger's own type label when the MIME type is vague (Slack filetype
   * such as "python")
   */
  filetype?: string
  /** Text pasted as a snippet (always text) */
  snippet?: boolean
  size?: number
  /** What the messenger downloads it with (Slack: the private download URL) */
  handle?: string
  /** Only a summary arrived with the message; resolveFiles fills in the rest */
  partial?: boolean
  /**
   * Why the file cannot be read, when the messenger already knows (an external
   * file, no download access)
   */
  unreadable?: string
}

/**
 * An earlier message in the conversation, already readable: names in place of
 * IDs, markup resolved
 */
export interface ContextMessage {
  id: string
  /** Epoch milliseconds */
  at: number
  /** "@alice", or "@pace (bot)" for the bot's own messages */
  author: string
  text: string
  files: MessageFile[]
}

/** Where a mention came from */
export interface Venue {
  /** For the prompt, the run history and logs: "#ops" */
  label: string
  /** Whether the bot answers there (Slack: public channels only) */
  answerable: boolean
  /** Told to the asker when it does not */
  refusal?: string
}

/**
 * The request itself: the mention's text without the bot's own name, readable,
 * and who asked
 */
export interface Request {
  text: string
  author: string
  /** The asker's display name without "@", for the run history */
  userName?: string
}

export interface Download {
  contentType: string
  data: Buffer
}

export interface Upload {
  data: Buffer
  filename: string
  title: string
}

/**
 * A reaction the bot puts on a mention while it works on it: working (Slack:
 * 👀) from the start, slow (⏳) once it takes long
 */
export type Mark = 'working' | 'slow'

/** How answers read in this messenger, for the system prompt */
export interface MessengerProfile {
  /** "Slack": the bot "answers mentions in Slack public channels" */
  name: string
  /** "public channels" */
  venues: string
  /** The markup the model writes in: "Slack mrkdwn" */
  markup: string
  /**
   * Everyone in the conversation sees the answer, so secrets and personal data
   * stay out of it
   */
  public: boolean
}

export interface Messenger {
  readonly id: MessengerId
  readonly profile: MessengerProfile
  /** User IDs allowed to ask; empty allows everyone */
  readonly allowedUsers: readonly string[]

  venue(mention: Mention): Promise<Venue>
  request(mention: Mention): Promise<Request>
  /**
   * Earlier messages for context, oldest first, without the given message IDs
   * (the mention, the placeholder)
   */
  context(
    mention: Mention,
    exclude: readonly string[]
  ): Promise<ContextMessage[]>
  /**
   * Fills in files that arrived as a summary. Files it cannot fill in come back
   * with unreadable set.
   */
  resolveFiles(files: MessageFile[]): Promise<MessageFile[]>
  download(file: MessageFile): Promise<Download>

  /**
   * A short message only the asker sees, when the messenger can (otherwise in
   * the thread)
   */
  notice(mention: Mention, text: string): Promise<void>
  /** Posts to the mention's thread and returns the new message's ID */
  post(mention: Mention, text: string): Promise<string>
  update(mention: Mention, message: string, text: string): Promise<void>
  upload(mention: Mention, files: Upload[]): Promise<void>
  /**
   * Puts a reaction on the mention: the quiet way to say the bot has it, with
   * no message in the conversation and no notification. False when it could
   * not (Slack: the app lacks reactions:write); the pipeline then posts a
   * placeholder message instead, as it does for a messenger without mark.
   */
  mark?(mention: Mention, mark: Mark): Promise<boolean>
  /** Takes the reaction off again; never fails */
  unmark?(mention: Mention, mark: Mark): Promise<void>

  /**
   * The model's Markdown in the messenger's markup, split into messages that
   * fit
   */
  render(markdown: string): string[]
  /**
   * A link to a message in the mention's conversation, if the messenger has one
   */
  permalink(mention: Mention, message: string): string | undefined
}

/**
 * A messenger's live connection, which delivers mentions from start() until
 * stop()
 */
export interface MessengerConnection {
  readonly messenger: Messenger
  /** Who the bot is there, for the status file */
  readonly bot: { user: string; userId: string; team: string }
  /**
   * What does not work as it should, for the status file (Slack: a scope the
   * app lacks)
   */
  problems(): string[]
  start(onMention: (mention: Mention) => Promise<void>): Promise<void>
  stop(): Promise<void>
}

/**
 * The key that tells one mention from another across messengers (redelivered
 * events, inflight.json)
 */
export function mentionKey(
  mention: Pick<Mention, 'messenger' | 'conversation' | 'message'>
): string {
  return `${mention.messenger}:${mention.conversation}:${mention.message}`
}
