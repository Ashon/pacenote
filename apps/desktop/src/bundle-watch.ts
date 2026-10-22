import { readFileSync } from 'node:fs'

/** The version an app bundle's Info.plist names (CFBundleShortVersionString) */
export function bundleVersion(plist: string): string | undefined {
  return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(
    plist
  )?.[1]
}

/**
 * Watches the app's bundle for another version put in its place while this
 * one runs. An upgrade can swap the bundle under a running copy: Homebrew asks
 * the app to quit until it is gone, and a copy opened by a late request can
 * still be running from the old bundle when the new one moves in. That copy's
 * code no longer matches the files it loads, which ends Pace, so it restarts
 * into the new version once the Info.plist on disk names one. A missing file
 * is a swap in progress, and waits for the next look.
 */
export class BundleWatch {
  private timer?: NodeJS.Timeout
  private replaced = false

  constructor(
    private readonly options: {
      /** Contents/Info.plist of the running app */
      file: string
      /** The running app's version */
      running: string
      onReplaced: (version: string) => void
      intervalMs?: number
    }
  ) {}

  start(): void {
    this.timer = setInterval(
      () => this.check(),
      this.options.intervalMs ?? 3_000
    )
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }

  /**
   * The version on disk once a swap is over, for a copy that quits: a missing
   * file is a swap in progress, waited for up to waitMs
   */
  async onDisk(waitMs = 10_000): Promise<string | undefined> {
    const until = Date.now() + waitMs
    for (;;) {
      try {
        return bundleVersion(readFileSync(this.options.file, 'utf8'))
      } catch {
        if (Date.now() >= until) return undefined
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
  }

  /** True while the bundle is being swapped: its Info.plist is not there */
  swapping(): boolean {
    try {
      readFileSync(this.options.file)
      return false
    } catch {
      return true
    }
  }

  /** Looks now; true when another version has taken this one's place */
  check(): boolean {
    if (this.replaced) return true
    let text: string
    try {
      text = readFileSync(this.options.file, 'utf8')
    } catch {
      return false
    }
    const version = bundleVersion(text)
    if (!version || version === this.options.running) return false
    this.replaced = true
    this.stop()
    this.options.onReplaced(version)
    return true
  }
}
