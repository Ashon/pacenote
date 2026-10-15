import { EventEmitter } from 'node:events'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingsText } from '../src/settings/settings-file.js'

/** The bot processes the supervisor forked, as stand-ins */
const forked: FakeChild[] = []

class FakeChild extends EventEmitter {
  pid = 4000 + forked.length
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn(() => {
    queueMicrotask(() => this.emit('exit', 0))
    return true
  })
  postMessage = vi.fn()
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
      queueMicrotask(() => child.emit('spawn'))
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
