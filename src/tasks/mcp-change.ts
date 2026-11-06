import { z } from 'zod'
import type { Locale } from '../i18n/locale.js'
import { repoField } from '../mcp-tools.js'
import { respond, taskRef, type TaskTools } from './mcp-shared.js'
import { inUserLanguage } from './prompts.js'
import { TASK_ACTIONS, TASK_CONFIDENCES } from './types.js'
import { addFollowUp, closeTask, updateTask, wrapUpTask } from './write.js'

const REPLY = 'A reply for the user to send in the thread, in its language'

/** What a wrap-up says, for close_task and wrap_up_task */
const wrapUp = (locale: Locale) =>
  `How it ended, in two or three sentences ${inUserLanguage(locale)}: what was done or decided and by whom, and anything left after it. It is what reminds the user, and the next task like it, later; no secrets or personal details.`

/**
 * The tools that change a task: add_followup keeps work left after one,
 * update_task follows what its thread changed, close_task closes it and
 * wrap_up_task says how it ended
 */
export function registerChangeTools({
  server,
  options,
  now,
  client,
  locale,
  inTheirs,
  track,
}: TaskTools): void {
  server.registerTool(
    'add_followup',
    {
      description:
        "Adds a task of the user's own from this session, kept on this Mac: " +
        'work left after a task (after: that task) or something the user ' +
        'asks you to keep for later. Only when the work leaves something or ' +
        'the user asks; not for what you are about to do now. Its repository ' +
        "is the one it follows, or this folder's.",
      inputSchema: {
        title: z
          .string()
          .describe(
            `What to do, a short imperative ("Add retries to the export job"), ${inTheirs}`
          ),
        why: z.string().describe(`Why it is a task, in a line, ${inTheirs}`),
        after: z
          .string()
          .optional()
          .describe(
            "The task it carries on from: its id or its message's link"
          ),
        due: z
          .string()
          .optional()
          .describe('A due hint in words, if there is one'),
        summary: z
          .string()
          .optional()
          .describe(
            `What it is about and what is known so far, in two or three sentences, ${inTheirs}`
          ),
        action: z.enum(TASK_ACTIONS).optional(),
        repo: repoField(),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    (item) =>
      respond(options, () => {
        const result = addFollowUp(options.dataDir, item, {
          addedBy: client(),
          repo: options.repo,
          now: new Date(now()),
        })
        if ('error' in result) throw new Error(result.error)
        const { task, added } = result
        if (added) track({ kind: 'follow-up', task: task.id })
        return {
          [added ? 'added' : 'alreadyThere']: {
            id: task.id,
            title: task.title,
            repo: task.repo,
            follows: task.follows,
          },
        }
      })
  )

  server.registerTool(
    'update_task',
    {
      description:
        'Updates an open task or Maybe when its thread changed it since it ' +
        'was added: a new due date, a sharper or different ask, the ' +
        'repository named, a Maybe now asked of the user by name (confidence ' +
        '"sure") or a task no longer clearly theirs ("maybe"). Send only what ' +
        'changed, and why in a line. Also fills in action, repo and summary ' +
        'for tasks that lack them. Tasks the user settled are left as they ' +
        'are; settled in Slack, close_task closes it instead.',
      inputSchema: {
        task: taskRef(),
        why: z
          .string()
          .describe('Why, in a line: "mina moved it to Wednesday"'),
        title: z
          .string()
          .optional()
          .describe('Only when the ask itself changed'),
        due: z
          .string()
          .nullable()
          .optional()
          .describe('A due hint in words; null when it no longer has one'),
        summary: z
          .string()
          .optional()
          .describe('The thread in two or three sentences, as it is now'),
        action: z.enum(TASK_ACTIONS).optional(),
        repo: z
          .string()
          .nullable()
          .optional()
          .describe('The repository it is about, as owner/name'),
        confidence: z.enum(TASK_CONFIDENCES).optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ task, why, ...changes }) =>
      respond(options, () => {
        const result = updateTask(
          options.dataDir,
          task,
          changes,
          why,
          new Date(now()),
          client()
        )
        if (!result) throw new Error(`No task ${task}`)
        const { id, title } = result.task
        const unchanged = (reason: string) => ({
          unchanged: { id, title, why: reason },
        })
        if ('refused' in result)
          return unchanged(`Left as it is: ${result.refused}`)
        const changed = result.changed.map((change) => change.field)
        if (!changed.length)
          return unchanged('Nothing differs from what it has')
        track({ kind: 'update', task: id, fields: changed })
        return { updated: { id, title, why, changed } }
      })
  )

  server.registerTool(
    'close_task',
    {
      description:
        'Closes an open task settled where it was asked: the user replied in ' +
        'its thread after it ("replied"), its message got a check mark ' +
        '("checked"), or it was settled some other way ("resolved"). A ' +
        'session that did the work closes it with "resolved", says what it ' +
        'did in a line (note) and, when the person who asked waits for an ' +
        'answer, leaves a reply for the user to send (reply). A collection ' +
        'closing it from its thread says how it ended (wrap_up). It never ' +
        'posts to Slack itself.',
      inputSchema: {
        task: taskRef(),
        why: z.enum(['replied', 'checked', 'resolved']),
        note: z
          .string()
          .optional()
          .describe(`What was done, in a line, ${inTheirs}`),
        reply: z.string().optional().describe(REPLY),
        wrap_up: z.string().optional().describe(wrapUp(locale)),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ task, why, note, reply, wrap_up }) =>
      respond(options, () => {
        const closed = closeTask(options.dataDir, task, why, new Date(now()), {
          by: client(),
          note,
          reply,
          wrapUp: wrap_up,
        })
        if (!closed) throw new Error(`No task ${task}`)
        track({ kind: 'close', task: closed.id })
        return {
          closed: {
            id: closed.id,
            title: closed.title,
            why,
            wrapUp: closed.wrapUp?.text,
          },
        }
      })
  )

  server.registerTool(
    'wrap_up_task',
    {
      description:
        'Says how a task the user did, or that closed, ended, from its ' +
        'thread: what was done or decided and by whom, and anything left ' +
        'after it. collect_context lists the tasks to wrap up. Open tasks, ' +
        'Maybes and tasks the user dismissed are left as they are.',
      inputSchema: {
        task: taskRef(),
        wrap_up: z.string().min(1).describe(wrapUp(locale)),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ task, wrap_up }) =>
      respond(options, () => {
        const result = wrapUpTask(
          options.dataDir,
          task,
          wrap_up,
          new Date(now()),
          client()
        )
        if (!result) throw new Error(`No task ${task}`)
        const { id, title, wrapUp } = result.task
        if (!('refused' in result)) track({ kind: 'wrap-up', task: id })
        return 'refused' in result
          ? {
              unchanged: { id, title, why: `Left as it is: ${result.refused}` },
            }
          : { wrappedUp: { id, title, wrapUp: wrapUp?.text } }
      })
  )
}
