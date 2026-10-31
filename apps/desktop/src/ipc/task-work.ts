import { clipboard, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import {
  getLocale,
  localized,
  type Locale,
} from '../../../../src/i18n/locale.js'
import type { Macs } from '../../../../src/macs/macs.js'
import {
  outcomeOf,
  taskContext,
  threadOf,
  TOOL_LABEL,
} from '../../../../src/tasks/context.js'
import { repoFolder, saveRepo } from '../../../../src/tasks/folders.js'
import { allTaskViews } from '../../../../src/tasks/store.js'
import type { Proposal, WorkEntry } from '../../../../src/tasks/types.js'
import {
  addWork,
  changeWork,
  openProposals,
  readWork,
  UNSENT_MS,
  updateWork,
  workFor,
} from '../../../../src/tasks/work.js'
import { addFollowUp, closeTask } from '../../../../src/tasks/write.js'
import { draftReply } from '../drafter.js'
import {
  findClaudeSession,
  findCodexSession,
  openSession,
  readSessionLog,
  resumeCommand,
  resumeSession,
  sessionFile,
  signInCli,
  terminalOf,
  type HandoffOptions,
  type Session,
} from '../handoff.js'
import { text } from '../main.text.js'
import { appMcpLaunch } from '../mcp-clients.js'
import type { OpencodeSessions } from '../opencode-sessions.js'
import { refusalOf } from '../own-ai.js'
import type { TaskSessions } from '../task-sessions.js'
import type { TodoSettings } from '../todo-settings.js'
import type { Desktop } from './context.js'
import { orError, type Ipc } from './gate.js'

/**
 * A task's detail and the work on it: what came before it, its work log,
 * continuing it in Claude Code, Codex or opencode, and drafting a reply for
 * you to send yourself
 */
export function registerTaskWorkIpc(
  ipc: Ipc,
  desktop: Desktop,
  {
    todo,
    sessions,
    opencodeSessions,
    macs,
    historyMcp,
  }: {
    todo: TodoSettings
    sessions: TaskSessions
    opencodeSessions: OpencodeSessions
    /** Your other Macs, for a session on one of them */
    macs: () => Macs | undefined
    /** The history MCP server a draft reads the thread with */
    historyMcp: string
  }
): void {
  const { dataDir, settings, reader, cliBins, ownAi, ownWork } = desktop
  // A task's detail: what came before it, its work log, and continuing it in
  // Claude Code or Codex, or drafting a reply to send yourself
  const env = () => settings.effectiveEnv()
  const handoff = (): HandoffOptions => ({
    dataDir,
    home: homedir(),
    bin: (tool) => cliBins()[tool],
    terminal: () => terminalOf(env().TASKS_TERMINAL),
    planFirst: () => env().TASKS_PLAN_FIRST !== 'off',
    openIn: () => (env().TASKS_OPEN_IN === 'app' ? 'app' : 'terminal'),
    hasApp: todo.hasApp,
  })
  // Pacenote's own work signed out: claude auth login (or codex login), in
  // your terminal
  ipc.handle('pacenote:tasks:sign-in', undefined, (cli) =>
    orError(async () => {
      await signInCli(handoff(), cli === 'codex' ? 'codex' : 'claude')
      return {}
    })
  )
  /**
   * A task with what came before it, worded in the app's language for the
   * window, or in English for a prompt (a session opened on it, a draft)
   */
  const taskDetail = (id: string, locale: Locale = getLocale()) => {
    const all = allTaskViews(dataDir)
    const task = all.find((t) => t.id === id)
    if (!task) return null
    // Codex sessions Pacenote opened, and those opened in a desktop app, get
    // their id once they have started; one opened in an app is looked for a
    // day, even when opened again since.
    for (const entry of readWork(dataDir).entries)
      if (
        entry.kind === 'session' &&
        entry.task === id &&
        !entry.session &&
        !entry.mac &&
        (!entry.app || Date.now() - Date.parse(entry.startedAt) <= UNSENT_MS)
      ) {
        // opencode's are found in the background (opencodeSessions)
        const session =
          entry.tool === 'codex'
            ? findCodexSession(homedir(), entry)
            : entry.tool === 'claude'
              ? findClaudeSession(homedir(), entry)
              : undefined
        if (session) updateWork(dataDir, entry.id, (e) => ({ ...e, session }))
      }
    sessions.linkSoon()
    const file = readWork(dataDir)
    const work = file.entries
    const thread = threadOf(task)
    const at = thread.indexOf(':')
    const context = taskContext(
      task,
      all,
      work,
      reader.inThread(thread.slice(0, at), thread.slice(at + 1)),
      locale
    )
    return {
      task,
      context,
      outcome: outcomeOf(task, work, locale),
      // A session on another of your Macs has its log there
      work: workFor(work, id).map((entry) =>
        entry.kind === 'session' && !entry.mac
          ? {
              ...entry,
              ...sessions.sessionNow(entry),
              resume: resumeCommand(entry),
            }
          : entry
      ),
      suggested: (file.suggested ?? [])
        .filter((s) => s.task === id)
        .map((s) => ({
          ...s,
          lastActiveAt: sessions.sessionNow(s).lastActiveAt,
        })),
      folder: task.repo ? repoFolder(dataDir, task.repo) : undefined,
      cli:
        env().TASKS_CLI === 'codex' ? ('codex' as const) : ('claude' as const),
    }
  }
  /** A session in a task's work log, or one suggested for it */
  const sessionEntry = (entryId: unknown): Session | undefined => {
    const file = readWork(dataDir)
    const entry =
      file.entries.find((e) => e.id === entryId) ??
      file.suggested?.find((s) => s.id === entryId)
    return entry?.kind === 'session' ? entry : undefined
  }
  ipc.handle('pacenote:tasks:detail', null, (id) =>
    typeof id === 'string' ? taskDetail(id) : null
  )
  // What a task's quiet session looked like: close the task with how it
  // ended, or not yet; or keep a thing left after it as a task
  const answered = (id: string, change: (p: Proposal) => Proposal) =>
    changeWork(dataDir, (work) => ({
      ...work,
      proposals: (work.proposals ?? []).map((p) =>
        p.task === id && !p.answer ? change(p) : p
      ),
    }))
  ipc.handle('pacenote:tasks:answer-proposal', undefined, (id, answer) => {
    if (typeof id !== 'string') return undefined
    const proposal = openProposals(readWork(dataDir), new Set([id]))[id]
    if (!proposal) return { error: localized(text).nothingToAnswer }
    if (answer === 'close') {
      // Done in its session; how it ended is the wrap-up, not a note too
      closeTask(dataDir, id, 'resolved', new Date(), {
        by: proposal.tool === 'claude' ? 'claude-code' : 'codex',
        wrapUp: proposal.summary,
      })
      answered(id, (p) => ({ ...p, answer: 'closed' }))
    } else answered(id, (p) => ({ ...p, answer: 'not-yet' }))
    return {}
  })
  ipc.handle('pacenote:tasks:keep-left', undefined, (id, text) => {
    if (typeof id !== 'string') return undefined
    if (typeof text !== 'string' || !text.trim()) return undefined
    const result = addFollowUp(
      dataDir,
      { title: text, why: 'Left after it, from its session', after: id },
      { addedBy: 'pacenote' }
    )
    if ('error' in result) return result
    answered(id, (p) => ({
      ...p,
      left: (p.left ?? []).filter((item) => item !== text),
    }))
    return { id: result.task.id }
  })
  ipc.handle('pacenote:tasks:continue', undefined, async (id, how) => {
    if (typeof id !== 'string') return undefined
    const { tool, folder } = (how ?? {}) as { tool?: unknown; folder?: unknown }
    const t = localized(text)
    const detail = taskDetail(id, 'en')
    if (!detail) return { error: t.noSuchTask }
    if (typeof folder !== 'string' || !folder)
      return { error: t.chooseFolderFirst }
    return orError(async () => {
      if (detail.task.repo) saveRepo(dataDir, detail.task.repo, folder)
      const { entry, note } = await openSession(
        handoff(),
        detail.task,
        detail.context,
        tool === 'codex' ? 'codex' : 'claude',
        folder
      )
      addWork(dataDir, entry)
      return { entry, note }
    })
  })
  ipc.handle('pacenote:tasks:resume', undefined, async (entryId) => {
    const t = localized(text)
    const entry = sessionEntry(entryId)
    if (!entry) return { error: t.noSuchSession }
    if (entry.mac)
      return {
        error: t.sessionElsewhere(
          macs()
            ?.view()
            .macs.find((mac) => mac.id === entry.mac)?.name ?? t.otherMac
        ),
      }
    return orError(async () => {
      await resumeSession(handoff(), entry)
      updateWork(dataDir, entry.id, (e) =>
        e.kind === 'session'
          ? {
              ...e,
              resumedAt: [...(e.resumedAt ?? []), new Date().toISOString()],
            }
          : e
      )
      return {}
    })
  })
  const drafting = new Set<string>()
  ipc.handle('pacenote:tasks:draft', undefined, async (id) => {
    if (typeof id !== 'string') return undefined
    const t = localized(text)
    const detail = taskDetail(id, 'en')
    if (!detail) return { error: t.noSuchTask }
    if (drafting.has(id)) return { error: t.drafting }
    drafting.add(id)
    try {
      const launch = appMcpLaunch(historyMcp)
      const ran = await ownAi.run(
        (cli) =>
          draftReply({
            ...ownWork(cli),
            launch,
            task: detail.task,
            context: detail.context,
          }),
        refusalOf
      )
      if ('resting' in ran) return { error: t.bothResting }
      const draft = ran.result
      if ('error' in draft) return { error: draft.error }
      const entry: WorkEntry = {
        kind: 'draft',
        id: randomUUID(),
        task: id,
        at: new Date().toISOString(),
        text: draft.text,
        by: ran.by,
        ...(ran.switched ? { switched: ran.switched } : {}),
      }
      addWork(dataDir, entry)
      return { entry }
    } finally {
      drafting.delete(id)
    }
  })
  ipc.handle('pacenote:tasks:copy-reply', undefined, (id, reply) => {
    if (typeof id !== 'string') return undefined
    const t = localized(text)
    if (typeof reply !== 'string' || !reply.trim())
      return { error: t.emptyReply }
    const task = allTaskViews(dataDir).find((view) => view.id === id)
    if (!task) return { error: t.noSuchTask }
    clipboard.writeText(reply)
    const at = new Date().toISOString()
    const latest = workFor(readWork(dataDir).entries, id).find(
      (entry) => entry.kind === 'draft'
    )
    if (latest)
      updateWork(dataDir, latest.id, (e) =>
        e.kind === 'draft' ? { ...e, text: reply, copiedAt: at } : e
      )
    else
      addWork(dataDir, {
        kind: 'draft',
        id: randomUUID(),
        task: id,
        at,
        text: reply,
        copiedAt: at,
      })
    const link = task.source.permalink
    if (link && /^https:\/\//.test(link)) void shell.openExternal(link)
    return {}
  })
  ipc.handle('pacenote:tasks:session-log', undefined, (entryId) => {
    const t = localized(text)
    const entry = sessionEntry(entryId)
    if (!entry) return { error: t.noSuchSession }
    if (entry.tool === 'opencode')
      return opencodeSessions
        .log(entry)
        .then((items) =>
          items ? { items } : { error: t.noSessionLog(TOOL_LABEL.opencode) }
        )
    const file = sessionFile(homedir(), entry)
    if (!file) return { error: t.noSessionLog(TOOL_LABEL[entry.tool]) }
    return orError(() => ({ items: readSessionLog(file, entry.tool) }))
  })
}
