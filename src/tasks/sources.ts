import { localized } from '../i18n/locale.js'
import type { ReasonerId } from '../reasoners/ids.js'
import { text, type ReadTool } from './sources.text.js'

/**
 * Where your tasks come from: the connectors of your AI tool (the Slack
 * connector of Claude, or ChatGPT's Slack app for Codex). The provider holds
 * the access and does the reading; Pacenote knows, for each source, only what
 * keeps a collection safe and its results in order: the connector's tools a
 * collection may use (reading only), those it never may, how to read the
 * source's message links, and how a task from it is keyed. A connector that is
 * not here is not used.
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

/**
 * A source's connector in one CLI: the MCP server it shows as, its tools'
 * prefix, and where the user connects it
 */
export interface Connector {
  server: string
  prefix: string
  /** Where it is connected, as the user finds it, in the app's language */
  readonly where: string
  /** codex: the app's id, the only app a collection turns on */
  app?: string
}

export interface Source {
  id: SourceId
  /** As people name it: "Slack" */
  label: string
  /**
   * Its connector in each CLI. Their read tools have the same names; codex's
   * Slack app has more that write, which a collection never turns on.
   */
  connectors: Record<ReasonerId, Connector>
  /**
   * The connector's tools a collection may use, all reading only (what each
   * does, as the run history's Lookups name it, is in sources.text.ts)
   */
  reads: readonly ReadTool[]
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
    connectors: {
      claude: {
        server: 'claude.ai Slack',
        prefix: 'mcp__claude_ai_Slack__',
        get where() {
          return localized(text).slackWhere.claude
        },
      },
      // ChatGPT's Slack app, as codex's apps server (codex_apps) serves it:
      // its tools are slack.<name>. The id is the app's in OpenAI's catalog.
      codex: {
        server: 'codex_apps',
        prefix: 'slack.',
        get where() {
          return localized(text).slackWhere.codex
        },
        app: 'asdk_app_69a1d78e929881919bba0dbda1f6436d',
      },
    },
    reads: [
      'slack_search_public',
      'slack_search_public_and_private',
      'slack_search_channels',
      'slack_search_users',
      'slack_read_channel',
      'slack_read_thread',
      'slack_get_reactions',
      'slack_list_user_channels',
      'slack_list_channel_members',
      'slack_read_user_profile',
    ],
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

/**
 * The tools a Claude Code collection reading these sources may use, by full
 * name
 */
export const readTools = (ids: readonly SourceId[]): string[] =>
  ids.flatMap((id) => {
    const { connectors, reads } = SOURCES[id]
    return reads.map((tool) => connectors.claude.prefix + tool)
  })

/** Every source's tools that write in Claude Code, by full name: denied */
export const writeTools = (): string[] =>
  SOURCE_IDS.flatMap((id) => {
    const { connectors, writes } = SOURCES[id]
    return writes.map((tool) => connectors.claude.prefix + tool)
  })

/** The source a connector's tool belongs to, by its name in the CLI */
export const sourceOfTool = (
  tool: string,
  cli: ReasonerId = 'claude'
): Source | undefined =>
  SOURCE_IDS.map((id) => SOURCES[id]).find((source) =>
    tool.startsWith(source.connectors[cli].prefix)
  )

/**
 * What a connector's tool did, as a person reads it in the app's language: by
 * its name, or as codex names it (slack.slack_read_thread)
 */
export const lookupLabel = (tool: string): string | undefined => {
  const name = tool.replace(/^[a-z]+\./, '')
  const read = SOURCE_IDS.flatMap((id) => SOURCES[id].reads).find(
    (each) => each === name
  )
  return read && localized(text).reads[read]
}
