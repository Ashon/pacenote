import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { redactDeep } from './broker/redact.js'

/**
 * Tool results as Pacenote's MCP servers give them (the run history, your
 * tasks, Pace's own tools)
 */

export const errorResult = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
})

/**
 * What build gives, after a note that it is data, as JSON with secrets
 * redacted in every string; the message of what it throws as an error
 */
export async function jsonResult(
  note: string,
  build: () => object | Promise<object>
): Promise<CallToolResult> {
  try {
    const body = redactDeep({ note, ...(await build()) })
    return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] }
  } catch (error) {
    return errorResult((error as Error).message)
  }
}
