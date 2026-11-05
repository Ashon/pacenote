import { homedir } from 'node:os'
import type { Logger } from '../../../src/logger.js'
import {
  FILLED_BY,
  fillInput,
  fillPrompt,
  fillsFrom,
  repoStates,
  reposToRead,
  type FillAsk,
} from '../../../src/tasks/fill.js'
import type { OwnCli } from '../../../src/tasks/own-ai.js'
import { allTaskViews } from '../../../src/tasks/store.js'
import { fillInTask } from '../../../src/tasks/write.js'
import { countYou } from '../../../src/you/store.js'
import { runPlainWork, type PlainWork } from './headless.js'
import { refusalOf, type OwnAi } from './own-ai.js'

/**
 * New tasks filled in by your AI (src/tasks/fill.ts): a task you add here or
 * on a device of yours, or one a device hands over when it pairs, is kept as
 * you wrote it at once, and then filled in, in the background. Tasks added
 * one after another wait a moment and go together; one run at a time, on
 * the CLI that does Pacenote's own work, headless with no tools, falling
 * back as that work does. A CLI that cannot (both resting, signed out, too
 * slow) leaves the tasks as they are: nothing is asked again.
 */

/** How long a new task waits for the next one, to go with it */
const GATHER_MS = 5000
/** The most tasks one run fills in */
const BATCH = 8
const FILL_MS = 3 * 60_000

export class Filler {
  constructor(
    private readonly options: {
      dataDir: string
      ownAi: OwnAi
      ownWork: (cli: OwnCli) => Omit<PlainWork, 'prompt'>
      opencodeRun: () => NonNullable<PlainWork['opencode']>
      /** Fill in new tasks is on and an AI is set up */
      on: () => boolean
      log: Logger
      /** Called when what is filling or filled changes */
      onChange: () => void
      home?: string
      gatherMs?: number
    }
  ) {}

  private waiting: FillAsk[] = []
  private running: FillAsk[] = []
  private timer: NodeJS.Timeout | undefined
  private busy = false

  /** A task just added, to fill in */
  add(ask: FillAsk): void {
    if (!this.options.on()) return
    if (this.filling().includes(ask.id)) return
    this.waiting.push(ask)
    this.options.onChange()
    this.later()
  }

  /** The tasks waiting to be filled in, or being filled in now */
  filling(): string[] {
    return [...this.running, ...this.waiting].map((ask) => ask.id)
  }

  private later(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(
      () => void this.next(),
      this.options.gatherMs ?? GATHER_MS
    )
  }

  private async next(): Promise<void> {
    if (this.busy || this.waiting.length === 0) return
    this.busy = true
    this.running = this.waiting.splice(0, BATCH)
    try {
      await this.fill(this.running)
    } catch (error) {
      this.options.log.warn(`Could not fill in new tasks: ${String(error)}`)
    } finally {
      this.running = []
      this.busy = false
      this.options.onChange()
      if (this.waiting.length) this.later()
    }
  }

  private async fill(asks: FillAsk[]): Promise<void> {
    const { dataDir, ownAi, log } = this.options
    if (!this.options.on()) return
    const home = this.options.home ?? homedir()
    const you = await countYou({ dataDir, home }).catch(() => undefined)
    const areas = you?.areas ?? []
    const tasks = allTaskViews(dataDir)
    const added = asks.flatMap((ask) => {
      const task = tasks.find((t) => t.id === ask.id && t.status === 'open')
      return task ? [task] : []
    })
    if (added.length === 0) return
    const repos = await repoStates(dataDir, home, reposToRead(added, areas))
    const input = fillInput(asks, tasks, areas, repos)
    if (input.added.length === 0) return
    const prompt = fillPrompt(input)
    const ran = await ownAi.run(
      async (cli) => {
        const { output, failed } = await runPlainWork({
          ...this.options.ownWork(cli),
          opencode: this.options.opencodeRun(),
          prompt,
          title: 'Pacenote: fill in new tasks',
          timeoutMs: FILL_MS,
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
    if ('resting' in ran) {
      log.info(`New tasks left as written: your AI rests until ${ran.resting}`)
      return
    }
    if ('error' in ran.result) {
      log.warn(`Could not fill in new tasks: ${ran.result.error}`)
      return
    }
    const fills = fillsFrom(ran.result.text, input)
    for (const ask of asks) {
      const fill = fills.get(ask.id)
      if (!fill) continue
      const result = fillInTask(dataDir, ask.id, fill, {
        repoGuessed: ask.repoGuessed,
        by: FILLED_BY[ran.by],
      })
      if (result && 'refused' in result)
        log.info(`Left ${ask.id} as it is: ${result.refused}`)
    }
  }
}
