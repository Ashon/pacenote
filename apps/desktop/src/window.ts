import { BrowserWindow, nativeTheme, shell, type WebContents } from 'electron'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Logger } from '../../../src/logger.js'
import { ScreenLoader, unavailablePage } from './screen.js'

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * The app's window and the screen it loads (ScreenLoader), held here so the
 * rest of main.ts reaches them through this alone: it tells the screen what
 * changed (send), asks whether the window is in front, and opens or shows it.
 * Closing the window hides it while the app runs; once it is gone for good,
 * showing it opens a new one.
 */
export class MainWindow {
  private window: BrowserWindow | undefined
  private screen: ScreenLoader | undefined

  constructor(
    private readonly options: {
      appName: string
      /** The window's icon (a run from source has the one with the DEV tag) */
      icon: string
      /** preload.cjs, the screen's one way to the app */
      preload: string
      /** A run from the repository, as the screen is told (--pacenote-dev) */
      dev: boolean
      /** The dev server the screen loads from instead of pacenote://app */
      webDevUrl?: string
      /** Rejects with why the screen would not load now (screen.ts) */
      probe: () => Promise<void>
      /** The app quits: closing the window ends it, and nothing reloads it */
      quitting: () => boolean
      /**
       * The app restarts, or a new version is in its place: nothing to load
       * the screen for any more
       */
      restarting: () => boolean
      /** An upgrade swaps the bundle: the screen's tries go on quietly */
      passing: () => boolean
      /**
       * Asked for while quitting, such as opened again right after Quit while
       * Pace stops: a window now would go with this copy, so the app opens
       * again once it is gone.
       */
      reopen: () => void
      /**
       * A capture (PACENOTE_DESKTOP_CAPTURE): the window stays hidden, at
       * this size when one is given, and save takes it once its screen loads
       */
      capture?: {
        width?: number
        height?: number
        save: (window: BrowserWindow) => Promise<void>
      }
      log: Pick<Logger, 'info' | 'warn' | 'error'>
    }
  ) {}

  /** The window while it is open, for a dialog to sit on */
  get current(): BrowserWindow | undefined {
    return this.window
  }

  /** Tells the screen something changed, while the window is open */
  send(channel: string, ...args: unknown[]): void {
    this.window?.webContents.send(channel, ...args)
  }

  /** Whether an IPC call came from this window's screen */
  sentBy(sender: WebContents): boolean {
    return sender === this.window?.webContents
  }

  isFocused(): boolean {
    return this.window?.isFocused() ?? false
  }

  isFullScreen(): boolean {
    return this.window?.isFullScreen() ?? false
  }

  /**
   * Shows the window, opening it when there is none; with a route (e.g.
   * "#/settings") it also switches to that screen.
   */
  show(route?: string): void {
    if (this.options.quitting()) {
      this.options.reopen()
      return
    }
    const window = this.window
    if (!window) {
      void this.open(route).catch((error: unknown) =>
        this.options.log.error(`The window could not open: ${errorText(error)}`)
      )
      return
    }
    // A screen that would not load is tried again at once.
    this.screen?.retryNow()
    if (route)
      void window.webContents.executeJavaScript(
        `location.hash = ${JSON.stringify(route)}`
      )
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  /**
   * Opens the window on route, or shows the one open. It resolves once the
   * screen is on its way (not loaded: that may take its time, and the app
   * goes on), and for a capture once it is saved.
   */
  async open(route = ''): Promise<void> {
    if (this.window) {
      this.show(route || undefined)
      return
    }
    const { appName, capture, webDevUrl, log } = this.options
    const window = new BrowserWindow({
      // For captures the size can be changed: a narrow width for tight
      // layouts, a tall height for long screens.
      width: capture?.width || 1360,
      height: capture?.height || 880,
      minWidth: 600,
      minHeight: 600,
      show: false,
      title: appName,
      icon: this.options.icon,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1714' : '#fafdfb',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 15 },
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: this.options.preload,
        // Tells the UI it runs from the repository (preload reads it from
        // argv).
        additionalArguments: this.options.dev ? ['--pacenote-dev'] : [],
      },
    })
    this.window = window
    if (!capture) window.once('ready-to-show', () => window.show())
    // Full screen hides the traffic lights, so the title bar stops keeping
    // room for them.
    const fullScreen = (on: boolean) => () =>
      window.webContents.send('pacenote:window:full-screen-changed', on)
    window.on('enter-full-screen', fullScreen(true))
    window.on('leave-full-screen', fullScreen(false))
    window.on('close', (event) => {
      if (!this.options.quitting()) {
        event.preventDefault()
        window.hide()
      }
    })
    // A window whose process ended is blank: it loads again, unless that
    // keeps happening.
    const gone: number[] = []
    window.webContents.on('render-process-gone', (_event, details) => {
      log.error(
        `The window's process ended (${details.reason}, exit code ${details.exitCode})`
      )
      if (details.reason === 'clean-exit' || this.options.quitting()) return
      const now = Date.now()
      gone.push(now)
      while (gone.length && now - gone[0]! > 60_000) gone.shift()
      if (gone.length > 3) {
        log.error('Not reloading the window: its process keeps ending.')
        return
      }
      window.webContents.reload()
    })
    window.on('unresponsive', () => log.warn('The window stopped responding.'))
    window.on('responsive', () => log.info('The window responds again.'))
    // External addresses such as Slack links open in the default browser.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    const screenUrl = webDevUrl ?? 'pacenote://app/'
    const screen = new ScreenLoader({
      load: () => window.loadURL(`${screenUrl}${route}`),
      probe: this.options.probe,
      showUnavailable: (reason) =>
        window.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(
            unavailablePage({ app: appName, reason, retryUrl: screenUrl })
          )}`
        ),
      // An upgrade put a new version in place: that one opens instead.
      gone: () =>
        window.isDestroyed() ||
        this.options.quitting() ||
        this.options.restarting(),
      passing: this.options.passing,
      log,
    })
    this.screen = screen
    window.on('closed', () => {
      if (this.window === window) this.window = undefined
      if (this.screen === screen) this.screen = undefined
    })
    window.webContents.on('will-navigate', (event, url) => {
      // "Try again" on the page that says why the screen is not there
      if (screen.unavailable) {
        event.preventDefault()
        screen.retryNow()
        return
      }
      if (
        !url.startsWith('pacenote://app/') &&
        !(webDevUrl && url.startsWith(webDevUrl))
      )
        event.preventDefault()
    })
    // The screen failing later, such as reloaded while an upgrade swaps its
    // files, is loaded again the same way, on the screen it was on. One
    // navigation cut short by the next (-3) is no failure.
    window.webContents.on(
      'did-fail-load',
      (_event, code, _description, url, isMainFrame) => {
        if (!isMainFrame || code === -3 || url.startsWith('data:')) return
        route = URL.canParse(url) ? new URL(url).hash : route
        void screen.load()
      }
    )
    if (webDevUrl) await waitForUrl(webDevUrl)
    // Not waited for: the screen may take its time, and the app goes on.
    const loaded = screen.load()
    if (capture) await loaded.then(() => capture.save(window))
  }
}

/**
 * Waits until the dev server is up. (pnpm desktop:dev starts the UI and the app
 * together) One that stays down is the screen's to try again for.
 */
async function waitForUrl(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok) return
    } catch {
      // Still starting.
    }
    await sleep(250)
  }
}
