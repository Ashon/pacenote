import type { SandboxJob } from './types.js'

/**
 * How far the built-in sandbox's setup has come, read from its job's output
 * (setupVm in vm-setup.ts logs each part as it starts and ends). Plain, so
 * the UI reads it too; the titles are IMAGE_RECIPES' (tests/vm-progress.test).
 */

export type SetupPartState = 'waiting' | 'working' | 'done' | 'failed'

export interface SetupPart {
  id: 'kernel' | 'init' | 'reasoner' | 'renderer' | 'broker'
  label: string
  /** What is being done while it works: "Building the image answers run in" */
  doing: string
  state: SetupPartState
}

export interface VmSetupProgress {
  parts: SetupPart[]
  /** Parts done, of all: 0 to 1 */
  fraction: number
}

export const PART_TITLES = {
  reasoner: 'Reasoner image',
  renderer: 'Diagram renderer image',
  broker: 'Ops broker image',
} as const

const LABELS: Record<SetupPart['id'], { label: string; doing: string }> = {
  kernel: {
    label: 'Linux kernel, downloaded and checked',
    doing: 'Downloading the Linux kernel',
  },
  init: {
    label: 'Start-up files for the VMs',
    doing: 'Preparing the start-up files',
  },
  reasoner: {
    label: 'The image answers run in',
    doing: 'Building the image answers run in',
  },
  renderer: {
    label: 'The image that draws diagrams',
    doing: 'Building the image that draws diagrams',
  },
  broker: {
    label: 'The image the ops tools run in',
    doing: 'Building the image the ops tools run in',
  },
}

/**
 * The parts and where each one is. The images set not to build (diagrams or
 * ops tools off) are left out; with renderer, the diagram image is expected
 * from the start.
 */
export function vmSetupProgress(
  job: Pick<SandboxJob, 'state' | 'output'>,
  options: { renderer?: boolean } = {}
): VmSetupProgress {
  const lines = job.output
  const has = (pattern: RegExp) => lines.some((line) => pattern.test(line))
  const image = (title: string) => ({
    started: has(new RegExp(`^${title}: building`)),
    done: has(new RegExp(`^${title}: (ready|up to date)`)),
    skipped: has(new RegExp(`^${title}: not built`)),
  })
  const reasoner = image(PART_TITLES.reasoner)
  const renderer = image(PART_TITLES.renderer)
  const broker = image(PART_TITLES.broker)
  const steps: { id: SetupPart['id']; started: boolean; done: boolean }[] = [
    {
      id: 'kernel',
      started: has(/^Linux kernel:/),
      done: has(/^Linux kernel: (present|ready)/),
    },
    {
      id: 'init',
      started: has(/^Init filesystem/),
      done: reasoner.started || reasoner.done || reasoner.skipped,
    },
    { id: 'reasoner', ...reasoner },
  ]
  if (
    !renderer.skipped &&
    (options.renderer || renderer.started || renderer.done)
  )
    steps.push({ id: 'renderer', ...renderer })
  if (broker.started || broker.done) steps.push({ id: 'broker', ...broker })

  const succeeded = job.state === 'succeeded'
  const parts = steps.map(({ id, started, done }): SetupPart => {
    const state: SetupPartState =
      done || succeeded
        ? 'done'
        : started
          ? job.state === 'failed'
            ? 'failed'
            : 'working'
          : 'waiting'
    return { id, ...LABELS[id], state }
  })
  const finished = parts.filter((part) => part.state === 'done').length
  return { parts, fraction: parts.length ? finished / parts.length : 0 }
}

const RANK: Record<SetupPartState, number> = {
  waiting: 0,
  working: 1,
  failed: 2,
  done: 3,
}

/**
 * The progress so far with what the job says now: the job keeps only its last
 * lines, so a part seen working or done stays so, unless the job starts over.
 */
export function mergeProgress(
  before: VmSetupProgress | undefined,
  now: VmSetupProgress
): VmSetupProgress {
  if (!before) return now
  const was = new Map(before.parts.map((part) => [part.id, part]))
  const parts = now.parts.map((part) => {
    const prior = was.get(part.id)
    return prior &&
      RANK[prior.state] > RANK[part.state] &&
      part.state !== 'failed'
      ? { ...part, state: prior.state }
      : part
  })
  const done = parts.filter((part) => part.state === 'done').length
  return { parts, fraction: parts.length ? done / parts.length : 0 }
}
