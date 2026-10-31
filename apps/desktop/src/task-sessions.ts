import { homedir } from 'node:os'
import { yourFolder } from '../../../src/tasks/folders.js'
import { allTaskViews } from '../../../src/tasks/store.js'
import type { WorkEntry, WorkTool } from '../../../src/tasks/types.js'
import { changeWork, readWork, workFor } from '../../../src/tasks/work.js'
import {
  dueForJudging,
  judge,
  judgePrompt,
  pullRequestOf,
  QUIET_MS,
} from './done-watch.js'
import {
  lastActive,
  readSessionLog,
  sessionFile,
  type Session,
} from './handoff.js'
import type { Desktop } from './ipc/context.js'
import type { OpencodeSessions } from './opencode-sessions.js'
import { refusalOf } from './own-ai.js'
import { SessionIndex } from './session-index.js'
import { isTaskBranch, linkSessions, RepoLookup } from './session-links.js'

/**
 * Your sessions and your tasks, matched up: the sessions you started
 * yourself, from Claude Code's, Codex's and opencode's logs on this Mac, and
 * whether a task whose session went quiet looks done
 */
export type TaskSessions = ReturnType<typeof taskSessions>

export function taskSessions(
  desktop: Desktop,
  opencodeSessions: OpencodeSessions
) {
  const { settings, dataDir, log, toolPath, ownAi, ownWork, opencodeRun } =
    desktop
  const env = () => settings.effectiveEnv()
  // Sessions you started yourself, from Claude Code's and Codex's logs on
  // this Mac (Settings > Todo > Show sessions you start yourself): linked to
  // the task they worked on, or suggested for you to say, at most every 30
  // seconds and never two passes at once (session-links.ts).
  // End-to-end tests look more often (PACENOTE_TASKS_LINK_MS).
  const LINK_EVERY_MS = Number(process.env.PACENOTE_TASKS_LINK_MS) || 30_000
  const sessionIndex = new SessionIndex({ home: homedir() })
  const repoLookup = new RepoLookup()
  let linking: Promise<void> | undefined
  let linkedAt = 0
  let linkAgain = false
  const linkSessionsSoon = (force = false): void => {
    if (env().TASKS !== 'on' || env().TASKS_LINK_SESSIONS !== 'on') return
    if (linking) {
      linkAgain ||= force
      return
    }
    if (!force && Date.now() - linkedAt < LINK_EVERY_MS) return
    linking = (async () => {
      await sessionIndex.refresh()
      const sessions = sessionIndex
        .sessions()
        .filter((s) => yourFolder(homedir(), s.cwd, [dataDir]))
      const repos = await repoLookup.all(sessions.map((s) => s.cwd))
      const tasks = allTaskViews(dataDir)
      const open = new Set(
        tasks.filter((t) => t.status === 'open').map((t) => t.id)
      )
      const result = linkSessions({
        tasks,
        work: readWork(dataDir),
        sessions,
        repos,
      })
      changeWork(dataDir, (file) => {
        const known = new Set(
          file.entries.flatMap((e) =>
            e.kind === 'session' && e.session ? [e.session] : []
          )
        )
        const found = result.found.filter((e) => !known.has(e.session!))
        for (const e of found) known.add(e.session!)
        const ids = new Map(result.opened.map((o) => [o.entry, o.session]))
        return {
          ...file,
          entries: [
            ...file.entries.map((e) =>
              e.kind === 'session' && !e.session && ids.has(e.id)
                ? { ...e, session: ids.get(e.id) }
                : e
            ),
            ...found,
          ],
          // Still asked: for an open task, and not linked since
          suggested: [...(file.suggested ?? []), ...result.suggested].filter(
            (s) => open.has(s.task) && !known.has(s.session!)
          ),
        }
      })
      if (result.found.length || result.suggested.length)
        log.info(
          `Sessions: ${result.found.length} linked to tasks, ${result.suggested.length} suggested`
        )
    })()
      .catch((error: Error) =>
        log.warn(`Could not read the sessions' logs: ${error.message}`)
      )
      .finally(() => {
        linking = undefined
        linkedAt = Date.now()
        if (linkAgain) {
          linkAgain = false
          linkSessionsSoon(true)
        }
      })
  }
  /** A session's last activity and the branch it was on last, from its log */
  const sessionNow = (
    entry: Pick<Session, 'session' | 'tool' | 'startedAt'>
  ): { lastActiveAt?: string; branch?: string } => {
    if (entry.tool === 'opencode')
      return {
        lastActiveAt: entry.session
          ? opencodeSessions.activeAt(entry.session)
          : undefined,
      }
    const summary = entry.session && sessionIndex.session(entry.session)
    if (summary)
      return {
        lastActiveAt: summary.lastAt,
        branch:
          summary.branch && isTaskBranch(summary.branch)
            ? summary.branch
            : undefined,
      }
    return { lastActiveAt: lastActive(homedir(), entry as Session) }
  }
  // A task whose latest session went quiet: whether it looks done
  // (done-watch.ts), a pass at a time, while Todo is open. End-to-end tests
  // wait less (PACENOTE_TASKS_QUIET_MS).
  const QUIET = Number(process.env.PACENOTE_TASKS_QUIET_MS) || QUIET_MS
  let judging: Promise<void> | undefined
  let judgedAt = 0
  const judgeSoon = (): void => {
    if (env().TASKS !== 'on' || env().TASKS_SUGGEST_DONE !== 'on') return
    if (judging || Date.now() - judgedAt < Math.min(LINK_EVERY_MS, QUIET))
      return
    judging = (async () => {
      const due = dueForJudging({
        tasks: allTaskViews(dataDir),
        work: readWork(dataDir),
        activeAt: (entry) => sessionNow(entry).lastActiveAt,
        now: Date.now(),
        quietMs: QUIET,
      })
      for (const { task, entry, activeAt } of due) {
        const file = sessionFile(homedir(), entry)
        const items =
          entry.tool === 'opencode'
            ? ((await opencodeSessions.log(entry)) ?? [])
            : file
              ? readSessionLog(file, entry.tool)
              : []
        const pr = await pullRequestOf(
          task.repo,
          entry.branch ?? sessionNow(entry).branch,
          toolPath()
        )
        const ran = items.length
          ? await ownAi.run(
              (cli) =>
                judge({
                  ...ownWork(cli),
                  opencode: opencodeRun(),
                  prompt: judgePrompt(task, items, pr),
                }),
              refusalOf,
              { background: true }
            )
          : undefined
        // Both at their limits: judged once one of them is back
        if (ran && 'resting' in ran) {
          log.info(
            `Not judging whether ${task.id} looks done until ${ran.resting}: both AIs are resting.`
          )
          break
        }
        const result = ran
          ? ran.result
          : { error: 'its session has no log on this Mac' }
        // Kept either way, so the same quiet is not judged again.
        if ('error' in result)
          log.warn(
            `Could not tell whether ${task.id} looks done: ${result.error}`
          )
        else
          log.info(
            `Task ${task.id} ${result.done ? 'looks done' : 'is not done yet'}, from its ${entry.tool} session`
          )
        changeWork(dataDir, (work) => ({
          ...work,
          proposals: [
            ...(work.proposals ?? []).filter(
              (p) => !(p.task === task.id && p.session === entry.session)
            ),
            {
              task: task.id,
              tool: entry.tool,
              session: entry.session,
              activeAt,
              at: new Date().toISOString(),
              ...('error' in result ? { done: false } : result),
              ...(pr ? { pr } : {}),
            },
          ],
        }))
      }
    })()
      .catch((error: Error) =>
        log.warn(`Could not read the quiet sessions: ${error.message}`)
      )
      .finally(() => {
        judging = undefined
        judgedAt = Date.now()
      })
  }
  /** Each open task's latest session, for its row: the tool and when */
  const working = (tasks: { id: string }[], entries: WorkEntry[]) => {
    // The entries by task, sorted out once rather than for each task
    const byTask = new Map<string, WorkEntry[]>()
    for (const entry of entries) {
      const group = byTask.get(entry.task)
      if (group) group.push(entry)
      else byTask.set(entry.task, [entry])
    }
    const rows: Record<string, { tool: WorkTool; at: string }> = {}
    for (const task of tasks) {
      const latest = workFor(byTask.get(task.id) ?? [], task.id).find(
        (e): e is Session => e.kind === 'session' && !!e.session
      )
      const at = latest && !latest.mac && sessionNow(latest).lastActiveAt
      if (latest && at) rows[task.id] = { tool: latest.tool, at }
    }
    return rows
  }
  return { linkSoon: linkSessionsSoon, sessionNow, judgeSoon, working }
}
