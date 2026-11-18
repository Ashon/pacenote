import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { localized } from '../../../../src/i18n/locale.js'
import { SESSION_MODES } from '../../../../src/sessions/live.js'
import type {
  SessionMode,
  SessionRow,
  SessionsView,
  SessionTalk,
} from '../../../../src/sessions/types.js'
import { sessionsView } from '../../../../src/sessions/view.js'
import { SingleFlight } from '../../../../src/single-flight.js'
import { TOOL_LABEL } from '../../../../src/tasks/context.js'
import type { SessionItem } from '../../../../src/tasks/types.js'
import {
  codexLogs,
  saveRepo,
  yourFolder,
} from '../../../../src/tasks/folders.js'
import { allTaskViews } from '../../../../src/tasks/store.js'
import {
  addWork,
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
  claudeLog,
  CodexTitles,
  codexToday,
  type OpenClaude,
  type OpenSessions,
} from '../open-sessions.js'
import type { SessionHost } from '../session-host.js'
import type { TaskSessions } from '../task-sessions.js'
import type { TodoSettings } from '../todo-settings.js'
import type { Desktop } from './context.js'
import type { Ipc } from './gate.js'

const run = promisify(execFile)

/** Opening a session in the Claude app: claude --desktop --resume */
const OPEN_TIMEOUT_MS = 20_000
/** The logs kept read, for a page asking every few seconds */
const LOGS_KEPT = 4
/** What you type to a session, at most */
const MESSAGE_CHARS = 20_000
/** A new session's first message, at most: a task's, with what came before */
const FIRST_CHARS = 60_000
/** A new session's name in Claude Code's lists, at most */
const NAME_CHARS = 80
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** How much of a turn its page shows: an answer in full, mostly */
const TURN_CHARS = 12_000
/**
 * Where a session open now moves from to Pacenote while it rests: not
 * claude.ai's (claude remote-control), which runs it for the web
 */
const MOVES_FROM = new Set<SessionRow['where']>(['claude-app', 'terminal'])

/**
 * Sessions: the Claude Code and Codex sessions on this Mac, where each runs
 * and whether it waits for you (src/sessions), and opening one where it runs.
 * The window and your own devices (a phone, an iPad) use them, the device
 * over its sealed channel (src/macs/asks.ts): you talk there to a session
 * this Mac runs. Opening one in its terminal or app is the window's alone.
 */
