import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { localized } from '../../../../src/i18n/locale.js'
import type {
  SessionRow,
  SessionsView,
} from '../../../../src/sessions/types.js'
import { sessionsView } from '../../../../src/sessions/view.js'
import { SingleFlight } from '../../../../src/single-flight.js'
import { TOOL_LABEL } from '../../../../src/tasks/context.js'
import { codexLogs, yourFolder } from '../../../../src/tasks/folders.js'
import { allTaskViews } from '../../../../src/tasks/store.js'
import {
  changeWork,
  linkSession,
  readWork,
  unlinkSession,
} from '../../../../src/tasks/work.js'
import { addYourTask } from '../../../../src/tasks/write.js'
import { readYou } from '../../../../src/you/store.js'
import { codexThreadLink, openLink, readSessionLog } from '../handoff.js'
import { text } from '../main.text.js'
import {
  CodexTitles,
  codexToday,
  type OpenClaude,
  type OpenSessions,
} from '../open-sessions.js'
import type { TaskSessions } from '../task-sessions.js'
import type { TodoSettings } from '../todo-settings.js'
import type { Desktop } from './context.js'
import type { Ipc } from './gate.js'

const run = promisify(execFile)

/** Opening a session in the Claude app: claude --desktop --resume */
const OPEN_TIMEOUT_MS = 20_000

/**
 * Sessions: the Claude Code and Codex sessions on this Mac, where each runs
 * and whether it waits for you (src/sessions), and opening one where it runs.
 * For the window alone: your devices do not see your sessions (U10).
 */
