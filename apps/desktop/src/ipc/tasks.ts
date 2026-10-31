import { dialog } from 'electron'
import { homedir } from 'node:os'
import path from 'node:path'
import { localized } from '../../../../src/i18n/locale.js'
import { liveTasks, readActivity } from '../../../../src/tasks/activity.js'
import { recentCollections } from '../../../../src/tasks/collections.js'
import {
  checkFolder,
  readRepos,
  recentFolders,
  repoFolderRows,
  saveRepo,
  suggestFolders,
} from '../../../../src/tasks/folders.js'
import { ADDED_BY_YOU } from '../../../../src/tasks/sources.js'
import {
  allTaskViews,
  buildView,
  decide,
  readDecisions,
  readStages,
  readTasks,
  setStage,
  tasksView,
} from '../../../../src/tasks/store.js'
import { taskTrend } from '../../../../src/tasks/trend.js'
import type {
  CollectionRecord,
  TaskDecision,
  TasksCollect,
} from '../../../../src/tasks/types.js'
import {
  answerSuggestion,
  openProposals,
  readWork,
  updateWork,
} from '../../../../src/tasks/work.js'
import { addFollowUp } from '../../../../src/tasks/write.js'
import {
  answerGroup,
  notYourGroups,
  yourGroups,
} from '../../../../src/tasks/you.js'
import { taskArea } from '../../../../src/you/areas.js'
import { readYou } from '../../../../src/you/store.js'
import type { Session } from '../handoff.js'
import { text } from '../main.text.js'
import type { OpencodeSessions } from '../opencode-sessions.js'
import type { TaskCollector } from '../task-collector.js'
import type { TaskSessions } from '../task-sessions.js'
import type { TodoSettings } from '../todo-settings.js'
import type { Desktop } from './context.js'
import type { Ipc } from './gate.js'

/**
 * Your tasks: AI tools add them through the MCP server; Todo shows them and
 * keeps your decisions (tasks-decisions.json, which only the app writes),
 * your stages, the groups that mean you, and where each repository opens
 */
