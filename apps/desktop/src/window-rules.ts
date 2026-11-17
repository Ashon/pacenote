import { MINUTE } from '../../../src/time.js'

/**
 * What the app's window does, apart from Electron (window.ts), so each rule
 * can be tested on its own
 */

/**
 * What a close does: while the app quits, the window closes; otherwise it
 * hides, leaving full screen first, since a window hidden in full screen
 * leaves its space on screen, all black
 */
export function closeAction(state: {
  quitting: boolean
  fullScreen: boolean
}): 'close' | 'leave-full-screen' | 'hide' {
  if (state.quitting) return 'close'
  return state.fullScreen ? 'leave-full-screen' : 'hide'
}

/**
 * How often a window whose process ended is loaded again: up to `max` times
 * in `windowMs`, then it stays blank rather than crash on and on
 */
export class CrashBudget {
  private readonly ended: number[] = []

  constructor(
    private readonly max = 3,
    private readonly windowMs = MINUTE,
    private readonly now = Date.now
  ) {}

  /** Counts one ending; whether to load the window again */
  reload(): boolean {
    const now = this.now()
    this.ended.push(now)
    while (this.ended.length && now - this.ended[0]! > this.windowMs)
      this.ended.shift()
    return this.ended.length <= this.max
  }
}

/** A link the screen opens goes to the default browser only over https */
export const opensInBrowser = (url: string): boolean => /^https:\/\//.test(url)

/** Where the window may go: the app's own screen, or the dev server's */
export const isScreenUrl = (url: string, webDevUrl?: string): boolean =>
  url.startsWith('pacenote://app/') ||
  Boolean(webDevUrl && url.startsWith(webDevUrl))

/**
 * The radius macOS rounds the window's corners with, so what sits in them
 * (the sheet) can follow them: 16 since macOS 26 (NSWindow's own
 * _cornerRadius on macOS 27.2, for a titled, full-size-content window as
 * Pacenote's hiddenInset one is, with or without a toolbar), 10 from macOS 11
 * to 15; 0 elsewhere, where Pacenote does not round them
 */
export function windowCorners(platform: string, version: string): number {
  if (platform !== 'darwin') return 0
  const major = Number.parseInt(version, 10)
  if (!Number.isFinite(major)) return 0
  return major >= 26 ? 16 : major >= 11 ? 10 : 0
}
