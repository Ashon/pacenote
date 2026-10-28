import { EventEmitter } from 'node:events'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingsText } from '../src/settings/settings-file.js'

/** The bot processes the supervisor forked, as stand-ins */
const forked: FakeChild[] = []

/** Whether forked bots wait to be told they spawned (spawned()) */
let holdSpawn = false

class FakeChild extends EventEmitter {
  pid?: number
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  // Like utilityProcess: before it spawned, there is nothing to signal.
  kill = vi.fn(() => {
    if (this.pid === undefined) return false
    queueMicrotask(() => this.emit('exit', 0))
    return true
  })
  postMessage = vi.fn()

  spawned(): void {
    this.pid = 4000 + forked.indexOf(this)
    this.emit('spawn')
  }
}

// electron resolves from the desktop app only, so the mock names that file.
const ELECTRON = vi.hoisted(() =>
  process
    .getBuiltinModule('node:module')
    .createRequire(new URL('../apps/desktop/package.json', import.meta.url))
    .resolve('electron')
)
vi.mock(ELECTRON, () => ({
  utilityProcess: {
    fork: vi.fn(() => {
      const child = new FakeChild()
      forked.push(child)
      if (!holdSpawn) queueMicrotask(() => child.spawned())
      return child
    }),
  },
}))

const { BotSupervisor } = await import('../apps/desktop/src/bot.js')

let root: string
const supervisors: InstanceType<typeof BotSupervisor>[] = []

/** A supervisor whose settings would start the bot */
function supervisor(more: { repoRoot?: string; toolPath?: string } = {}) {
  const settingsFile = path.join(root, 'settings.json')
  writeFileSync(
    settingsFile,
    settingsText({
      SLACK_BOT_TOKEN: 'xoxb-1-abc',
      SLACK_APP_TOKEN: 'xapp-1-abc',
      MENTION_ALLOWED_USERS: 'U1',
    })
  )
  const made = new BotSupervisor({
    entry: path.join(root, 'bot.mjs'),
    cwd: root,
    settingsFile,
    dataDir: root,
    toolPath: () => more.toolPath ?? '/usr/bin:/bin',
    repoRoot: more.repoRoot,
    log: () => undefined,
  })
  supervisors.push(made)
  return made
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'pacenote-supervisor-'))
  // No bot of this Mac's own Pacenote counts as running elsewhere.
  vi.stubEnv('HOME', root)
  forked.length = 0
  holdSpawn = false
})

afterEach(() => {
  for (const made of supervisors.splice(0)) made.dispose()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

describe('the bot supervisor while the app quits', () => {
  it('starts a bot, and starts it again after an exit no one asked for', async () => {
    vi.useFakeTimers()
    const bot = supervisor()
    await bot.start()
    expect(forked).toHaveLength(1)

    forked[0]!.emit('exit', 1)
    expect(bot.current.phase).toBe('failed')
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(forked).toHaveLength(2)
  })

  it('starts no bot once disposed, as for a copy opened only to quit', async () => {
    const bot = supervisor()
    bot.dispose()
    await bot.start()
    await bot.restart()
    expect(forked).toHaveLength(0)
  })

  it('does not start a bot again that exits while the app quits', async () => {
    vi.useFakeTimers()
    const bot = supervisor()
    await bot.start()
    bot.dispose()
    // It exits on its own before stop() reaches it.
    forked[0]!.emit('exit', 1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(forked).toHaveLength(1)
    expect(bot.current.phase).toBe('idle')
  })

  it('stops a bot told to stop before it spawned, once it has', async () => {
    // A copy macOS opened to deliver a quit, told to quit as Pace starts
    holdSpawn = true
    const bot = supervisor()
    await bot.start()
    bot.dispose()
    const stopped = bot.stop()
    await Promise.resolve()
    expect(forked[0]!.kill).not.toHaveBeenCalled()
    forked[0]!.spawned()
    await stopped
    expect(forked[0]!.kill).toHaveReturnedWith(true)
    expect(bot.current.phase).toBe('idle')
  })

  it('still stops a running bot once disposed', async () => {
    const bot = supervisor()
    await bot.start()
    bot.dispose()
    expect(bot.managing).toBe(true)
    await bot.stop()
    expect(forked[0]!.kill).toHaveBeenCalledTimes(1)
    expect(bot.managing).toBe(false)
    expect(bot.current.phase).toBe('idle')
  })
})

describe('Pace off, for Todo alone', () => {
  const prefs = () =>
    JSON.parse(readFileSync(path.join(root, 'desktop.json'), 'utf8')) as Record<
      string,
      unknown
    >

  it('does not start by itself while off, and is on again once started', async () => {
    const bot = supervisor()
    expect(bot.current.autoStart).toBe(true)
    bot.setOff(true)
    expect(bot.current).toMatchObject({ off: true, autoStart: false })
    expect(prefs().pace).toBe('off')

    // Read again as the app opens next time
    const again = supervisor()
    expect(again.current).toMatchObject({ off: true, autoStart: false })

    // Starting it is wanting it: on, and starting by itself as before
    await again.start()
    expect(forked).toHaveLength(1)
    expect(again.current.off).toBeUndefined()
    expect(again.current.autoStart).toBe(true)
    expect(prefs()).not.toHaveProperty('pace')
  })

  it('keeps Start Pace when the app opens as you set it, on again', () => {
    const bot = supervisor()
    bot.setAutoStart(false)
    bot.setOff(true)
    bot.setOff(false)
    expect(bot.current.autoStart).toBe(false)
    expect(prefs().autoStartBot).toBe(false)
  })
})

describe('the bot supervisor in a dev run', () => {
  it('goes from building straight to starting in a dev run, never idle between', async () => {
    // A pnpm that builds at once, for the bot that is not built yet
    const bin = path.join(root, 'bin')
    mkdirSync(bin)
    writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n')
    chmodSync(path.join(bin, 'pnpm'), 0o755)
    const bot = supervisor({ repoRoot: root, toolPath: `${bin}:/usr/bin:/bin` })
    const phases: string[] = []
    bot.on('change', (state) => phases.push(state.phase))
    await bot.start()
    expect(forked).toHaveLength(1)
    const built = phases.lastIndexOf('building')
    expect(built).toBeGreaterThanOrEqual(0)
    expect(phases.slice(built + 1)).not.toContain('idle')
    expect(phases).toContain('starting')
  })
})
