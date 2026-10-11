import type { PowerSaveBlocker } from 'electron'

/**
 * Keeps the Mac from going to sleep while Pace answers, so an answer is not
 * cut off halfway (it would resume after waking, late). Only system sleep is
 * held off; the display still sleeps, and closing the lid still sleeps the
 * Mac.
 */
export class KeepAwake {
  private id?: number

  constructor(
    private readonly blocker: Pick<PowerSaveBlocker, 'start' | 'stop'>
  ) {}

  get holding(): boolean {
    return this.id !== undefined
  }

  /** busy: requests are in progress */
  set(busy: boolean): void {
    if (busy && this.id === undefined)
      this.id = this.blocker.start('prevent-app-suspension')
    else if (!busy && this.id !== undefined) {
      this.blocker.stop(this.id)
      this.id = undefined
    }
  }
}
