import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { userLocale } from '../i18n/user.js'
import { recordActivity } from './activity.js'
import { registerChangeTools } from './mcp-change.js'
import { registerCollectionTools } from './mcp-collect.js'
import { registerTaskPrompts } from './mcp-prompts.js'
import { registerReadTools } from './mcp-read.js'
import type { TaskTools } from './mcp-shared.js'
import { inUserLanguage } from './prompts.js'
import type { TasksSettings } from './settings.js'
import type { RelatedRun } from './types.js'

/**
 * Your tasks over MCP: an AI tool with a Slack connector (Claude Code, Codex)
 * reads Slack itself and adds what people asked of you through these tools;
 * Pacenote keeps the list, and the desktop app shows it. Pacenote holds no
 * Slack token for this. The tools open only while Settings > Todo > Gather
 * my tasks from Slack is on, read on every call.
 */
export interface TaskToolsOptions {
  dataDir: string
  settings: () => TasksSettings
  /**
   * Pace's runs in a thread, for task_context; undefined while the run history
   * is not shared with AI tools
   */
  runs?: (conversation: string, thread: string) => RelatedRun[] | undefined
  /**
   * The home folder, where Claude Code's and Codex's session logs are: the
   * remotes of the folders you worked in lately are among your repositories
   * (collect_context). Without it, only the ones with a folder remembered.
   */
  home?: string
  /**
   * Launched by the app for a collection or a draft of its own, which show
   * their own progress: the activity it records says so
   */
  app?: boolean
  /**
   * The repository of the folder the AI tool runs in (the server's working
   * folder), as owner/name: its open tasks go into the server's instructions
   */
  repo?: string
  /** The clock, for the tests: when activity happened, and what is recent */
  now?: () => number
}

/**
 * Registers the task prompts and tools on a server: the prompts
 * (mcp-prompts.ts), then the tools a collection reads Slack with
 * (mcp-collect.ts), those that change a task (mcp-change.ts) and those that
 * read the user's tasks and work (mcp-read.ts). What they tell the AI in
 * words is in prompts.ts.
 */
export function registerTaskTools(
  server: McpServer,
  options: TaskToolsOptions
): void {
  const now = options.now ?? Date.now
  const client = () => server.server.getClientVersion()?.name
  // The user's language when the server started, for what the tools ask the
  // AI to write; collect_context reads it again each time
  const locale = userLocale(options.dataDir)
  const tools: TaskTools = {
    server,
    options,
    now,
    client,
    locale,
    inTheirs: inUserLanguage(locale),
    // What the tool is doing, for the app to show as it happens (activity.ts)
    track: (event) =>
      recordActivity(options.dataDir, {
        at: new Date(now()).toISOString(),
        by: client(),
        ...(options.app ? { app: true } : {}),
        ...event,
      }),
  }
  registerTaskPrompts(tools)
  registerCollectionTools(tools)
  registerChangeTools(tools)
  registerReadTools(tools)
}
