import type { Logger } from '../../../src/logger.js'
import { keepSpent } from '../../../src/history/spent.js'
import {
  bundleFillFrom,
  bundleFillPrompt,
  bundleWrapFrom,
  bundleWrapPrompt,
  suggestionsFrom,
  suggestPrompt,
} from '../../../src/tasks/bundle-ai.js'
import {
  bundlesOf,
  looksDue,
  noteLooked,
  readBundlesFile,
  setBundleFill,
  suggestBundle,
} from '../../../src/tasks/bundles.js'
import type { OwnCli } from '../../../src/tasks/own-ai.js'
import { FILLED_IN } from '../../../src/tasks/filled.js'
import { allTaskViews } from '../../../src/tasks/store.js'
import { WORK_TOOL_CLIENTS, type TaskView } from '../../../src/tasks/types.js'
import { runPlainWork, type PlainWork } from './headless.js'
import { refusalOf, type OwnAi } from './own-ai.js'

/**
 * Groups of tasks with your AI (src/tasks/bundles.ts): after it fills in a
 * task or a collection ends, and when tasks come from a session, it looks
 * at a project's open tasks for ones that are one piece of work, but only
 * where there are enough of them and one is new since it last looked; and it
 * fills in each group you made whose tasks changed. One run at a time, on
 * the CLI that does Pacenote's own work, headless with no tools, falling
 * back as that work does. A CLI that cannot leaves things as they are.
 */

const RUN_MS = 3 * 60_000
/** Tasks that come by themselves (a session's) wait this long to go together */
const SETTLE_MS = 60_000
/** And are looked at this often at most */
const LOOK_EVERY_MS = 10 * 60_000

type Ran = { text: string } | { error: string } | { resting: string }

export class Bundler {
  constructor(
    private readonly options: {
      dataDir: string
      ownAi: OwnAi
      ownWork: (cli: OwnCli) => Omit<PlainWork, 'prompt'>
      opencodeRun: () => NonNullable<PlainWork['opencode']>
      /** Group similar tasks is on and an AI is set up */
      on: () => boolean
      log: Logger
      /** Called when what is filling or suggested changes */
      onChange: () => void
      settleMs?: number
    }
  ) {}

  private busy = false
  private again = false
  private timer: NodeJS.Timeout | undefined
  private lookedAt = 0
  /** Groups being filled in now, or waiting to be */
  private fills = new Set<string>()
  /** Groups to fill in even if their tasks did not change (Fill again) */
  private forced = new Set<string>()

  /** The groups your AI is filling in now */
  filling(): string[] {
    return [...this.fills]
  }

  /** A task was filled in, or a collection ended: look now */
  soon(): void {
    this.lookedAt = 0
    void this.run()
  }

  /** Your tasks changed on disk: look after they settle, now and then */
  changed(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(
      () => void this.run(),
      this.options.settleMs ?? SETTLE_MS
    )
    this.timer.unref?.()
  }

  /** Fill a group in now: one you just made, or Fill again */
  fill(bundleId: string, force = false): void {
    if (!this.options.on()) return
    if (force) this.forced.add(bundleId)
    this.fills.add(bundleId)
    this.options.onChange()
    void this.run()
  }

  stop(): void {
    clearTimeout(this.timer)
  }

  private async run(): Promise<void> {
    if (this.busy) {
      this.again = true
      return
    }
    if (!this.options.on()) {
      if (this.fills.size) {
        this.fills.clear()
        this.options.onChange()
      }
      return
    }
    this.busy = true
    try {
      do {
        this.again = false
        await this.fillDue()
        if (Date.now() - this.lookedAt >= LOOK_EVERY_MS) await this.look()
      } while (this.again)
    } catch (error) {
      this.options.log.warn(`Could not look at task groups: ${String(error)}`)
    } finally {
      this.busy = false
      this.fills.clear()
      this.forced.clear()
      this.options.onChange()
    }
  }

  private async ask(
    prompt: string,
    title: string
  ): Promise<Ran & { by?: string }> {
    const { dataDir, ownAi } = this.options
    const ran = await ownAi.run(
      async (cli) => {
        const { output, failed } = await runPlainWork({
          ...this.options.ownWork(cli),
          opencode: this.options.opencodeRun(),
          spent: (usage) => keepSpent(dataDir, 'fill', usage),
          prompt,
          title,
          timeoutMs: RUN_MS,
        })
        if (output && 'text' in output) return { text: output.text }
        return failed({
          slow: 'It took too long.',
          nothing: 'It gave no answer.',
        })
      },
      refusalOf,
      { background: true }
    )
    if ('resting' in ran) return { resting: ran.resting }
    return { ...ran.result, by: WORK_TOOL_CLIENTS[ran.by] }
  }

