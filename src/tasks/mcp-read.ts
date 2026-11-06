import { limitField, recapFields } from '../mcp-tools.js'
import type { Audience } from '../you/areas.js'
import { countRecap, periodCommits, periodKey } from '../you/recap.js'
import { countYou } from '../you/store.js'
import type { AreaRole } from '../you/types.js'
import { outcomeOf, taskContext, threadOf, TOOL_LABEL } from './context.js'
import { isFillUpdate } from './filled.js'
import type { TaskToolsOptions } from './mcp.js'
import { respond, taskRef, type TaskTools } from './mcp-shared.js'
import { sourceNames, sourceOf, taskIdOf } from './sources.js'
import { allTaskViews, tasksView } from './store.js'
import type { TasksView, TaskView } from './types.js'
import { readWork } from './work.js'

/**
 * The tools that read the user's tasks and work: task_context, one task to
 * work on with what came before it; my_recap, a day, a week or a month;
 * my_work, where they contribute; and my_tasks, their open tasks
 */
export function registerReadTools({
  server,
  options,
  now,
  track,
}: TaskTools): void {
  server.registerTool(
    'task_context',
    {
      description:
        "One of the user's tasks, to work on it: what was asked, by whom and " +
        'where, the thread summed up, its repository, and what came before ' +
        '(earlier tasks in the thread, in the repository and from the same ' +
        'person, with how each ended and the session it was done in, and ' +
        "Pace's answers in the thread when the run history is shared).",
      inputSchema: {
        task: taskRef(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ task }) =>
      respond(options, () => {
        const all = allTaskViews(options.dataDir, now())
        const id = taskIdOf(task)
        const view = all.find((t) => t.id === id)
        if (!view) throw new Error(`No task ${task}`)
        track({ kind: 'look', task: view.id })
        const work = readWork(options.dataDir).entries
        const [conversation, thread] = splitThread(view)
        const runs = options.runs?.(conversation, thread)
        const context = taskContext(view, all, work, runs ?? [], 'en')
        const earlier = (
          tasks: ReturnType<typeof taskContext>['thread']['tasks']
        ) =>
          tasks.map((t) => ({
            id: t.id,
            title: t.title,
            askedBy: t.askedBy,
            where: t.where,
            postedAt: t.postedAt,
            outcome: t.outcome ?? 'open',
            wrapUp: t.wrapUp,
            session: t.session && {
              tool: TOOL_LABEL[t.session.tool],
              id: t.session.session,
              folder: t.session.cwd,
            },
          }))
        return {
          task: {
            id: view.id,
            title: view.title,
            kind: view.kind,
            askedBy: view.askedBy,
            source: sourceOf(view).label,
            where: view.source.label,
            postedAt: view.postedAt,
            due: view.due,
            action: view.action ?? 'other',
            repo: view.repo,
            summary: view.summary,
            reason: view.reason,
            link: view.source.permalink,
            status: view.status,
            outcome: outcomeOf(view, work, 'en'),
            wrapUp: view.wrapUp?.text,
            // How the thread changed it since it was added
            changes: view.updates
              ?.filter(
                (update) =>
                  !isFillUpdate(update) && update.changed.some((c) => c.from)
              )
              .slice(-3)
              .map((update) => ({
                at: update.at,
                why: update.why,
                changed: update.changed.map((c) => c.field),
              })),
          },
          earlier: {
            inThread: earlier(context.thread.tasks),
            inRepo: earlier(context.repo?.tasks ?? []),
            fromPerson: earlier(context.person?.tasks ?? []),
          },
          paceRuns:
            runs ??
            'Not shared: turn on Settings > History & logs > Share with AI tools to see them.',
          next: 'When the task is done, call close_task with why "resolved", a note on what you did and, if the person who asked waits for an answer, a reply for the user to send. Never post to Slack yourself.',
        }
      })
  )

  server.registerTool(
    'my_recap',
    {
      description:
        "A recap of the user's work for a day, a week (Monday to Sunday) " +
        'or a month, from their tasks, their own commits, their sessions ' +
        'and Pacenote: in each area, the tasks done and how they ended, the ' +
        "commits' subjects, the days with sessions, new asks and what is " +
        'still open; for today, what they are doing and what is next; and ' +
        'the sentences they had written for it, if any.',
      inputSchema: recapFields(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ period, date }) =>
      respond(options, () => recapSummary(options, period, date))
  )

  server.registerTool(
    'my_work',
    {
      description:
        'Where the user contributes, from their tasks and their Claude Code ' +
        'and Codex sessions on this Mac: their areas (the repositories, Slack ' +
        'channels and user groups each is made of), how they contribute to ' +
        'each and what shows it, what is open in each, what they did there ' +
        'in the last 30 days, and who asks them most. Areas with nothing for ' +
        'four weeks are listed as resting.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => respond(options, () => workSummary(options))
  )

  server.registerTool(
    'my_tasks',
    {
      description:
        `The user's open tasks, gathered from ${sourceNames()}: what someone ` +
        'asked of them or what they said they would do, newest first, with ' +
        'who asked, the source and where in it, a due hint, why it is a task ' +
        'and a link to the message. Maybes are left out.',
      inputSchema: { limit: limitField(50, 'tasks', 20) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ limit }) =>
      respond(options, () => {
        const view = tasksView(
          options.dataDir,
          options.settings().exclude,
          now()
        )
        return {
          collectedAt: view.collectedAt,
          tasks: openTasks(options, limit ?? 20, undefined, view),
        }
      })
  )
}

/**
 * The user's open tasks, newest first, as my_tasks gives them (and Pace's own
 * tools); keep says which ones to give, view is the tasks when already read
 */
export function openTasks(
  options: Pick<TaskToolsOptions, 'dataDir' | 'settings' | 'now'>,
  limit: number,
  keep: (task: TaskView) => boolean = () => true,
  view: TasksView = tasksView(
    options.dataDir,
    options.settings().exclude,
    options.now?.()
  )
) {
  return view.tasks
    .filter((task) => task.status === 'open' && keep(task))
    .slice(0, limit)
    .map((task) => ({
      id: task.id,
      title: task.title,
      kind: task.kind,
      askedBy: task.askedBy,
      source: sourceOf(task).label,
      where: task.source.label,
      postedAt: task.postedAt,
      due: task.due,
      reason: task.reason,
      link: task.source.permalink,
    }))
}

/**
 * Where the user contributes, as my_work gives it (and Pace's own tools, for
 * the audience of a channel)
 */
export async function workSummary(
  options: Pick<TaskToolsOptions, 'dataDir' | 'home'>,
  audience?: Audience
) {
  // Tool results are for AI tools: in English whatever the app's language
  const you = await countYou({
    dataDir: options.dataDir,
    home: options.home,
    audience,
    locale: 'en',
  })
  const { slack, github } = you.accounts
  return {
    you: {
      ...(slack
        ? { slack: slack.team ? `${slack.name} in ${slack.team}` : slack.name }
        : {}),
      ...(github ? { github } : {}),
    },
    areas: you.areas
      .filter((area) => area.state === 'active')
      .map((area) => ({
        name: area.name,
        parts: area.parts.map((part) => part.label),
        roles: area.roles.map(
          (role) => `${ROLE_WORDS[role.role]} (${role.evidence})`
        ),
        ...(area.working
          ? { workingNow: `in ${TOOL_LABEL[area.working.tool]}` }
          : {}),
        open: area.now,
        lately: area.lately.map(({ title, at, outcome }) => ({
          title,
          at,
          outcome,
        })),
        asksMost: area.people,
      })),
    resting: you.areas
      .filter((area) => area.state === 'resting')
      .map((area) => ({ name: area.name, lastWorked: area.lastActiveAt })),
  }
}

/** A recap of a day, a week or a month, as my_recap gives it */
export async function recapSummary(
  options: Pick<TaskToolsOptions, 'dataDir' | 'home' | 'now'>,
  period: 'day' | 'week' | 'month',
  date: string | undefined,
  audience?: Audience
) {
  const [y, m, d] = (date ?? '').split('-').map(Number)
  const now = options.now?.() ?? Date.now()
  const day = date ? new Date(y!, m! - 1, d) : new Date(now)
  const counted = await countRecap({
    dataDir: options.dataDir,
    home: options.home,
    period,
    key: periodKey(period, day),
    now,
    audience,
    locale: 'en',
  })
  if (!counted) throw new Error(`No ${period} for ${date}`)
  const { view, commits } = counted
  const title = (item: { title: string; note?: string }) =>
    item.note ? `${item.title} (${item.note})` : item.title
  return {
    period,
    key: view.key,
    from: view.start,
    to: view.end,
    soFar: view.current,
    totals: view.totals,
    areas: view.areas.map((area) => ({
      name: area.name,
      done: area.items.filter((item) => item.task).map(title),
      commits: periodCommits(view, area, commits),
      commitCount: area.commits,
      sessionDays: area.days,
      newAsks: area.asks,
      askedPace: area.runs,
      stillOpen: area.carried.map(title),
    })),
    ...(view.day
      ? {
          ...(view.day.yesterday
            ? { yesterday: view.day.yesterday.map(title) }
            : {}),
          doing: view.day.doing.map(title),
          next: view.day.next.map(title),
        }
      : {}),
    ...(view.month ? { month: view.month } : {}),
    ...(view.written ? { written: view.written.text } : {}),
  }
}

/** How the user contributes to an area, in my_work's words */
const ROLE_WORDS: Record<AreaRole, string> = {
  build: 'builds',
  review: 'reviews',
  answer: 'answers for it',
  'on-call': 'on call',
}

/** A task's conversation and thread, as Pace's runs record them */
function splitThread(task: TaskView): [string, string] {
  const key = threadOf(task)
  const at = key.indexOf(':')
  return [key.slice(0, at), key.slice(at + 1)]
}
