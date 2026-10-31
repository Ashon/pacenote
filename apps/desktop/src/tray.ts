import {
  Menu,
  Tray,
  nativeImage,
  type MenuItemConstructorOptions,
} from 'electron'
import type { Locale } from '../../../src/i18n/locale.js'
import type { SupervisorState } from '../../../src/runtime/types.js'
import { setupSettingsRoute } from '../../../src/settings/fields.js'
import { text } from './main.text.js'

/** What Pace's state adds to the menu bar item, read once per tick */
export interface TraySummary {
  /** One line beside the icon's tooltip: connected, standing by, retrying */
  label: string
  /** Requests in progress, shown as the title and its own menu line */
  active: number
}

type TrayWords = (typeof text)[Locale]

/**
 * The menu bar item: the icon with its title (Dev, a warning sign, the count
 * of active requests), the status line, and the quick actions that follow
 * Pace's phase, set up from main.ts's tick every 2 seconds. The tick decides
 * what to say (its summary, its notes); this holds the item and only redraws
 * when any of it changed.
 */
export class TrayMenu {
  private tray: Tray | undefined
  private lastKey = ''

  constructor(
    private readonly options: {
      appName: string
      /** tray.png, in the bundle's dist folder (its @2x sits beside it) */
      iconPath: string
      /** Whether the app shows as Dev beside the icon (a run from source) */
      dev: boolean
      /** The menu's words, in the app's language */
      words: () => TrayWords
      /** Pace's state: undefined until the app is ready */
      bot: () => SupervisorState | undefined
      /** Whether the setup screen is what Pace is waiting on */
      setupOpen: () => boolean
      /** A newer version's number, when one is out (Settings > General) */
      update: () => string | undefined
      openWindow(route?: string): void
      startBot(): void
      restartBot(): void
      openSettings(route: string): void
      quit(): void
    }
  ) {}

  create(): void {
    this.tray = new Tray(nativeImage.createFromPath(this.options.iconPath))
    this.tray.on('click', () => this.tray?.popUpContextMenu())
  }

  /** The next tick redraws with whatever words it holds (a language change) */
  reset(): void {
    this.lastKey = ''
  }

  /** Says something the next refresh will not (the app is stopping) */
  setToolTip(text: string): void {
    this.tray?.setToolTip(text)
  }

  /**
   * Every 2 seconds: the tooltip, the title and the menu, when any of them
   * changed. notes are the troubles the status line does not say already.
   */
  refresh(summary: TraySummary, notes: string[], troubleCount: number): void {
    const tray = this.tray
    if (!tray) return
    const { appName, dev } = this.options
    const bot = this.options.bot()
    const phase = bot?.phase
    const update = this.options.update()
    const key = JSON.stringify([
      summary.label,
      summary.active,
      phase,
      troubleCount,
      notes,
      update,
    ])
    if (key === this.lastKey) return
    this.lastKey = key
    const t = this.options.words()
    tray.setToolTip(t.tooltip(appName, summary.label))
    // Shows the number of active requests next to the menu bar icon. (macOS)
    // Dev runs say so beside the icon, since the installed Pacenote may sit
    // next to it.
    // A warning sign while there is trouble, so it shows with the window
    // closed.
    tray.setTitle(
      [
        dev ? 'Dev' : '',
        troubleCount > 0 ? '\u26a0\ufe0e' : '',
        summary.active > 0 ? String(summary.active) : '',
      ]
        .filter(Boolean)
        .join(' ')
    )
    // The tray opens the app first, then the status and quick actions. Bot
    // control is on the Bot screen; app settings (start automatically, run
    // history folder) are on the Settings screen.
    const live = phase === 'running' || phase === 'starting'
    // When setup is needed, the quick action is opening Settings rather than a
    // Start that would stop again.
    const controls: MenuItemConstructorOptions[] = bot
      ? [
          // Off: set it up from Settings, rather than a Start with nothing set
          bot.off && phase === 'idle'
            ? {
                label: t.setUp,
                click: () => this.options.openWindow('#/settings'),
              }
            : live
              ? { label: t.restart, click: () => this.options.restartBot() }
              : phase === 'setup'
                ? this.options.setupOpen()
                  ? {
                      label: t.setUp,
                      click: () => this.options.openWindow('#/setup'),
                    }
                  : {
                      label: t.openSettings,
                      click: () =>
                        this.options.openSettings(
                          setupSettingsRoute(bot.issues)
                        ),
                    }
                : {
                    label: t.start,
                    enabled:
                      phase === 'idle' ||
                      phase === 'failed' ||
                      phase === 'crashed',
                    click: () => this.options.startBot(),
                  },
        ]
      : []
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t.open(appName), click: () => this.options.openWindow() },
        { type: 'separator' },
        { label: t.status(summary.label), enabled: false },
        ...notes.map((note) => ({ label: note, enabled: false })),
        ...(summary.active > 0
          ? [{ label: t.activeRequests(summary.active), enabled: false }]
          : []),
        ...controls,
        { type: 'separator' },
        ...(update
          ? [
              {
                label: t.updateOut(update),
                click: () => this.options.openWindow('#/settings/general'),
              },
            ]
          : []),
        { label: t.quit(appName), click: () => this.options.quit() },
      ])
    )
  }
}

/** A menu item's text, short enough for the menu bar's menu */
export function truncateLabel(text: string, max = 72): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
