import { shell } from 'electron'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { localized } from '../../../../src/i18n/locale.js'
import { checkCli, olderThan } from '../../../../src/reasoners/host-check.js'
import { hostEnv } from '../../../../src/sandbox/host.js'
import { runProcess } from '../../../../src/sandbox/process.js'
import {
  CODEX_SESSIONS_MIN_VERSION,
  isCodexMode,
} from '../../../../src/sessions/codex.js'
import { closeSession, readClosed } from '../../../../src/sessions/closed.js'
import { cleanMessage } from '../../../../src/sessions/images.js'
import { SESSION_MODES } from '../../../../src/sessions/live.js'
import type { MacAsk } from '../../../../src/macs/asks.js'
import type {
  CodexMode,
  HostTool,
  MacSessions,
  MadeThing,
  SessionMode,
  SessionRow,
  SessionsView,
  SessionTalk,
  SessionTools,
  SessionWrapDraft,
} from '../../../../src/sessions/types.js'
import { sessionsView } from '../../../../src/sessions/view.js'
import { SingleFlight } from '../../../../src/single-flight.js'
import { TOOL_LABEL } from '../../../../src/tasks/context.js'
import {
  codexLogs,
  saveRepo,
  yourFolder,
} from '../../../../src/tasks/folders.js'
import { allTaskViews } from '../../../../src/tasks/store.js'
import {
  WORK_TOOL_CLIENTS,
  type TaskView,
} from '../../../../src/tasks/types.js'
import {
  addWork,
  changeWork,
  linkSession,
  readWork,
  unlinkSession,
} from '../../../../src/tasks/work.js'
import {
  addFollowUp,
  addYourTask,
  closeTask,
} from '../../../../src/tasks/write.js'
import { readYou } from '../../../../src/you/store.js'
import {
  codexThreadLink,
  openLink,
  readSessionImage,
  readSessionLog,
  readSessionTalk,
} from '../handoff.js'
import { text } from '../main.text.js'
import {
  claudeLog,
  CodexTitles,
  codexToday,
  type OpenClaude,
  type OpenSessions,
} from '../open-sessions.js'
import type { CodexHost } from '../codex-host.js'
import type { SessionHost } from '../session-host.js'
import type { TaskSessions } from '../task-sessions.js'
import type { TodoSettings } from '../todo-settings.js'
import type { Desktop } from './context.js'
import type { Ipc } from './gate.js'

const run = promisify(execFile)

/** Opening a session in the Claude app: claude --desktop --resume */
const OPEN_TIMEOUT_MS = 20_000
/** How long what Codex can do here is kept, for the new session page */
const TOOLS_MS = 30_000
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
 * this Mac runs. Your other Macs read them too (MAC_ASKS), to list them and
 * show one's page there, and the window here reads theirs. Opening one in its
 * terminal or app is the window's alone.
 */