export function registerTasksIpc(
  ipc: Ipc,
  desktop: Desktop,
  {
    todo,
    sessions,
    taskCollector,
    opencodeSessions,
    collectionRuns,
    collectState,
  }: {
    todo: TodoSettings
    sessions: TaskSessions
    /** Collect now on the Todo screen */
    taskCollector: TaskCollector
    opencodeSessions: OpencodeSessions
    /** The Collect now runs of the last days */
    collectionRuns: (
      days: number
    ) => ReturnType<Desktop['reader']['collections']>
    /** Collect now as Todo shows it, here or on another of your Macs */
    collectState: (collections: CollectionRecord[]) => TasksCollect
  }
): void {
  const { dataDir, settings, ownAi } = desktop
  // Asked every few seconds while Todo is open: each file is read once.
  ipc.handle('pacenote:tasks:list', null, () => {
    const current = todo.current()
    const file = readTasks(dataDir)
    const view = buildView(file, readDecisions(dataDir), {
      excluded: current.exclude,
    })
    sessions.linkSoon()
    sessions.judgeSoon()
    // opencode's sessions: found once started, and when each last wrote
    void opencodeSessions.refreshSoon(
      readWork(dataDir).entries.filter(
        (entry): entry is Session => entry.kind === 'session' && !entry.mac
      ),
      (entry, session) =>
        updateWork(dataDir, entry.id, (e) => ({ ...e, session }))
    )
    const open = view.tasks.filter((task) => task.status === 'open')
    const yours = yourGroups(current)
    const areas = readYou(dataDir).areas
    const work = readWork(dataDir)
    const collections = recentCollections(dataDir, collectionRuns(7))
    return {
      settings: current,
      collect: collectState(collections),
      ai: ownAi.now(),
      collections,
      ...view,
      working: sessions.working(open, work.entries),
      // What you set for open tasks: started, waiting (src/tasks/stage.ts)
      stages: readStages(dataDir),
      proposals: openProposals(work, new Set(open.map((task) => task.id))),
      // A Maybe from a group neither list has asks whether it means you.
      groups: { yours, notYours: notYourGroups(file, yours) },
      // The area each task is in, for its row (src/you)
      areas: Object.fromEntries(
        view.tasks.flatMap((task) => {
          const area = taskArea(areas, task)
          return area ? [[task.id, area]] : []
        })
      ),
    }
  })
  // Who you are in Slack, as Collect now last looked you up
  ipc.handle('pacenote:tasks:you', null, () => readTasks(dataDir).you ?? null)
  // Whether a user group means you: one that does goes into Settings, and its
  // Maybes into the list; one that does not is not asked about again.
  ipc.handle('pacenote:tasks:answer-group', {}, (value, yours) => {
    if (typeof value !== 'string') return {}
    const group = answerGroup(dataDir, value, yours === true)
    if (!group) return { error: localized(text).notAGroup(value) }
    if (yours !== true) return {}
    const current = todo.current()
    if (!yourGroups(current).includes(group)) {
      const problems = settings.save({
        TASKS_GROUPS: [...(current.groups ?? []), group].join(', '),
      })
      if (problems.length > 0)
        return { error: problems.map((p) => p.message).join(' ') }
    }
    const kept = tasksView(dataDir, current.exclude).tasks.filter(
      (task) => task.status === 'maybe' && task.group === group
    )
    for (const task of kept) decide(dataDir, task.id, { status: 'kept' })
    return { kept: kept.length }
  })
  // The Overview's tasks: what you handled over the last 14 days
  ipc.handle('pacenote:tasks:trend', null, () => {
    const current = todo.current()
    if (!current.on) return null
    const view = tasksView(dataDir, current.exclude)
    return taskTrend(view.tasks, readWork(dataDir).entries)
  })
  // What AI tools are doing with your tasks now, over MCP
  ipc.handle('pacenote:tasks:live', null, () =>
    todo.current().on ? liveTasks(readActivity(dataDir)) : null
  )
  ipc.handle('pacenote:tasks:collect', undefined, () => {
    if (!todo.current().on)
      return {
        at: new Date().toISOString(),
        ok: false,
        error: localized(text).tasksOff,
      }
    return taskCollector.run()
  })
  ipc.handle('pacenote:tasks:collect-stop', undefined, () =>
    taskCollector.cancel()
  )
  ipc.handle('pacenote:tasks:decide', undefined, (id, decision) => {
    if (typeof id !== 'string') return
    decide(dataDir, id, taskDecision(decision))
  })
  // In progress, waiting on someone else, or back to open
  ipc.handle('pacenote:tasks:stage', undefined, (id, stage) => {
    if (typeof id !== 'string') return
    if (stage === 'started' || stage === 'waiting' || stage === 'open')
      setStage(dataDir, id, stage)
  })
  // A task you add yourself (Todo's New task), in a project's repository
  ipc.handle('pacenote:tasks:add', undefined, (title, repo) => {
    if (typeof title !== 'string' || !title.trim()) return undefined
    const result = addFollowUp(
      dataDir,
      {
        title,
        why: 'Added by you',
        repo: typeof repo === 'string' ? repo : undefined,
      },
      { addedBy: ADDED_BY_YOU }
    )
    if ('error' in result) return result
    return { id: result.task.id }
  })
  ipc.handle('pacenote:tasks:leave-out', [], (label) => {
    if (typeof label !== 'string' || !label.trim()) return []
    const { exclude } = todo.current()
    if (exclude.includes(label)) return []
    return settings.save({
      TASKS_EXCLUDE_CHANNELS: [...exclude, label].join(', '),
    })
  })
  // A suggested session: yours for the task, or not
  ipc.handle('pacenote:tasks:answer-suggestion', undefined, (entryId, yes) => {
    if (typeof entryId !== 'string') return
    answerSuggestion(dataDir, entryId, yes === true)
    // A session that is the task's lends it its branch: look again.
    sessions.linkSoon(true)
  })
  // Where a task may open: its repository's folder and checkouts, or the
  // folders you worked in lately, likeliest first
  ipc.handle('pacenote:tasks:folders', [], (id) => {
    if (typeof id !== 'string') return []
    const task = allTaskViews(dataDir).find((t) => t.id === id)
    return task ? suggestFolders(task, { home: homedir(), dataDir }) : []
  })
  ipc.handle('pacenote:tasks:choose-folder', undefined, async (repo) => {
    const window = desktop.window.current
    if (!window) return undefined
    // Next to the folder you worked in last, where your checkouts are
    const [last] = recentFolders(homedir(), { leaveOut: [dataDir], limit: 1 })
    const t = localized(text)
    const result = await dialog.showOpenDialog(window, {
      title: typeof repo === 'string' ? t.whereIs(repo) : t.chooseFolder,
      defaultPath: last ? path.dirname(last.path) : homedir(),
      properties: ['openDirectory'],
    })
    const folder = result.filePaths[0]
    if (result.canceled || !folder) return undefined
    return checkFolder(folder, typeof repo === 'string' ? repo : undefined)
  })
  ipc.handle('pacenote:tasks:repos', {}, () => readRepos(dataDir))
  // Settings > Todo: the repositories you work in, and where each opens
  ipc.handle('pacenote:tasks:repo-rows', [], () =>
    repoFolderRows(
      dataDir,
      homedir(),
      allTaskViews(dataDir)
        .filter((task) => task.status === 'open' && task.repo)
        .map((task) => task.repo!)
    )
  )
  // Settings > Todo: whether the Claude app and the Codex app are on this Mac
  ipc.handle('pacenote:tasks:apps', null, () => ({
    claude: todo.hasApp('claude'),
    codex: todo.hasApp('codex'),
    opencode: false,
  }))
  ipc.handle('pacenote:tasks:set-repo', {}, (repo, folder) => {
    if (typeof repo !== 'string') return {}
    return saveRepo(
      dataDir,
      repo,
      typeof folder === 'string' && folder ? folder : undefined
    )
  })
}

/** A decision from the screen, or undefined to take one back */
function taskDecision(value: unknown): Omit<TaskDecision, 'at'> | undefined {
  const { status, reason } = (value ?? {}) as Partial<TaskDecision>
  if (status !== 'done' && status !== 'dismissed' && status !== 'kept')
    return undefined
  const reasons = ['not-mine', 'done-already', 'not-worth-it']
  return status === 'dismissed' && reason && reasons.includes(reason)
    ? { status, reason }
    : { status }
}
