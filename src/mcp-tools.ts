import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { redactDeep } from './broker/redact.js'

/**
 * What Pacenote's MCP servers (the run history, your tasks, Pace's own tools)
 * share: fields their tools take, and how their results read
 */

/** How many a list gives, at most max: "How many tasks (default 20)" */
export const limitField = (max: number, what: string, byDefault: number) =>
  z
    .number()
    .int()
    .min(1)
    .max(max)
    .optional()
    .describe(`How many ${what} (default ${byDefault})`)

/** The repository a task is about */
export const repoField = () =>
  z.string().optional().describe('The repository it is about, as owner/name')

/** A recap's period, and a day in it */
export const recapFields = () => ({
  period: z.enum(['day', 'week', 'month']),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('A day in the period, YYYY-MM-DD; today by default'),
})

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
