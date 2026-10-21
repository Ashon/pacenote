import { createHash } from 'node:crypto'
import { type FSWatcher, watch } from 'node:fs'
import path from 'node:path'
import { COLLECTIONS_FILE, readCollections } from '../tasks/collections.js'
import {
  DECISIONS_FILE,
  readDecisions,
  readJson,
  readTakenBack,
  readTasks,
  TAKEN_BACK_FILE,
  TASKS_FILE,
  withTasksLock,
  writeJson,
  writeTasks,
} from '../tasks/store.js'
import type {
  CollectionRecord,
  TaskDecisions,
  TasksFile,
  WorkFile,
} from '../tasks/types.js'
import { changeWork, readWork, WORK_FILE } from '../tasks/work.js'
import { RECAPS_FILE, readWritten } from '../you/recap.js'
import { changeYou, readYou, YOU_FILE } from '../you/store.js'
import type { Written, YouFile } from '../you/types.js'
import type { Macs } from './macs.js'
import {
  mergeCollections,
  mergeDecisions,
  mergeTasks,
  mergeWork,
  mergeWritten,
  mergeYou,
  type TakenBack,
} from './sync.js'

/**
 * Carries your Todo between your Macs (sync.ts merges it): when a channel to
 * another Mac opens, and whenever one of its files changes here, each part
 * that changed goes to the others, whole. What comes in is merged into the
 * files here, under the same lock as any other change, and written only if
 * it changed something, so the Macs settle after a round or two.
 */

const SYNCED = new Set([
  TASKS_FILE,
  DECISIONS_FILE,
  TAKEN_BACK_FILE,
  WORK_FILE,
  RECAPS_FILE,
  YOU_FILE,
])
/** Looks again this often, for changes the folder's events missed */
const RECHECK_MS = 15_000

/** The parts of your Todo one Mac sends another */
interface Parts {
  tasks: TasksFile
  decisions: { decisions: TaskDecisions; takenBack: TakenBack }
  work: Pick<WorkFile, 'entries' | 'notIt'>
  written: Record<string, Written>
  you: YouFile
  /** This Mac's own collections, for "Collected 10:20 on MacBook Pro" */
  collections: CollectionRecord[]
}

type Part = keyof Parts

interface TodoMessage {
  t: 'todo'
  parts: Partial<Parts>
}

const hash = (value: unknown) =>
  createHash('sha1').update(JSON.stringify(value)).digest('hex')

export class TodoSync {
  /** Per Mac: what each part last was when sent there or heard from there */
  private readonly known = new Map<string, Map<Part, string>>()
  private watcher?: FSWatcher
  private timer?: NodeJS.Timeout
  private recheck?: NodeJS.Timeout
  private readonly listeners: [string, (...args: never[]) => void][] = []

  constructor(
    private readonly options: {
      dataDir: string
      macs: Macs
      /** This Mac's own collections lately (its runs), newest first */
      collections: () => CollectionRecord[]
      log: (message: string) => void
      /** Your Todo changed here because of another Mac */
      changed?: () => void
    }
  ) {}

  start(): void {
    const { macs, dataDir } = this.options
    const linked = (peer: string) => {
      this.known.delete(peer)
      this.send([peer])
    }
    const message = (peer: string, data: unknown) => {
      const { t, parts } = (data ?? {}) as Partial<TodoMessage>
      if (t === 'todo' && parts) this.receive(peer, parts)
    }
    macs.on('linked', linked)
    macs.on('message', message)
    this.listeners.push(['linked', linked], ['message', message])
    try {
      this.watcher = watch(dataDir, (_event, name) => {
        if (name && !SYNCED.has(String(name))) return
        clearTimeout(this.timer)
        this.timer = setTimeout(() => this.send(), 300)
      })
      this.watcher.on('error', () => this.watcher?.close())
    } catch {
      // No folder to watch: the recheck still sends changes.
    }
    this.recheck = setInterval(() => this.send(), RECHECK_MS)
    this.recheck.unref?.()
  }

  stop(): void {
    for (const [event, listener] of this.listeners.splice(0))
      this.options.macs.off(event as 'linked', listener as () => void)
    this.watcher?.close()
    clearTimeout(this.timer)
    clearInterval(this.recheck)
  }

