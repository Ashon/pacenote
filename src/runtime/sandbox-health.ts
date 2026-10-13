import type { Logger } from '../logger.js'

/**
 * The message the desktop app sends the bot (utilityProcess) when a sandbox job
 * finishes
 */
export const RECHECK_SANDBOX = 'recheck-sandbox'

/**
 * The sandbox's readiness (its parts, the allowed domains, the broker), checked
 * again while the bot runs instead of only at startup, so the status bar and
 * the Pace screen follow a setup that finishes later. Reports a change only
 * when the problems differ from the last check.
 */
export class SandboxHealth {
  private problems: string[] = []
  private running?: Promise<void>
  private timer?: NodeJS.Timeout

  /**
   * label: what is checked, for the log: the sandbox, or the reasoner CLI when
   * it runs on this Mac
   */
  constructor(
    private readonly verify: () => Promise<string[]>,
    private readonly onChange: (problems: string[]) => void,
    private readonly log: Logger,
    private readonly label = 'Sandbox'
  ) {}

  get current(): readonly string[] {
    return this.problems
  }

  /**
   * Checks now. A check already in progress is joined rather than started
   * twice.
   */
  check(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = undefined
    })
    return this.running
  }

  /** Checks again every intervalMs, without keeping the process alive. */
  start(intervalMs: number): void {
    this.timer = setInterval(() => void this.check(), intervalMs)
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
  }

  private async run(): Promise<void> {
    const next = await this.verify().catch((err: unknown) => [
      `${this.label} check failed: ${(err as Error).message}`,
    ])
    if (next.join('\n') === this.problems.join('\n')) return
    const before = this.problems
    this.problems = next
    if (next.length === 0 && before.length > 0)
      this.log.info(
        `${this.label} ready: the earlier check issues are resolved.`
      )
    for (const problem of next.filter((p) => !before.includes(p)))
      this.log.error(`${this.label}: ${problem}`)
    this.onChange(next)
  }
}