export function registerSessionsIpc(
  ipc: Ipc,
  desktop: Desktop,
  deps: {
    sessions: TaskSessions
    openSessions: OpenSessions
    /** The Claude Code sessions Pacenote runs (session-host.ts) */
    host: SessionHost
    todo: Pick<TodoSettings, 'hasApp'>
  }
): void {
  const { dataDir, settings, toolPath, cliBins, log } = desktop
  const { sessions, openSessions, host, todo } = deps
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
  /** The rows last shown, the app each open one runs in, and its group */
  let shown = new Map<string, SessionRow>()
  let shownIn = new Map<string, { app?: string; group?: string }>()
  const viewing = new SingleFlight<SessionsView>()

  const read = async (): Promise<SessionsView> => {
    const now = Date.now()
    const day = new Date(now)
    day.setHours(0, 0, 0, 0)
    const dayStart = day.getTime()
    const listed = await openSessions.list(now)
    // Claude Code lists the processes Pacenote runs too: the others are open
    // somewhere else
    const own = new Set(host.list().map((h) => h.pid))
    const others = listed?.filter(
      (agent) => agent.pid === undefined || !own.has(agent.pid)
    )
    // Opened somewhere else after Pacenote ran it: Pacenote lets go while it
    // rests, so the place you type in last has it, one conversation
    for (const h of host.list())
      if (
        others?.some(
          (agent) =>
            agent.session === h.session && (agent.startedAt ?? '') > h.startedAt
        )
      )
        host.letGo(h.session)
    // The sessions Pacenote runs, in place of how Claude Code lists them
    const hosted: OpenClaude[] = host.list().map((h) => ({
      session: h.session,
      cwd: h.cwd,
      ...(h.name ? { name: h.name } : {}),
      busy: h.busy,
      ...(h.asks ? { asks: h.asks } : {}),
      startedAt: h.startedAt,
      where: 'pacenote',
    }))
    const agents = others
      ?.filter((agent) => !host.has(agent.session))
      .concat(hosted)
      .filter((agent) => yours(agent.cwd))
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
    const listedRows = view.open.flatMap((g) =>
      g.sessions.map((row) => ({ row, group: g.name }))
    )
    shown = new Map(
      [...listedRows.map(({ row }) => row), ...view.ended].map((row) => [
        row.id,
        row,
      ])
    )
    shownIn = new Map(
      listedRows.map(({ row, group }) => [
        row.id,
        { app: apps.get(row.session), group },
      ])
    )
    return { on: true, ...view }
  }

  ipc.handleDenying(
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
        else if (shownIn.get(row.id)?.app)
          await openLink(shownIn.get(row.id)!.app!)
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
  ipc.handleDenying(
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
  ipc.handleDenying(
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
  ipc.handleDenying(
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

  /** A session Pacenote runs, by its row's id */
  const hostedOf = (id: unknown) =>
    typeof id === 'string' && id.startsWith('claude:')
      ? id.slice('claude:'.length)
      : undefined

  /** The logs read last, kept while they have not changed */
  const logs = new Map<
    string,
    { size: number; mtimeMs: number; items: SessionItem[] }
  >()
  const readLog = (file: string, row: SessionRow): SessionItem[] => {
    const info = statSync(file)
    const kept = logs.get(file)
    if (kept?.size === info.size && kept.mtimeMs === info.mtimeMs)
      return kept.items
    const items = readSessionLog(file, row.tool, TURN_CHARS)
    logs.delete(file)
    logs.set(file, { size: info.size, mtimeMs: info.mtimeMs, items })
    for (const old of logs.keys()) if (logs.size > LOGS_KEPT) logs.delete(old)
    return items
  }

  /** A session as last shown; the list read first for a page opened first */
  const rowOf = async (id: unknown) => {
    if (typeof id !== 'string') return undefined
    if (!shown.has(id)) await viewing.run(read).catch(() => undefined)
    // One started just now, after the read that was under way began
    const session = hostedOf(id)
    if (!shown.has(id) && session && host.has(session))
      await viewing.run(read).catch(() => undefined)
    return shown.get(id)
  }

  /**
   * Where you type to a session: here, for one Pacenote runs or that runs
   * nowhere now; here too for one resting in the Claude app or a terminal,
   * which moves here as you send (move); where it is open, while it works
   * there or for claude.ai; or in Codex
   */
  const typeIn = (row: SessionRow): SessionTalk['typeIn'] =>
    row.tool !== 'claude'
      ? 'codex'
      : row.where === 'pacenote' ||
          row.state === 'ended' ||
          host.has(row.session)
        ? 'here'
        : MOVES_FROM.has(row.where) && row.state !== 'working'
          ? 'move'
          : 'elsewhere'

  /**
   * Moves a session resting in the Claude app or a terminal here: its process
   * there ends, so one place types into it and the conversation stays one.
   * The Claude app resumes it again once you type there; a terminal's closes.
   * One Pacenote runs moves too, when it was opened there since; one Claude
   * Code cannot list goes on here, unless it is known open there (open)
   */
  const moveHere = async (
    session: string,
    open: boolean
  ): Promise<{ error?: string }> => {
    const t = localized(text)
    const own = new Set(host.list().map((h) => h.pid))
    const there = (
      await openSessions.list(Date.now(), { fresh: true })
    )?.filter(
      (agent) =>
        agent.session === session &&
        (agent.pid === undefined || !own.has(agent.pid))
    )
    if (!there) return open ? { error: t.sessionOpenThere } : {}
    if (there.some((agent) => agent.busy))
      return { error: t.sessionWorkingThere }
    for (const agent of there) {
      if (!MOVES_FROM.has(agent.where) || agent.pid === undefined)
        return { error: t.sessionOpenThere }
      if (!(await openSessions.end(agent.pid)))
        return { error: t.sessionNotMoved }
    }
    return {}
  }

  /**
   * A session's page: its conversation from its tool's own log, read again
   * as it grows, and how Pacenote runs it
   */
  ipc.handleDenying(
    'pacenote:sessions:talk',
    () => null,
    async (id): Promise<SessionTalk | null> => {
      let row = await rowOf(id)
      // Moved here (or let go) since the list was last read: its row as it
      // is now, so the page says where it runs
      if (
        row?.tool === 'claude' &&
        host.has(row.session) !== (row.where === 'pacenote')
      ) {
        await viewing.run(read).catch(() => undefined)
        row = shown.get(row.id) ?? row
      }
      if (!row || row.tool === 'opencode') return null
      const group = shownIn.get(row.id)?.group
      const live = row.tool === 'claude' ? host.get(row.session) : undefined
      const talk = {
        row,
        ...(group ? { group } : {}),
        typeIn: typeIn(row),
        ...(live ? { live } : {}),
      }
      const file =
        (row.tool === 'claude' ? claudeLog(home, row.session) : undefined) ??
        sessions.index.session(row.session)?.file
      if (!file)
        return {
          ...talk,
          items: [],
          error: localized(text).noSessionLog(TOOL_LABEL[row.tool]),
        }
      try {
        return { ...talk, items: readLog(file, row) }
      } catch (error) {
        return { ...talk, items: [], error: (error as Error).message }
      }
    }
  )

  /** A Claude Code session you type to here, and what you typed */
  const typedTo = async (id: unknown, message: unknown) => {
    const t = localized(text)
    const row = await rowOf(id)
    if (!row) return { error: t.noSuchSession }
    if (row.tool !== 'claude') return { error: t.sessionOnlyClaude }
    const said = typeof message === 'string' ? message.trim() : ''
    if (!said) return { error: t.emptyMessage }
    return { row, said: said.slice(0, MESSAGE_CHARS) }
  }

  /**
   * Sends a session what you typed: Pacenote runs it from then on, unless it
   * is open somewhere else, where you type instead
   */
  ipc.handleDenying(
    'pacenote:sessions:send',
    () => ({ error: localized(text).noSuchSession }),
    async (id, message) => {
      const to = await typedTo(id, message)
      if ('error' in to) return to
      const where = typeIn(to.row)
      if (where !== 'here' && where !== 'move')
        return { error: localized(text).sessionOpenThere }
      // Open somewhere else as well: it moves here, the place you type in
      const moved = await moveHere(to.row.session, where === 'move')
      if (moved.error) return moved
      const sent = await host.send(to.row.session, to.row.cwd, to.said)
      return sent.error ? { error: localized(text).sessionNotHere } : {}
    }
  )

  /**
   * Continues a session open somewhere else in a copy Pacenote runs, with
   * what you typed; the copy is the same task's work
   */
  ipc.handleDenying(
    'pacenote:sessions:copy',
    () => ({ error: localized(text).noSuchSession }),
    async (id, message) => {
      const to = await typedTo(id, message)
      if ('error' in to) return to
      const copy = await host.copy(to.row.session, to.row.cwd, to.said)
      if (!copy.session) return { error: copy.error }
      if (to.row.task)
        link(
          {
            ...to.row,
            session: copy.session,
            startedAt: new Date().toISOString(),
          },
          to.row.task.id
        )
      // The copy is listed from the next read on
      shown.delete(`claude:${copy.session}`)
      return { id: `claude:${copy.session}` }
    }
  )

  const done = (result: { error?: string }) =>
    result.error ? { error: localized(text).sessionNotHere } : {}

  /**
   * Starts a new Claude Code session here (V5), in the folder, with its first
   * message: for a task, from Todo's Continue, it is the task's work, its
   * folder kept for its repository, and named after it. Its page's id.
   */
  ipc.handleDenying(
    'pacenote:sessions:start',
    () => ({ error: localized(text).noSuchSession }),
    (how) => {
      const t = localized(text)
      const {
        task: taskId,
        folder,
        message,
        mode,
        marker,
      } = (how ?? {}) as Record<string, unknown>
      if (settings.effectiveEnv().TASKS_LINK_SESSIONS !== 'on')
        return { error: t.sessionsOff }
      if (
        typeof folder !== 'string' ||
        !path.isAbsolute(folder) ||
        !existsSync(folder) ||
        !statSync(folder).isDirectory()
      )
        return { error: t.chooseFolderFirst }
      // Listed only where your work is, as any session
      if (!yours(folder)) return { error: t.notYourFolder }
      const said = typeof message === 'string' ? message.trim() : ''
      if (!said) return { error: t.emptyMessage }
      if (mode !== undefined && !SESSION_MODES.includes(mode as SessionMode))
        return { error: t.noSuchSession }
      const task =
        taskId === undefined
          ? undefined
          : allTaskViews(dataDir).find(
              (each) => each.id === taskId && each.status === 'open'
            )
      if (taskId !== undefined && !task) return { error: t.noSuchTask }
      const session = randomUUID()
      const started = host.begin(session, folder, said.slice(0, FIRST_CHARS), {
        ...(task && {
          name: task.title.replace(/\s+/g, ' ').trim().slice(0, NAME_CHARS),
        }),
        ...(mode !== undefined && { mode: mode as SessionMode }),
      })
      if (started.error) return { error: t.sessionNotStarted(started.error) }
      if (task) {
        if (task.repo) saveRepo(dataDir, task.repo, folder)
        const work = readWork(dataDir)
        // The marker its first message carries, when it is one not used yet
        const id =
          typeof marker === 'string' &&
          UUID.test(marker) &&
          !work.entries.some((entry) => entry.id === marker)
            ? marker
            : randomUUID()
        addWork(dataDir, {
          kind: 'session',
          id,
          task: task.id,
          tool: 'claude',
          session,
          cwd: folder,
          startedAt: new Date().toISOString(),
        })
      }
      return { id: `claude:${session}` }
    }
  )

  /** Your answer to what it asks: allow, allow in this session, or deny */
  ipc.handleDenying(
    'pacenote:sessions:answer',
    () => ({ error: localized(text).noSuchSession }),
    (id, ask, answer, message) => {
      const session = hostedOf(id)
      if (
        !session ||
        typeof ask !== 'string' ||
        (answer !== 'allow' && answer !== 'always' && answer !== 'deny')
      )
        return { error: localized(text).noSuchSession }
      return done(
        host.answer(
          session,
          ask,
          answer,
          typeof message === 'string'
            ? message.slice(0, MESSAGE_CHARS)
            : undefined
        )
      )
    }
  )

  /** Stops the turn it is on */
  ipc.handleDenying(
    'pacenote:sessions:stop',
    () => ({ error: localized(text).noSuchSession }),
    (id) => {
      const session = hostedOf(id)
      return session ? done(host.stop(session)) : done({ error: 'gone' })
    }
  )

  /** Ends its run here; the conversation stays in Claude Code's log */
  ipc.handleDenying(
    'pacenote:sessions:end',
    () => ({ error: localized(text).noSuchSession }),
    (id) => {
      const session = hostedOf(id)
      if (session) host.end(session)
      return {}
    }
  )

  /** Changes how it asks before it acts */
  ipc.handleDenying(
    'pacenote:sessions:mode',
    () => ({ error: localized(text).noSuchSession }),
    (id, mode) => {
      const session = hostedOf(id)
      if (!session || !SESSION_MODES.includes(mode as SessionMode))
        return { error: localized(text).noSuchSession }
      return done(host.setMode(session, mode as SessionMode))
    }
  )
}
