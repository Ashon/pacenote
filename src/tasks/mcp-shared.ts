import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { Locale } from '../i18n/locale.js'
import { errorResult, jsonResult } from '../mcp-tools.js'
import type { TaskToolsOptions } from './mcp.js'
import { NOTE } from './prompts.js'
import type { TaskActivity } from './types.js'

/**
 * What the groups of task tools share (registerTaskTools in
 * src/tasks/mcp.ts): the server they are on, its options and clock, the AI
 * tool connected, and how a tool answers.
 */
export interface TaskTools {
  server: McpServer
  options: TaskToolsOptions
  /** The clock: options.now, else the real one */
  now: () => number
  /** The AI tool connected, by the name it gives itself */
  client: () => string | undefined
  /**
   * The user's language when the server started, for what the tools ask the
   * AI to write; collect_context reads it again each time
   */
  locale: Locale
  /** "in <the user's language>", for the fields the AI writes for the user */
  inTheirs: string
  /** What the tool is doing, for the app to show as it happens (activity.ts) */
  track: (event: Omit<TaskActivity, 'at' | 'by' | 'app'>) => void
}

const OFF =
  'Adding tasks is off. Turn it on in Pacenote: Settings > Todo > Gather ' +
  'my tasks from Slack.'

/** A task, as the tools that take one name it */
export const taskRef = () =>
  z.string().describe("The task id or its message's link")

/**
 * A tool's result: what build gives, or while tasks are off, how to turn them
 * on
 */
export async function respond(
  options: TaskToolsOptions,
  build: () => object | Promise<object>
): Promise<CallToolResult> {
  if (!options.settings().on) return errorResult(OFF)
  return jsonResult(NOTE, build)
}
