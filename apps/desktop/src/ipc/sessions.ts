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
import { readWork } from '../../../../src/tasks/work.js'
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
    const titleOf = new Map(
      allTaskViews(dataDir).map((task) => [task.id, task.title])
    )
    const tasks = new Map<string, { id: string; title: string }>()
    for (const entry of readWork(dataDir).entries)
      if (entry.kind === 'session' && entry.session && titleOf.has(entry.task))
        tasks.set(entry.session, {
          id: entry.task,
          title: titleOf.get(entry.task)!,
        })
    const view = sessionsView({
      now,
      dayStart,
      agents,
      logged,
      repos,
      areas,
      tasks,
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
