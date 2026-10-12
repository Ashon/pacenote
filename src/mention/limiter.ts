/** Limits the number of concurrent tasks and the queue length. */
export class ConcurrencyLimiter {
  private active = 0
  private queue: (() => void)[] = []

  constructor(
    private readonly maxActive: number,
    private readonly maxQueue: number
  ) {}

  /** Whether any task is running or queued */
  get busy(): boolean {
    return this.active > 0 || this.queue.length > 0
  }

  /** Whether a task given now would wait for another to finish */
  get saturated(): boolean {
    return this.active >= this.maxActive
  }

  /** Whether a task given now would be turned away */
  get full(): boolean {
    return this.saturated && this.queue.length >= this.maxQueue
  }

  /**
   * Runs or queues the task and returns true if there is room, false if full
   */
  tryRun(task: () => Promise<void>): boolean {
    if (this.full) return false
    const start = () => {
      this.active += 1
      void task()
        .catch(() => undefined)
        .finally(() => {
          this.active -= 1
          this.queue.shift()?.()
        })
    }
    if (this.active < this.maxActive) start()
    else this.queue.push(start)
    return true
  }

  /** Drops the queued tasks, which never start; running ones go on. */
  clear(): void {
    this.queue = []
  }
}