  /** Each group whose tasks changed since it was filled in, or never was */
  private async fillDue(): Promise<void> {
    const { dataDir, log } = this.options
    const tasks = allTaskViews(dataDir)
    const file = readBundlesFile(dataDir)
    const view = bundlesOf(tasks, file.bundles)
    const due = view.groups.filter(
      (group) =>
        this.forced.has(group.id) ||
        (!group.tookBack && (!group.fill || group.stale))
    )
    for (const group of due) this.fills.add(group.id)
    if (due.length) this.options.onChange()
    const byId = new Map(tasks.map((task) => [task.id, task]))
    for (const group of due) {
      const members = group.tasks.flatMap((id) => {
        const task = byId.get(id)
        return task ? [task] : []
      })
      // All done: nothing left to plan
      if (!members.some((task) => task.status === 'open')) {
        this.fills.delete(group.id)
        continue
      }
      const ran = await this.ask(
        bundleFillPrompt(members),
        'Pacenote: fill in a group of tasks'
      )
      this.fills.delete(group.id)
      this.forced.delete(group.id)
      if ('resting' in ran) {
        log.info(`Groups left as they are: your AI rests until ${ran.resting}`)
        return
      }
      if ('error' in ran) {
        log.warn(`Could not fill in the group ${group.id}: ${ran.error}`)
        continue
      }
      const fill = bundleFillFrom(ran.text, members, { by: ran.by })
      if (fill) setBundleFill(dataDir, group.id, fill)
      else log.info(`Left the group ${group.id} as it is: no usable answer`)
      this.options.onChange()
    }
  }

  /** Where enough open tasks of a project are new, ask which are one piece */
  private async look(): Promise<void> {
    const { dataDir, log } = this.options
    this.lookedAt = Date.now()
    const due = looksDue(allTaskViews(dataDir), readBundlesFile(dataDir))
    for (const { repo, tasks } of due) {
      const ran = await this.ask(
        suggestPrompt(repo, tasks),
        'Pacenote: look for task groups'
      )
      if ('resting' in ran) {
        log.info(`Not looking for groups until ${ran.resting}: your AI rests`)
        return
      }
      // Looked either way, so the same tasks are not asked about again
      noteLooked(
        dataDir,
        repo,
        tasks.map((task) => task.id)
      )
      if ('error' in ran) {
        log.warn(`Could not look for groups in ${repo}: ${ran.error}`)
        continue
      }
      const after = newestFilled(tasks)
      for (const suggestion of suggestionsFrom(ran.text, tasks)) {
        const id = suggestBundle(dataDir, {
          ...suggestion,
          ...(ran.by && { by: ran.by }),
          ...(after && suggestion.tasks.includes(after) && { after }),
        })
        if (id)
          log.info(
            `Your AI suggests grouping ${suggestion.tasks.length} tasks in ${repo}`
          )
      }
      this.options.onChange()
    }
  }

  /**
   * Done all: one wrap-up of what was done, for you to edit; undefined when
   * your AI could not write one
   */
  async wrapUp(
    title: string,
    members: readonly TaskView[]
  ): Promise<{ text: string; by?: string } | { error: string }> {
    const ran = await this.ask(
      bundleWrapPrompt(title, members),
      'Pacenote: write up a group of tasks'
    )
    if ('resting' in ran)
      return { error: `Your AI rests until ${ran.resting}.` }
    if ('error' in ran) return { error: ran.error }
    const text = bundleWrapFrom(ran.text)
    return text
      ? { text, ...(ran.by && { by: ran.by }) }
      : { error: 'It gave no answer.' }
  }
}

/** The task your AI filled in last of those, if one was lately */
function newestFilled(tasks: readonly TaskView[]): string | undefined {
  const filled = tasks
    .flatMap((task) => {
      const at = task.updates?.findLast(
        (update) => update.why === FILLED_IN
      )?.at
      return at && Date.now() - Date.parse(at) < LOOK_EVERY_MS
        ? [{ id: task.id, at: Date.parse(at) }]
        : []
    })
    .sort((a, b) => b.at - a.at)
  return filled[0]?.id
}
