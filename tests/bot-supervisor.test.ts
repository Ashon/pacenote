import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
function supervisor() {
  const envFile = path.join(root, '.env')
  writeFileSync(
    envFile,
    'SLACK_BOT_TOKEN=xoxb-1-abc\nSLACK_APP_TOKEN=xapp-1-abc\nMENTION_ALLOWED_USERS=U1\n'
  )
  const made = new BotSupervisor({
    entry: path.join(root, 'bot.mjs'),
    cwd: root,
    envFile,
    dataDir: root,
    toolPath: () => '/usr/bin:/bin',
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
