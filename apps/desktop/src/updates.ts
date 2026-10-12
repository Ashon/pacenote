import { EventEmitter } from 'node:events'
import type { UpdateState } from '../../../src/runtime/types.js'

/** Where Pacenote's releases are published */
export const RELEASES_URL =
  'https://api.github.com/repos/Ashon/pacenote/releases/latest'
/** How often the installed app looks for a new release */
export const CHECK_EVERY_MS = 12 * 60 * 60_000

/** A release version as numbers (v0.4.10 → [0, 4, 10]) */
export function parseVersion(text: string): number[] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim())
  return match ? match.slice(1).map(Number) : undefined
}

/** Whether latest comes after current, by number: 0.4.10 is after 0.4.9 */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! > b[i]!
  return false
}

/**
 * Looks for a newer Pacenote among the published releases, now and then. It
 * only tells: Homebrew installs the update (brew upgrade --cask pacenote), so
 * the app never replaces itself.
 */
export class UpdateCheck extends EventEmitter<{ change: [UpdateState] }> {
  private state: UpdateState
  private timer?: NodeJS.Timeout

  constructor(
    private readonly options: {
      current: string
      url?: string
      log: (message: string) => void
      fetch?: typeof fetch
    }
  ) {
    super()
    this.state = { current: options.current, available: false }
  }

  get current(): UpdateState {
    return this.state
  }

  /** Checks after delayMs, then every CHECK_EVERY_MS */
  start(delayMs = 30_000): void {
    const run = (wait: number) => {
      this.timer = setTimeout(() => {
        void this.check().finally(() => run(CHECK_EVERY_MS))
      }, wait)
      this.timer.unref()
    }
    run(delayMs)
  }

  stop(): void {
    clearTimeout(this.timer)
  }

  async check(): Promise<UpdateState> {
    const fetcher = this.options.fetch ?? fetch
    try {
      const response = await fetcher(this.options.url ?? RELEASES_URL, {
        headers: { accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const release = (await response.json()) as {
        tag_name?: unknown
        html_url?: unknown
      }
      const tag = typeof release.tag_name === 'string' ? release.tag_name : ''
      const version = parseVersion(tag)?.join('.')
      if (!version) throw new Error(`Unexpected release tag "${tag}"`)
      const available = isNewer(version, this.options.current)
      if (available && version !== this.state.latest?.version)
        this.options.log(`Pacenote ${version} is out`)
      this.set({
        latest: {
          version,
          url: typeof release.html_url === 'string' ? release.html_url : '',
        },
        available,
        checkedAt: new Date().toISOString(),
      })
    } catch (err) {
      // What it knew before stays; the next check tries again.
      this.options.log(`Could not check for updates: ${(err as Error).message}`)
    }
    return this.state
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.emit('change', this.state)
  }
}