  /** This Mac's parts now */
  private parts(): Parts {
    const { dataDir } = this.options
    const work = readWork(dataDir)
    return {
      tasks: readTasks(dataDir),
      decisions: {
        decisions: readDecisions(dataDir),
        takenBack: readTakenBack(dataDir),
      },
      work: { entries: work.entries, notIt: work.notIt ?? [] },
      written: readWritten(dataDir),
      you: readYou(dataDir),
      collections: this.options.collections().filter((row) => !row.mac),
    }
  }

  /** Sends each part that changed to the Macs given, or all of them */
  private send(peers = this.options.macs.connected()): void {
    if (peers.length === 0) return
    let parts: Parts
    try {
      parts = this.parts()
    } catch (err) {
      this.options.log(`Todo sync: could not read: ${(err as Error).message}`)
      return
    }
    const hashes = Object.fromEntries(
      Object.entries(parts).map(([part, value]) => [part, hash(value)])
    ) as Record<Part, string>
    for (const peer of peers) {
      const known = this.knownFor(peer)
      const changed = (Object.keys(parts) as Part[]).filter(
        (part) => known.get(part) !== hashes[part]
      )
      if (changed.length === 0) continue
      const message: TodoMessage = {
        t: 'todo',
        parts: Object.fromEntries(changed.map((part) => [part, parts[part]])),
      }
      if (!this.options.macs.send(peer, message)) continue
      for (const part of changed) known.set(part, hashes[part])
    }
  }

  private knownFor(peer: string): Map<Part, string> {
    let known = this.known.get(peer)
    if (!known) {
      known = new Map()
      this.known.set(peer, known)
    }
    return known
  }

  /** Merges what another Mac sent into the files here */
  private receive(peer: string, parts: Partial<Parts>): void {
    const { dataDir } = this.options
    const known = this.knownFor(peer)
    const here = this.options.macs.id
    let changed = false
    const write = <T>(local: T, merged: T, save: (value: T) => void) => {
      if (JSON.stringify(local) === JSON.stringify(merged)) return
      save(merged)
      changed = true
    }
    try {
      if (parts.tasks) {
        known.set('tasks', hash(parts.tasks))
        const remote = parts.tasks
        withTasksLock(dataDir, () => {
          const local = readTasks(dataDir)
          write(local, mergeTasks(local, remote), (merged) =>
            writeTasks(dataDir, merged)
          )
        })
      }
      if (parts.decisions) {
        known.set('decisions', hash(parts.decisions))
        const local = {
          decisions: readDecisions(dataDir),
          takenBack: readTakenBack(dataDir),
        }
        write(local, mergeDecisions(local, parts.decisions), (merged) => {
          writeJson(path.join(dataDir, TAKEN_BACK_FILE), merged.takenBack)
          writeJson(path.join(dataDir, DECISIONS_FILE), merged.decisions)
        })
      }
      if (parts.work) {
        known.set('work', hash(parts.work))
        const local = readWork(dataDir)
        write(
          local,
          mergeWork(local, parts.work, { here, peer }),
          (merged) => void changeWork(dataDir, () => merged)
        )
      }
      if (parts.written) {
        known.set('written', hash(parts.written))
        const local = readWritten(dataDir)
        write(local, mergeWritten(local, parts.written), (merged) => {
          const file = path.join(dataDir, RECAPS_FILE)
          writeJson(file, {
            ...readJson<object>(file, {}),
            version: 1,
            written: merged,
          })
        })
      }
      if (parts.you) {
        known.set('you', hash(parts.you))
        const local = readYou(dataDir)
        const remote = parts.you
        write(local, mergeYou(local, remote), (merged) =>
          changeYou(dataDir, () => merged)
        )
      }
      if (parts.collections) {
        known.set('collections', hash(parts.collections))
        const local = readCollections(dataDir)
        write(
          local,
          mergeCollections(local, parts.collections, peer),
          (merged) =>
            writeJson(path.join(dataDir, COLLECTIONS_FILE), {
              collections: merged,
            })
        )
      }
    } catch (err) {
      this.options.log(
        `Todo sync: could not merge what another Mac sent: ${(err as Error).message}`
      )
    }
    if (changed) this.options.changed?.()
  }
}
