/**
 * Where your tasks come from: the connectors of your AI tool (Claude's Slack
 * connector, for now). The provider holds the access and does the reading;
 * Pacenote knows, for each source, only what keeps a collection safe and its
 * results in order: the connector's tools a collection may use (reading only),
 * those it never may, how to read the source's message links, and how a task
 * from it is keyed. A connector that is not here is not used.
 */

export const SOURCE_IDS = ['slack'] as const
export type SourceId = (typeof SOURCE_IDS)[number]

/** The message a link points to, in the source's own terms */
export interface MessageRef {
  /** Where it is: a Slack conversation ID */
  conversation: string
  /** The message: a Slack ts */
  message: string
  /** Its thread, when the link says */
  thread?: string
}

export interface Source {
  id: SourceId
  /** As people name it: "Slack" */
  label: string
  /** Its connector in Claude Code: the MCP server's name, its tools' prefix */
  connector: { server: string; prefix: string }
  /**
   * The connector's tools a collection may use, all reading only, each with
   * what it does as a person reads it (the run history's Lookups)
   */
  reads: Record<string, string>
  /** The connector's tools that write: denied outright, whatever is allowed */
  writes: string[]
  /** The message one of its links points to; undefined for another link */
  parseLink(link: string): MessageRef | undefined
  /** A task's id from its message, so a message is never a task twice */
  taskId(ref: MessageRef): string
  /** When the message was posted (epoch ms), when its reference says */
  postedAt?(ref: MessageRef): number | undefined
}

/**
 * The conversation and message in a Slack permalink:
 * https://acme.slack.com/archives/C123/p1700000000123456?thread_ts=1699.000100
 */
export function parseSlackPermalink(link: string): MessageRef | undefined {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return undefined
  }
  if (!/(^|\.)slack\.com$/.test(url.hostname)) return undefined
  const match = /^\/archives\/([A-Z0-9]+)\/p(\d{7,})$/.exec(url.pathname)
  if (!match) return undefined
  const digits = match[2]!
  const message = `${digits.slice(0, -6)}.${digits.slice(-6)}`
  const thread = url.searchParams.get('thread_ts') ?? undefined
  return { conversation: match[1]!, message, thread }
}

export const SOURCES: Record<SourceId, Source> = {
  slack: {
    id: 'slack',
    label: 'Slack',
    connector: { server: 'claude.ai Slack', prefix: 'mcp__claude_ai_Slack__' },
    reads: {
      slack_search_public: 'Searched public messages',
      slack_search_public_and_private: 'Searched messages',
      slack_search_channels: 'Looked up channels',
      slack_search_users: 'Looked up people',
      slack_read_channel: 'Read a channel',
      slack_read_thread: 'Read a thread',
      slack_get_reactions: 'Checked reactions',
      slack_list_user_channels: 'Listed your channels',
      slack_list_channel_members: 'Listed channel members',
      slack_read_user_profile: 'Looked up a person',
    },
    writes: [
      'slack_send_message',
      'slack_send_message_draft',
      'slack_schedule_message',
      'slack_add_reaction',
      'slack_create_canvas',
      'slack_update_canvas',
    ],
    parseLink: parseSlackPermalink,
    // Slack's tasks were keyed this way before there were other sources.
    taskId: ({ conversation, message }) => `${conversation}:${message}`,
    // A Slack ts is the time it was posted, in seconds.
    postedAt: ({ message }) => Number(message) * 1000,
  },
}

/**
 * Where a task is from: a source's message, or a session on this Mac (local):
 * work left after a task, or something you asked your AI tool to keep
 */
export type TaskOrigin = SourceId | 'local'

/** A task from a session on this Mac, as a source is named */
export const LOCAL = { id: 'local', label: 'This Mac' } as const

/** A task's source; tasks from before there were sources are Slack's */
export const sourceOf = (task: {
  source: { app?: TaskOrigin }
}): { id: TaskOrigin; label: string } =>
  task.source.app === 'local' ? LOCAL : SOURCES[task.source.app ?? 'slack']

/** The sources' names, for what people and tools read: "Slack or Gmail" */
export const sourceNames = (ids: readonly SourceId[] = SOURCE_IDS): string =>
  ids.map((id) => SOURCES[id].label).join(' or ')

/**
 * The source and message a link points to: in the source named, or in
 * whichever source reads it
 */
export function findMessage(
  link: string,
  app?: SourceId
): (MessageRef & { app: SourceId }) | undefined {
  for (const id of app ? [app] : SOURCE_IDS) {
    const ref = SOURCES[id].parseLink(link)
    if (ref) return { app: id, ...ref }
  }
  return undefined
}

/** The tools a collection reading these sources may use, by full name */
export const readTools = (ids: readonly SourceId[]): string[] =>
  ids.flatMap((id) => {
    const { connector, reads } = SOURCES[id]
    return Object.keys(reads).map((tool) => connector.prefix + tool)
  })

/** Every source's tools that write, by full name: never allowed */
export const writeTools = (): string[] =>
  SOURCE_IDS.flatMap((id) => {
    const { connector, writes } = SOURCES[id]
    return writes.map((tool) => connector.prefix + tool)
  })

/** The source a connector's tool belongs to, by its full name */
export const sourceOfTool = (tool: string): Source | undefined =>
  SOURCE_IDS.map((id) => SOURCES[id]).find((source) =>
    tool.startsWith(source.connector.prefix)
  )

/** What a connector's tool did, as a person reads it */
export const lookupLabel = (tool: string): string | undefined => {
  for (const id of SOURCE_IDS) {
    const label = SOURCES[id].reads[tool]
    if (label) return label
  }
  return undefined
}