export function registerSessionsIpc(
  ipc: Ipc,
  desktop: Desktop,
  deps: {
    sessions: TaskSessions
    openSessions: OpenSessions
    todo: Pick<TodoSettings, 'hasApp'>
  }
): void {
  const { dataDir, settings, toolPath, cliBins, log } = desktop
  const { sessions, openSessions, todo } = deps
  const home = homedir()
  const codexTitles = new CodexTitles(
    process.env.CODEX_HOME || path.join(home, '.codex')
  )
  const yours = (cwd: string) => yourFolder(home, cwd, [dataDir])
  /** Where each Claude Code session ran while open, for once it ends */
  const seen = new Map<
    string,
    { where: OpenClaude['where']; terminal?: string }
  >()
  /** The rows last shown, and the app each open one runs in */
  let shown = new Map<string, SessionRow & { app?: string }>()
  const viewing = new SingleFlight<SessionsView>()

  const read = async (): Promise<SessionsView> => {
    const now = Date.now()
    const day = new Date(now)
    day.setHours(0, 0, 0, 0)
    const dayStart = day.getTime()
    const listed = await openSessions.list(now)
    const agents = listed?.filter((agent) => yours(agent.cwd))
    if (settings.effectiveEnv().TASKS_LINK_SESSIONS !== 'on')
      return {
        on: false,
        open: [],
        ended: [],
        counts: { open: 0, working: 0, turn: 0, ended: 0 },
        listed: !!agents,
        found: {
          claude: {
            open: agents?.length ?? 0,
            where: [...new Set(agents?.map((agent) => agent.where))],
          },
          codex: { today: await codexToday(codexLogs(home, dayStart, now)) },
        },
      }
    await sessions.index.refresh(now)
    const titles = await codexTitles.get()
    const logged = sessions.index
      .sessions()
      .filter((s) => yours(s.cwd))
      .map((s) =>
        s.tool === 'codex' && titles.has(s.session)
          ? { ...s, autoTitle: titles.get(s.session) }
          : s
      )
    const repos = await sessions.repos.all([
      ...logged.map((s) => s.cwd),
      ...(agents ?? []).map((agent) => agent.cwd),
    ])
    const areas = readYou(dataDir)
      .areas.filter((area) => !area.left)
      .map((area) => ({
        id: area.id,
        name: area.name,
        repos: area.parts.flatMap((p) => (p.kind === 'repo' ? [p.id] : [])),
      }))
    const all = allTaskViews(dataDir)
    const titleOf = new Map(all.map((task) => [task.id, task.title]))
    const open = new Set(
      all.filter((task) => task.status === 'open').map((task) => task.id)
    )
    const work = readWork(dataDir)
    const tasks = new Map<string, { id: string; title: string }>()
    for (const entry of work.entries)
      if (entry.kind === 'session' && entry.session && titleOf.has(entry.task))
        tasks.set(entry.session, {
          id: entry.task,
          title: titleOf.get(entry.task)!,
        })
    // What a session not linked to a task looks like, while the task is open
    const suggested = new Map<
      string,
      { id: string; task: { id: string; title: string } }
    >()
    for (const suggestion of work.suggested ?? [])
      if (suggestion.session && open.has(suggestion.task))
        suggested.set(suggestion.session, {
          id: suggestion.id,
          task: { id: suggestion.task, title: titleOf.get(suggestion.task)! },
        })
    const view = sessionsView({
      now,
      dayStart,
      agents,
      logged,
      repos,
      areas,
      tasks,
      suggested,
      seen,
    })
    const apps = new Map(agents?.map((agent) => [agent.session, agent.app]))
    for (const agent of agents ?? [])
      seen.set(agent.session, { where: agent.where, terminal: agent.terminal })
    shown = new Map(
      [...view.open.flatMap((g) => g.sessions), ...view.ended].map((row) => [
        row.id,
        { ...row, app: apps.get(row.session) },
      ])
    )
    return { on: true, ...view }
  }

  ipc.windowOnly(
    'pacenote:sessions:view',
    () => null,
    () =>
      viewing.run(read).catch((error: Error) => {
        log.warn(`Could not read the sessions on this Mac: ${error.message}`)
        throw error
      })
  )

  /** Opens a session where it runs; an { error } when it cannot */
  ipc.windowOnly(
    'pacenote:sessions:open',
    () => ({ error: localized(text).noSuchSession }),
    async (id) => {
      const t = localized(text)
      const row = typeof id === 'string' ? shown.get(id) : undefined
      if (!row || row.state === 'ended') return { error: t.noSuchSession }
      try {
        if (row.tool === 'codex') {
          if (!todo.hasApp('codex')) return { error: t.noSuchSession }
          await openLink(codexThreadLink(row.session))
        } else if (row.where === 'claude-app')
          await run(cliBins().claude, ['--desktop', '--resume', row.session], {
            cwd: row.cwd,
            env: { ...process.env, PATH: toolPath() },
            timeout: OPEN_TIMEOUT_MS,
          })
        else if (row.where === 'web') await openLink('https://claude.ai/code')
        else if (row.app) await openLink(row.app)
        else return { error: t.noSuchSession }
        return {}
      } catch (error) {
        log.warn(`Could not open the session: ${(error as Error).message}`)
        return { error: (error as Error).message.split('\n')[0] }
      }
    }
  )

  /** A session as last shown, while it can be linked to a task */
  const linkable = (id: unknown) => {
    const row = typeof id === 'string' ? shown.get(id) : undefined
    return row && row.tool !== 'opencode' ? row : undefined
  }
  const link = (row: SessionRow, task: string) => {
    changeWork(dataDir, (file) =>
      linkSession(
        file,
        {
          task,
          tool: row.tool,
          session: row.session,
          cwd: row.cwd,
          startedAt: row.startedAt,
        },
        new Date()
      )
    )
    // A session that is the task's lends it its branch: look again.
    sessions.linkSoon(true)
  }

  /** Links a session to an open task: it is that task's work */
  ipc.windowOnly(
    'pacenote:sessions:link',
    () => ({ error: localized(text).noSuchSession }),
    (id, taskId) => {
      const t = localized(text)
      const row = linkable(id)
      const task = allTaskViews(dataDir).find(
        (task) => task.id === taskId && task.status === 'open'
      )
      if (!row) return { error: t.noSuchSession }
      if (!task) return { error: t.noSuchTask }
      link(row, task.id)
      return {}
    }
  )

  /** Takes a session off its task: not found for it again */
  ipc.windowOnly(
    'pacenote:sessions:unlink',
    () => ({ error: localized(text).noSuchSession }),
    (id) => {
      const row = linkable(id)
      if (!row) return { error: localized(text).noSuchSession }
      changeWork(dataDir, (file) =>
        unlinkSession(file, row.session, new Date())
      )
      return {}
    }
  )

  /**
   * A task of your own from a session, in its repository's project, with
   * the session as its work
   */
  ipc.windowOnly(
    'pacenote:sessions:make-task',
    () => ({ error: localized(text).noSuchSession }),
    (id) => {
      const row = linkable(id)
      if (!row) return { error: localized(text).noSuchSession }
      const added = addYourTask(dataDir, { title: row.title, repo: row.repo })
      if (!added) return { error: localized(text).noSuchSession }
      if ('error' in added) return added
      link(row, added.id)
      return { task: added.id }
    }
  )

  /** A session's own log, read when you open it */
  ipc.windowOnly(
    'pacenote:sessions:log',
    () => ({ error: localized(text).noSuchSession }),
    async (id) => {
      const t = localized(text)
      const row = typeof id === 'string' ? shown.get(id) : undefined
      if (!row || row.tool === 'opencode') return { error: t.noSuchSession }
      const summary = sessions.index.session(row.session)
      if (!summary) return { error: t.noSessionLog(TOOL_LABEL[row.tool]) }
      try {
        return { items: readSessionLog(summary.file, row.tool) }
      } catch (error) {
        return { error: (error as Error).message }
      }
    }
  )
}
