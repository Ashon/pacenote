import { getLocale, localized } from '../../../src/i18n/locale.js'
import type { Logger } from '../../../src/logger.js'
import { text } from './screen.text.js'

/** The waits between tries, the last one repeating */
const DELAYS_MS = [250, 500, 1_000, 2_000, 5_000, 10_000, 30_000]

/**
 * Loads the app's screen into its window, and keeps at it while that fails. A
 * screen that does not load never ends the app: Pace and the menu bar go on,
 * and the cause usually passes. An upgrade swapping the bundle's files, a
 * start racing the copy before it, or anything else: the window tries again,
 * quickly at first and then less often, and after the quick tries says so in
 * the screen's place (unavailablePage), with a way to try at once. Once it
 * says so, it keeps saying so until the screen would load (probe), so the
 * tries do not flicker.
 */
export class ScreenLoader {
  /** The window shows why the screen is not there */
  unavailable = false
  private loading?: Promise<void>
  private wake?: () => void

  constructor(
    private readonly options: {
      /** Loads the screen into the window; rejects when it fails */
      load: () => Promise<void>
      /** Rejects with why the screen would not load now; the window stays */
      probe: () => Promise<void>
      /** Shows why the screen is not there, in its place */
      showUnavailable: (reason: string) => Promise<void>
      /**
       * Nothing to load for any more: the window closed, or the app quits or
       * restarts into a new version
       */
      gone: () => boolean
      /**
       * While true, the tries go on without saying why: the cause is passing,
       * such as an upgrade swapping the bundle
       */
      passing?: () => boolean
      log: Pick<Logger, 'info' | 'warn'>
      delaysMs?: readonly number[]
      /** Tries before the window says why */
      quietTries?: number
    }
  ) {}

  /** Loads the screen, or joins the load under way */
  load(): Promise<void> {
    this.loading ??= this.run().finally(() => {
      this.loading = undefined
    })
    return this.loading
  }

  /** Tries again now instead of after the wait ("Try again") */
  retryNow(): void {
    this.wake?.()
  }

  private async run(): Promise<void> {
    const { log, gone } = this.options
    const delays = this.options.delaysMs ?? DELAYS_MS
    const quietTries = this.options.quietTries ?? 3
    let told: string | undefined
    for (let tries = 1; ; tries += 1) {
      if (gone()) return
      let touched = false
      try {
        if (this.unavailable) await this.options.probe()
        touched = true
        await this.options.load()
        this.unavailable = false
        if (tries > 1) log.info(`The window loaded on try ${tries}`)
        return
      } catch (error) {
        if (gone()) return
        const reason = error instanceof Error ? error.message : String(error)
        // The same reason again is not news: a screen that stays away would
        // fill the log.
        if (reason !== told)
          log.warn(`The window could not load (try ${tries}): ${reason}`)
        told = reason
        // A failed load leaves an empty page in the window: the reason goes
        // back in its place.
        if (
          tries >= quietTries &&
          (touched || !this.unavailable) &&
          !this.options.passing?.()
        ) {
          await this.options.showUnavailable(reason).then(
            () => {
              this.unavailable = true
            },
            (err: unknown) =>
              log.warn(
                `The window could not say why: ${err instanceof Error ? err.message : String(err)}`
              )
          )
        }
        await this.wait(delays[Math.min(tries - 1, delays.length - 1)] ?? 0)
      }
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.wake = undefined
        resolve()
      }
      const timer = setTimeout(done, ms)
      this.wake = done
    })
  }
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  )

/**
 * The page in the screen's place while it will not load: why, and a link to
 * try again (retryUrl, which the window takes as that instead of going there).
 * It stands alone, with no file or script of the app's, since those are what
 * may be missing; it follows the app's colors and language.
 */
export function unavailablePage(options: {
  app: string
  reason: string
  retryUrl: string
}): string {
  const t = localized(text)
  return `<!doctype html>
<html lang="${getLocale()}">
<head>
<meta charset="utf-8">
<meta http-equiv="content-security-policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escape(options.app)}</title>
<style>
:root { color-scheme: light dark; --bg: #fafdfb; --fg: #1d302b; --muted: #5d7069; --well: #f2f7f4; --border: #e0ebe6; --primary: #007154; --on-primary: #fff; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f1714; --fg: #e6efeb; --muted: #a2b4ad; --well: #121a17; --border: #26332e; --primary: #3ccb96; --on-primary: #04281d; } }
html, body { height: 100%; margin: 0; }
body { display: flex; align-items: center; justify-content: center; padding: 48px 32px; box-sizing: border-box; background: var(--bg); color: var(--fg); font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif; -webkit-app-region: drag; user-select: none; }
:lang(ko) body { word-break: keep-all; overflow-wrap: break-word; }
main { max-width: 440px; }
h1 { font-size: 20px; line-height: 1.3; font-weight: 600; margin: 0 0 8px; }
p { margin: 0 0 12px; color: var(--muted); }
pre { margin: 16px 0; padding: 10px 12px; background: var(--well); border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; -webkit-app-region: no-drag; }
a { display: inline-block; margin-top: 4px; padding: 7px 14px; border-radius: 8px; background: var(--primary); color: var(--on-primary); font-weight: 500; text-decoration: none; -webkit-app-region: no-drag; }
</style>
</head>
<body>
<main>
<h1>${escape(t.heading)}</h1>
<p>${escape(t.body(options.app))}</p>
<pre>${escape(options.reason)}</pre>
<p>${escape(t.stillFailing(options.app))}</p>
<a href="${escape(options.retryUrl)}">${escape(t.tryAgain)}</a>
</main>
</body>
</html>`
}