export function registerSessionsIpc(
  ipc: Ipc,
  desktop: Desktop,
  deps: {
    sessions: TaskSessions
    openSessions: OpenSessions
    /** The Claude Code sessions Pacenote runs (session-host.ts) */
    host: SessionHost
    /** The Codex sessions Pacenote runs (codex-host.ts) */
    codex: CodexHost
    todo: Pick<TodoSettings, 'hasApp'>
    /**
     * Your other Macs linked to this one, and asking one of them for its
     * sessions; none when this app does not keep your Macs
     */
    otherMacs?: {
      linked: () => { id: string; name: string; sessions?: boolean }[]
      ask: (mac: string, what: MacAsk, args: unknown[]) => Promise<unknown>
    }
  }
): void {
  const { dataDir, settings, toolPath, cliBins, log } = desktop
  const { sessions, openSessions, host, codex, todo, otherMacs } = deps
  const home = homedir()
  const codexTitles = new CodexTitles(
    process.env.CODEX_HOME || path.join(home, '.codex')
  )
  const yours = (cwd: string) => yourFolder(home, cwd, [dataDir])
  /**
   * The processes Pacenote runs sessions in, and the ones it ran while
   * Claude Code still lists them: one let go stays on that list as it quits
   * (and in the listing kept a few seconds), open nowhere else
   */
  const ran = new Set<number>()
  /** The sessions Claude Code lists that are open somewhere else */
  const elsewhere = (listed: OpenClaude[] | undefined) => {
    const running = new Set<number>()
    for (const h of host.list())
      if (h.pid !== undefined) {
        running.add(h.pid)
        ran.add(h.pid)
      }
    if (listed) {
      const pids = new Set(listed.map((agent) => agent.pid))
      for (const pid of ran)
        if (!running.has(pid) && !pids.has(pid)) ran.delete(pid)
    }
    return listed?.filter(
      (agent) => agent.pid === undefined || !ran.has(agent.pid)
    )
  }
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
    const others = elsewhere(await openSessions.list(now))
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
    // The Codex sessions Pacenote runs, whether Claude Code lists its own
    const codexRun: OpenClaude[] = codex
      .list()
      .filter((h) => yours(h.cwd))
      .map((h) => ({
        tool: 'codex',
        session: h.session,
        cwd: h.cwd,
        ...(h.name ? { name: h.name } : {}),
        busy: h.busy,
        ...(h.asks ? { asks: h.asks } : {}),
        startedAt: h.startedAt,
        where: 'pacenote',
      }))
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
      ...codexRun.map((agent) => agent.cwd),
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
          ...(open.has(entry.task) ? {} : { closed: true as const }),
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
      codex: codexRun,
      logged,
      repos,
      areas,
      tasks,
      suggested,
      seen,
      closed: readClosed(dataDir),
    })
    const apps = new Map(agents?.map((agent) => [agent.session, agent.app]))
    for (const agent of codexRun) apps.delete(agent.session)
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

  /** Each other Mac's read of its sessions, while one is under way */
  const othersReading = new Map<string, SingleFlight<MacSessions>>()
  /** The Macs that did not answer last time: said in the log once */
  const unanswered = new Set<string>()
  /** Another Mac's sessions, or why it shows none */
  const otherSessions = async (mac: {
    id: string
    name: string
    sessions?: boolean
  }): Promise<MacSessions> => {
    const shown = { id: mac.id, name: mac.name }
    // Pacenote there says whether it shows them from 0.6.38 on
    if (mac.sessions === undefined) return { mac: shown, missing: 'update' }
    if (!mac.sessions || !otherMacs) return { mac: shown, missing: 'off' }
    try {
      const view = (await otherMacs.ask(
        mac.id,
        'sessions.view',
        []
      )) as SessionsView | null
      unanswered.delete(mac.id)
      return view?.on ? { mac: shown, view } : { mac: shown, missing: 'off' }
    } catch (error) {
      if (!unanswered.has(mac.id))
        log.warn(
          `Could not read the sessions on ${mac.name}: ${(error as Error).message}`
        )
      unanswered.add(mac.id)
      return { mac: shown, missing: 'unreachable' }
    }
  }

  /**
   * The sessions on your other Macs linked to this one, each as it shows
   * them
   */
  ipc.windowOnly(
    'pacenote:sessions:others',
    () => [],
    async (): Promise<MacSessions[]> => {
      const macs = otherMacs?.linked() ?? []
      for (const id of othersReading.keys())
        if (!macs.some((mac) => mac.id === id)) othersReading.delete(id)
      return Promise.all(
        macs.map((mac) => {
          let reading = othersReading.get(mac.id)
          if (!reading) {
            reading = new SingleFlight<MacSessions>()
            othersReading.set(mac.id, reading)
          }
          return reading.run(() => otherSessions(mac))
        })
      )
    }
  )

  /**
   * A session's page on another of your Macs, read from there; null when
   * that Mac is not linked or does not show its sessions. It throws while
   * the Mac does not answer, so the page keeps what it showed.
   */
  ipc.windowOnly(
    'pacenote:sessions:other-talk',
    () => null,
    async (macId, id): Promise<SessionTalk | null> => {
      const mac = otherMacs?.linked().find((each) => each.id === macId)
      if (!otherMacs || !mac?.sessions || typeof id !== 'string') return null
      const talk = (await otherMacs.ask(mac.id, 'sessions.talk', [
        id,
      ])) as SessionTalk | null
      return talk ? { ...talk, mac: { id: mac.id, name: mac.name } } : null
    }
  )

  /** Opens a session where it runs; an { error } when it cannot */
  ipc.windowOnly(
    'pacenote:sessions:open',
    () => ({ error: localized(text).noSuchSession }),
    async (id) => {
      const t = localized(text)
      const row = typeof id === 'string' ? shown.get(id) : undefined
      // Nothing runs one resting: its page is where it goes on
      if (!row || row.state === 'ended' || row.resting)
        return { error: t.noSuchSession }
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

  /**
   * A session Pacenote runs, by its row's id: Claude Code's (claude:) or
   * Codex's (codex:)
   */
  const hostedOf = (
    id: unknown
  ): { tool: HostTool; session: string } | undefined => {
    if (typeof id !== 'string') return undefined
    for (const tool of ['claude', 'codex'] as const)
      if (id.startsWith(`${tool}:`) && id.length > tool.length + 1)
        return { tool, session: id.slice(tool.length + 1) }
    return undefined
  }

  /** The logs read last, kept while they have not changed */
  const logs = new Map<
    string,
    {
      size: number
      mtimeMs: number
      read: Pick<SessionTalk, 'items' | 'plan' | 'made'>
    }
  >()
  /** Its turns and steps, and its plan while a step of it is left */
  const readLog = (file: string, row: SessionRow) => {
    const info = statSync(file)
    const kept = logs.get(file)
    if (kept?.size === info.size && kept.mtimeMs === info.mtimeMs)
      return kept.read
    const read = readSessionTalk(file, row.tool, TURN_CHARS, row.cwd)
    logs.delete(file)
    logs.set(file, { size: info.size, mtimeMs: info.mtimeMs, read })
    for (const old of logs.keys()) if (logs.size > LOGS_KEPT) logs.delete(old)
    return read
  }

  /**
   * Its log: Claude Code's by its id, the one Codex said for a session
   * Pacenote runs, else the one the index found
   */
  const logOf = (row: SessionRow) =>
    (row.tool === 'claude'
      ? claudeLog(home, row.session)
      : row.tool === 'codex'
        ? codex.file(row.session)
        : undefined) ?? sessions.index.session(row.session)?.file
  /** How Pacenote runs it now, for its page */
  const liveOf = (row: SessionRow) =>
    row.tool === 'claude'
      ? host.get(row.session)
      : row.tool === 'codex'
        ? codex.get(row.session)
        : undefined

  /** A session as last shown; the list read first for a page opened first */
  const rowOf = async (id: unknown) => {
    if (typeof id !== 'string') return undefined
    if (!shown.has(id)) await viewing.run(read).catch(() => undefined)
    // One started just now, after the read that was under way began
    const hosted = hostedOf(id)
    if (
      !shown.has(id) &&
      hosted &&
      (hosted.tool === 'claude' ? host : codex).has(hosted.session)
    )
      await viewing.run(read).catch(() => undefined)
    return shown.get(id)
  }

  /**
   * Where you type to a session: here, for one Pacenote runs or that runs
   * nowhere now (ended, or resting: its run let go or its terminal closed);
   * here too for one resting in the Claude app or a terminal,
   * which moves here as you send (move); where it is open, while it works
   * there or for claude.ai; or in Codex, for one the Codex app or a terminal
   * runs (Z7), while one Pacenote ran continues here
   */
  const typeIn = (row: SessionRow): SessionTalk['typeIn'] =>
    row.tool === 'codex'
      ? row.where === 'pacenote' || codex.has(row.session)
        ? 'here'
        : 'codex'
      : row.tool !== 'claude'
        ? 'codex'
        : row.where === 'pacenote' ||
            row.state === 'ended' ||
            row.resting ||
            host.has(row.session)
          ? 'here'
          : MOVES_FROM.has(row.where) &&
              row.state !== 'working' &&
              !row.background
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
    const there = elsewhere(
      await openSessions.list(Date.now(), { fresh: true })
    )?.filter((agent) => agent.session === session)
    if (!there) return open ? { error: t.sessionOpenThere } : {}
    if (there.some((agent) => agent.busy))
      return { error: t.sessionWorkingThere }
    // Its process going takes its background tasks with it
    if (there.some((agent) => agent.background))
      return { error: t.sessionBackgroundThere }
    for (const agent of there) {
      if (!MOVES_FROM.has(agent.where) || agent.pid === undefined)
        return { error: t.sessionOpenThere }
      if (!(await openSessions.end(agent.pid, agent.where)))
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
      // is now, so the page says where it runs. One resting runs nowhere.
      if (
        (row?.tool === 'claude' &&
          host.has(row.session) !==
            (row.where === 'pacenote' && !row.resting)) ||
        (row?.tool === 'codex' &&
          codex.has(row.session) &&
          row.where !== 'pacenote')
      ) {
        await viewing.run(read).catch(() => undefined)
        row = shown.get(row.id) ?? row
      }
      if (!row || row.tool === 'opencode') return null
      const group = shownIn.get(row.id)?.group
      const live = liveOf(row)
      const talk = {
        row,
        ...(group ? { group } : {}),
        typeIn: typeIn(row),
        ...(live ? { live } : {}),
      }
      const file = logOf(row)
      // A Codex session just started writes its log once its turn is under way
      if (!file && row.tool === 'codex' && codex.has(row.session))
        return { ...talk, items: [] }
      if (!file)
        return {
          ...talk,
          items: [],
          error: localized(text).noSessionLog(TOOL_LABEL[row.tool]),
        }
      try {
        return { ...talk, ...readLog(file, row) }
      } catch (error) {
        return { ...talk, items: [], error: (error as Error).message }
      }
    }
  )

  /**
   * Opens a file a session's answer linked (A2, A6) in the Mac's app for it,
   * or shows it in Finder: only one its log names, in its folder, still there
   */
  ipc.handleDenying(
    'pacenote:sessions:openMade',
    () => ({ error: localized(text).noSuchFile }),
    async (id, key, how) => {
      const t = localized(text)
      const row = await rowOf(id)
      const file = row && logOf(row)
      if (!row || !file || typeof key !== 'string')
        return { error: t.noSuchFile }
      let made: MadeThing[] | undefined
      try {
        made = readLog(file, row).made
      } catch {
        return { error: t.noSuchFile }
      }
      const thing = made?.find((one) => one.kind === 'file' && one.key === key)
      if (!thing?.path || !existsSync(thing.path))
        return { error: t.noSuchFile }
      if (how === 'show') {
        shell.showItemInFolder(thing.path)
        return {}
      }
      const error = await shell.openPath(thing.path)
      return error ? { error } : {}
    }
  )

  /**
   * A session you type to here, what you typed and the images you sent with
   * it (src/sessions/images.ts): Claude Code's, or a Codex session Pacenote
   * runs
   */
  const typedTo = async (id: unknown, message: unknown) => {
    const t = localized(text)
    const row = await rowOf(id)
    if (!row) return { error: t.noSuchSession }
    if (
      row.tool !== 'claude' &&
      !(row.tool === 'codex' && typeIn(row) === 'here')
    )
      return { error: t.sessionOnlyClaude }
    const sent = cleanMessage(message)
    if ('refused' in sent) return { error: t.imagesRefused }
    const said = sent.text.trim()
    if (!said && !sent.images.length) return { error: t.emptyMessage }
    return { row, said: said.slice(0, MESSAGE_CHARS), images: sent.images }
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
      if (to.row.tool === 'codex') {
        const sent = await codex.send(
          to.row.session,
          to.row.cwd,
          to.said,
          to.images
        )
        return sent.error ? { error: localized(text).sessionNotHere } : {}
      }
      const where = typeIn(to.row)
      if (where !== 'here' && where !== 'move')
        return {
          error:
            to.row.background && MOVES_FROM.has(to.row.where)
              ? localized(text).sessionBackgroundThere
              : localized(text).sessionOpenThere,
        }
      // Open somewhere else as well: it moves here, the place you type in
      const moved = await moveHere(to.row.session, where === 'move')
      if (moved.error) return moved
      const sent = await host.send(
        to.row.session,
        to.row.cwd,
        to.said,
        to.images
      )
      return sent.error ? { error: localized(text).sessionNotHere } : {}
    }
  )

  /**
   * An image sent with a turn of a Claude Code session, from its log: a
   * data: URL for its page (SessionItem's ref, and its place in the turn)
   */
  ipc.handleDenying(
    'pacenote:sessions:image',
    () => null,
    async (id, ref, index): Promise<string | null> => {
      if (typeof ref !== 'string' || typeof index !== 'number') return null
      const row = await rowOf(id)
      if (row?.tool !== 'claude' && row?.tool !== 'codex') return null
      const file = logOf(row)
      if (!file) return null
      try {
        return readSessionImage(file, ref, index, row.tool) ?? null
      } catch {
        return null
      }
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
      if (to.row.tool !== 'claude')
        return { error: localized(text).sessionOnlyClaude }
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
   * Starts a new session here (V5), in the folder, with its first message:
   * Claude Code's, or Codex's (Z1). For a task, from Todo's Continue, it is
   * the task's work, its folder kept for its repository, and named after it.
   * Its page's id.
   */
  ipc.handleDenying(
    'pacenote:sessions:start',
    () => ({ error: localized(text).noSuchSession }),
    async (how) => {
      const t = localized(text)
      const {
        tool: asked,
        task: taskId,
        folder,
        message,
        mode,
        marker,
      } = (how ?? {}) as Record<string, unknown>
      if (settings.effectiveEnv().TASKS_LINK_SESSIONS !== 'on')
        return { error: t.sessionsOff }
      if (asked !== undefined && asked !== 'claude' && asked !== 'codex')
        return { error: t.noSuchSession }
      const tool: HostTool = asked ?? 'claude'
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
      if (
        mode !== undefined &&
        !(tool === 'codex'
          ? isCodexMode(mode)
          : SESSION_MODES.includes(mode as SessionMode))
      )
        return { error: t.noSuchSession }
      const task =
        taskId === undefined
          ? undefined
          : allTaskViews(dataDir).find(
              (each) => each.id === taskId && each.status === 'open'
            )
      if (taskId !== undefined && !task) return { error: t.noSuchTask }
      const name = task?.title.replace(/\s+/g, ' ').trim().slice(0, NAME_CHARS)
      let session: string
      if (tool === 'codex') {
        const ready = await codexTools()
        if (!ready.codex.ready) return { error: t.codexNotReady }
        const started = await codex.begin(folder, said.slice(0, FIRST_CHARS), {
          ...(name && { name }),
          ...(mode !== undefined && { mode: mode as CodexMode }),
        })
        if (!started.session)
          return { error: t.sessionNotStarted(started.error ?? '', 'Codex') }
        session = started.session
      } else {
        session = randomUUID()
        const started = host.begin(
          session,
          folder,
          said.slice(0, FIRST_CHARS),
          {
            ...(name && { name }),
            ...(mode !== undefined && { mode: mode as SessionMode }),
          }
        )
        if (started.error) return { error: t.sessionNotStarted(started.error) }
      }
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
          tool,
          session,
          cwd: folder,
          startedAt: new Date().toISOString(),
        })
      }
      return { id: `${tool}:${session}` }
    }
  )

  /** Runs Codex as you would: your PATH, outside any project */
  const codexRunner = (args: string[]) =>
    runProcess(cliBins().codex, args, {
      cwd: homedir(),
      input: '',
      timeoutMs: 20_000,
      env: { ...hostEnv(process.env), PATH: toolPath() },
    })
  let toolsKept: { at: number; tools: Promise<SessionTools> } | undefined
  /**
   * Whether Codex can run a session here (Z1): on this Mac, signed in, and
   * new enough for its app-server; checked again after a while
   */
  const codexTools = (): Promise<SessionTools> => {
    if (toolsKept && Date.now() - toolsKept.at < TOOLS_MS)
      return toolsKept.tools
    const tools = checkCli('codex', cliBins().codex, codexRunner).then(
      (check): SessionTools => ({
        codex: !check.installed
          ? { ready: false, why: 'missing' }
          : !check.signedIn
            ? { ready: false, why: 'signedOut' }
            : !check.version ||
                olderThan(check.version, CODEX_SESSIONS_MIN_VERSION)
              ? { ready: false, why: 'old' }
              : { ready: true },
      }),
      (): SessionTools => ({ codex: { ready: false, why: 'missing' } })
    )
    toolsKept = { at: Date.now(), tools }
    return tools
  }
  ipc.handleDenying(
    'pacenote:sessions:tools',
    () => ({ codex: { ready: false } }),
    () => codexTools()
  )

  /** Your answer to what it asks: allow, allow in this session, or deny */
  ipc.handleDenying(
    'pacenote:sessions:answer',
    () => ({ error: localized(text).noSuchSession }),
    (id, ask, answer, message) => {
      const hosted = hostedOf(id)
      if (
        !hosted ||
        typeof ask !== 'string' ||
        (answer !== 'allow' && answer !== 'always' && answer !== 'deny')
      )
        return { error: localized(text).noSuchSession }
      return done(
        (hosted.tool === 'claude' ? host : codex).answer(
          hosted.session,
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
      const hosted = hostedOf(id)
      return hosted
        ? done((hosted.tool === 'claude' ? host : codex).stop(hosted.session))
        : done({ error: 'gone' })
    }
  )

  /** Ends its run here; the conversation stays in its tool's own log */
  ipc.handleDenying(
    'pacenote:sessions:end',
    () => ({ error: localized(text).noSuchSession }),
    (id) => {
      const hosted = hostedOf(id)
      if (hosted) (hosted.tool === 'claude' ? host : codex).end(hosted.session)
      return {}
    }
  )

  /**
   * Closes it: its run here ends, and it moves to Ended until it writes to
   * its log again. Its tool keeps the conversation, to read or continue.
   */
  const closeHere = (id: string) => {
    const hosted = hostedOf(id)
    if (hosted) (hosted.tool === 'claude' ? host : codex).end(hosted.session)
    closeSession(dataDir, id)
    shown.delete(id)
  }
  ipc.handleDenying(
    'pacenote:sessions:close',
    () => ({ error: localized(text).noSuchSession }),
    async (id) => {
      const row = await rowOf(id)
      if (!row) return { error: localized(text).noSuchSession }
      closeHere(row.id)
      return {}
    }
  )

  /** Its open task and its last turns, for its Wrap up; or why there is none */
  const wrapOf = async (
    id: unknown
  ): Promise<{ row: SessionRow; task: TaskView } | { error: string }> => {
    const t = localized(text)
    const row = await rowOf(id)
    if (!row || row.tool === 'opencode') return { error: t.noSuchSession }
    if (!row.task) return { error: t.sessionNoTask }
    const task = allTaskViews(dataDir).find((each) => each.id === row.task!.id)
    if (!task) return { error: t.noSuchTask }
    if (task.status !== 'open') return { error: t.sessionTaskClosed }
    return { row, task }
  }

  /**
   * How its work on its task ended, as your AI reads its last turns: what was
   * done and what is left, for you to change before you wrap it up
   */
  ipc.handleDenying(
    'pacenote:sessions:wrap-draft',
    () => ({ error: localized(text).noSuchSession }),
    async (id): Promise<SessionWrapDraft> => {
      const t = localized(text)
      const found = await wrapOf(id)
      if ('error' in found) return found
      const { row, task } = found
      const file = logOf(row)
      const items = file ? readSessionLog(file, row.tool) : []
      if (!items.length) return { error: t.noSessionLog(TOOL_LABEL[row.tool]) }
      const draft = await sessions.judgeNow(task, items, row.branch)
      if ('error' in draft) {
        log.warn(`Could not write how ${row.id} ended: ${draft.error}`)
        return { error: t.wrapNotWritten }
      }
      return draft
    }
  )

  /**
   * Wraps it up: its task closes with what was done, each thing left you kept
   * becomes a task after it, and the session closes, unless you keep it open
   */
  ipc.handleDenying(
    'pacenote:sessions:wrap-up',
    () => ({ error: localized(text).noSuchSession }),
    async (id, how) => {
      const found = await wrapOf(id)
      if ('error' in found) return found
      const { row, task } = found
      const { summary, keep, close } = (how ?? {}) as Record<string, unknown>
      closeTask(dataDir, task.id, 'resolved', new Date(), {
        by: WORK_TOOL_CLIENTS[row.tool],
        wrapUp: typeof summary === 'string' ? summary : undefined,
      })
      let kept = 0
      for (const title of Array.isArray(keep) ? keep.slice(0, 10) : [])
        if (
          typeof title === 'string' &&
          title.trim() &&
          !(
            'error' in
            addFollowUp(
              dataDir,
              {
                title: title.trim().slice(0, 200),
                why: 'Left after it, from its session',
                after: task.id,
              },
              { addedBy: 'pacenote' }
            )
          )
        )
          kept += 1
      if (close !== false) closeHere(row.id)
      log.info(
        `Wrapped up ${task.id} from its ${row.tool} session${kept ? `, ${kept} left kept as tasks` : ''}`
      )
      return { kept }
    }
  )

  /** Changes how it asks before it acts: Claude Code's modes, or Codex's */
  ipc.handleDenying(
    'pacenote:sessions:mode',
    () => ({ error: localized(text).noSuchSession }),
    (id, mode) => {
      const hosted = hostedOf(id)
      if (hosted?.tool === 'codex')
        return isCodexMode(mode)
          ? done(codex.setMode(hosted.session, mode))
          : { error: localized(text).noSuchSession }
      if (!hosted || !SESSION_MODES.includes(mode as SessionMode))
        return { error: localized(text).noSuchSession }
      return done(host.setMode(hosted.session, mode as SessionMode))
    }
  )
}
