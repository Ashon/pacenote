import { z } from 'zod'
import type { TaskTools } from './mcp-shared.js'
import {
  collectPrompt,
  donePrompt,
  recapPromptFor,
  taskPrompt,
} from './prompts.js'

/** A prompt's text, as the user's message */
const userPrompt = (text: string) => ({
  messages: [
    { role: 'user' as const, content: { type: 'text' as const, text } },
  ],
})

/**
 * The prompts an AI tool offers the user: collecting their tasks from Slack,
 * picking one up, wrapping the session up into it, and writing their recap
 */
export function registerTaskPrompts({ server, locale }: TaskTools): void {
  server.registerPrompt(
    'collect_tasks',
    {
      title: 'Collect my tasks from Slack',
      description:
        "Reads Slack with your Slack tools and adds the user's tasks to Pacenote.",
    },
    () => userPrompt(collectPrompt())
  )

  server.registerPrompt(
    'task',
    {
      title: 'Pick up a task',
      description:
        'Brings one of your tasks from Pacenote into this session: what was asked, by whom, and what came before.',
      argsSchema: {
        task: z
          .string()
          .optional()
          .describe("The task: its id, its message's link, or a few words"),
      },
    },
    ({ task }) => userPrompt(taskPrompt(task?.trim() || undefined, locale))
  )

  server.registerPrompt(
    'done',
    {
      title: 'Wrap up into the task',
      description:
        'Closes the task this session worked on in Pacenote, with what was done and a reply for you to send.',
    },
    () => userPrompt(donePrompt(locale))
  )

  server.registerPrompt(
    'recap',
    {
      title: 'Write my recap',
      description:
        'Writes a standup, a weekly update or a monthly recap from what you did, as Pacenote keeps it.',
      argsSchema: {
        period: z
          .string()
          .optional()
          .describe('day, week (the default) or month'),
      },
    },
    ({ period }) => userPrompt(recapPromptFor(period, locale))
  )
}
