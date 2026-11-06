import { localized } from '../i18n/locale.js'
import { text } from '../index.text.js'

/**
 * The problems the bot's status shows, in the app's language, from where each
 * comes: the sandbox check (or, on this Mac, the CLI's), why the reasoner
 * cannot answer until it answers again, images built by another version, and
 * problems fixed for the process's life (diagram rendering). changed hears the
 * whole list each time a part of it changes.
 */
export class StatusProblems {
  private readonly fixed: string[] = []
  private reasonerProblem: string | undefined

  constructor(
    private readonly options: {
      /** What the check looks at: the sandbox, or on this Mac the CLI */
      checked: 'sandbox' | 'reasoner'
      sandbox: () => readonly string[]
      images: () => readonly string[]
      changed: (problems: string[]) => void
    }
  ) {}

  /** Why the reasoner cannot answer, until it answers again */
  get reasoner(): string | undefined {
    return this.reasonerProblem
  }

  /** A problem for the process's life; told with the next change */
  add(problem: string): void {
    this.fixed.push(problem)
  }

  /** What the reasoner's last answer said: a problem, or none */
  setReasoner(problem: string | undefined): void {
    if (problem === this.reasonerProblem) return
    this.reasonerProblem = problem
    this.changed()
  }

  all(): string[] {
    const t = localized(text)
    const { checked } = this.options
    return [
      ...this.options.sandbox().map((problem) => t.problem(checked, problem)),
      ...(this.reasonerProblem
        ? [t.problem('reasoner', this.reasonerProblem)]
        : []),
      ...this.options.images(),
      ...this.fixed,
    ]
  }

  /** Tells the status the list, after a check */
  changed(): void {
    this.options.changed(this.all())
  }
}
