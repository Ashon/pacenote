import { z } from 'zod'
import { userLocale } from '../i18n/user.js'
import { repoField } from '../mcp-tools.js'
import { DAY } from '../time.js'
import { outcomeOf } from './context.js'
import { yourRepos } from './folders.js'
import { respond, type TaskTools } from './mcp-shared.js'
import { collectPrompt, taskRules } from './prompts.js'
import { SOURCE_IDS, sourceNames } from './sources.js'
import { buildView, readDecisions, readTasks } from './store.js'
import { TASK_ACTIONS, TASK_CONFIDENCES } from './types.js'
import { readWork } from './work.js'
import { youForCollection } from './you.js'
import { addTasks } from './write.js'

/** How far back a first collection reads */
const FIRST_WINDOW_MS = 7 * DAY
/**
 * Tasks done or closed this lately, with no wrap-up yet, are given to a
 * collection to wrap up, this many at a time (each is a thread to read)
 */
const WRAP_UP_WINDOW_MS = 7 * DAY
const WRAP_UP_AT_ONCE = 5

/**
 * The tools a collection reads Slack with: collect_context, what it needs to
 * know first, and add_tasks, which takes the tasks it found
 */
export function registerCollectionTools({
  server,
  options,
  now,
  client,
  inTheirs,
  track,
}: TaskTools): void {
  server.registerTool(
    'collect_context',
    {
      description:
        "What collecting the user's tasks from Slack needs: the rules for " +
        'what is a task, the channels to leave out, whether DMs count, since ' +
        'when to read, the open tasks to check for closing, the tasks done ' +
        'or closed lately to wrap up, the repositories the user works in, ' +
        'and who the user is in Slack: the names people call them and the ' +
        'user groups that mean them, or do not. Call it first.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      respond(options, async () => {
        track({ kind: 'collect' })
        const settings = options.settings()
        const file = readTasks(options.dataDir)
        const since =
          file.collectedAt ?? new Date(now() - FIRST_WINDOW_MS).toISOString()
        const { tasks } = buildView(file, readDecisions(options.dataDir), {
          excluded: settings.exclude,
          now: now(),
        })
        const work = readWork(options.dataDir).entries
        return {
          how: collectPrompt(),
          rules: taskRules(userLocale(options.dataDir)),
          since,
          dms: settings.dms,
          leaveOut: settings.exclude,
          open: tasks
            // Tasks from a session on this Mac have no thread to read.
            .filter(
              (task) =>
                (task.status === 'open' || task.status === 'maybe') &&
                task.source.app !== 'local'
            )
            .map((task) => ({
              id: task.id,
              title: task.title,
              kind: task.kind,
              confidence: task.confidence,
              due: task.due,
              action: task.action,
              repo: task.repo,
              summary: task.summary,
              link: task.source.permalink,
            })),
          // Done or closed lately, newest first, with no wrap-up yet
          wrapUp: tasks
            .filter(
              (task) =>
                (task.status === 'done' || task.status === 'closed') &&
                task.source.app !== 'local' &&
                !task.wrapUp &&
                now() - Date.parse(task.settledAt!) < WRAP_UP_WINDOW_MS
            )
            .sort((a, b) => Date.parse(b.settledAt!) - Date.parse(a.settledAt!))
            .slice(0, WRAP_UP_AT_ONCE)
            .map((task) => ({
              id: task.id,
              title: task.title,
              outcome: outcomeOf(task, work, 'en'),
              settledAt: task.settledAt,
              summary: task.summary,
              link: task.source.permalink,
            })),
          // For a task's repo: names only, never where they are
          repos: await yourRepos(options.dataDir, options.home),
          you: youForCollection(file, settings),
        }
      })
  )

  server.registerTool(
    'add_tasks',
    {
      description:
        `Adds the user's tasks found in ${sourceNames()}, each from one ` +
        "message, keyed by the message's link, so a message is never added " +
        'twice. Messages from channels left out, or DMs while they do not ' +
        'count, are skipped. Call it once at the end of a collection, even ' +
        'with no tasks.',
      inputSchema: {
        tasks: z
          .array(
            z.object({
              title: z
                .string()
                .describe(`What to do, short and imperative, ${inTheirs}`),
              kind: z.enum(['asked', 'promised']).optional(),
              asked_by: z.string().optional().describe('Who asked, by name'),
              where: z
                .string()
                .describe('Where it was asked: "#payments", "DM with mina"'),
              link: z
                .string()
                .describe("The message's link: a Slack permalink"),
              source: z
                .enum(SOURCE_IDS)
                .optional()
                .describe('Where the message is (by default, from its link)'),
              posted_at: z
                .string()
                .optional()
                .describe('When the message was posted (ISO 8601)'),
              due: z.string().optional().describe('A due hint in words'),
              confidence: z.enum(TASK_CONFIDENCES).optional(),
              reason: z.string().optional().describe('Why it is a task'),
              action: z
                .enum(TASK_ACTIONS)
                .optional()
                .describe('What doing it takes: code, reply or other'),
              repo: repoField(),
              summary: z
                .string()
                .optional()
                .describe('The thread in two or three sentences'),
              group: z
                .string()
                .optional()
                .describe(
                  'The user group it was asked of, as @handle, when the group is all that makes it maybe the user’s'
                ),
            })
          )
          .max(100),
        finished: z
          .boolean()
          .optional()
          .describe('The collection is done (default true)'),
        you: z
          .object({
            id: z.string().describe('Their member id: U0123ABCD'),
            name: z.string().optional().describe('Display name'),
            real_name: z.string().optional().describe('Full name'),
            team: z.string().optional().describe("The workspace's name"),
          })
          .optional()
          .describe(
            "The user's own Slack profile, when collect_context said lookUp"
          ),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ tasks, finished = true, you }) =>
      respond(options, () => {
        const result = addTasks(options.dataDir, tasks, {
          settings: options.settings(),
          addedBy: client(),
          finished,
          you,
          now: new Date(now()),
        })
        track({ kind: 'add', added: result.added.length, finished })
        return {
          added: result.added.map((task) => ({
            id: task.id,
            title: task.title,
            confidence: task.confidence,
          })),
          skipped: result.skipped,
        }
      })
  )
}
