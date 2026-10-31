import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { DeviceAnswers } from '../device-answers.js'
import type { MainWindow } from '../window.js'

export type Run = (...args: unknown[]) => unknown

/** run's answer, or { error }: a thrown error loses its message over IPC */
export async function orError<T>(
  run: () => T | Promise<T>
): Promise<T | { error: string }> {
  try {
    return await run()
  } catch (err) {
    return { error: (err as Error).message }
  }
}

/**
 * The window's IPC, as main.ts and the ipc/ modules register it. A channel
 * answers the main window, and your devices with the same function
 * (DeviceAnswers); anything else gets denied, the channel's own empty answer.
 */
export class Ipc {
  constructor(
    private readonly options: {
      window: MainWindow
      devices: DeviceAnswers
      /** Why another sender gets an { error }, in the app's language */
      notAllowed: () => string
    }
  ) {}

  /** Whether an ask came from the main window */
  fromWindow(event: IpcMainInvokeEvent): boolean {
    return this.options.window.sentBy(event.sender)
  }

  /** A channel the window and your devices use; others get denied */
  handle(channel: string, denied: unknown, run: Run): void {
    this.handleDenying(channel, () => denied, run)
  }

  /** The same, with an answer for others worded when asked */
  handleDenying(channel: string, denied: () => unknown, run: Run): void {
    this.options.devices.bridge(channel, run)
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      this.fromWindow(event) ? run(...args) : denied()
    )
  }

  /** A channel that answers { error } when it throws, and to others */
  handleOrError(
    channel: string,
    run: (...args: unknown[]) => Promise<unknown>
  ): void {
    this.options.devices.bridge(channel, (...args) =>
      orError(() => run(...args))
    )
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      this.fromWindow(event)
        ? orError(() => run(...args))
        : { error: this.options.notAllowed() }
    )
  }

  /**
   * A channel for the window alone: your devices do not run it (a sandbox
   * job, a sign-in on this Mac)
   */
  windowOnly(channel: string, denied: () => unknown, run: Run): void {
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      this.fromWindow(event) ? run(...args) : denied()
    )
  }
}
