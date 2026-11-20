import type { SessionPlanStep } from './types.js'

/**
 * The plan a Claude Code session keeps while it works, read from its log:
 * the task list it makes with TaskCreate and moves along with TaskUpdate
 * (Claude Code 2.1), or the to-do list it writes whole with TodoWrite (before
 * it). Pure, so it is tested without Claude Code.
 */

/**
 * The steps Claude Code keeps its plan with: its page shows the plan instead
 * of them
 */
export const PLAN_TOOLS: ReadonlySet<string> = new Set([
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
])

/** A plan shows this many steps at most: the first ones */
const STEPS = 30
const TEXT_CHARS = 200

interface Step extends SessionPlanStep {
  id: string
}

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim().slice(0, TEXT_CHARS) : ''

const STATES: Record<string, SessionPlanStep['state']> = {
  pending: 'todo',
  in_progress: 'doing',
  completed: 'done',
}

export class PlanReader {
  private steps: Step[] = []
  /** Its TaskCreate and TaskUpdate steps by their id, until they come back */
  private readonly asked = new Map<string, { name: string; input: unknown }>()
  /** The ids it gave its tasks so far, for one whose answer names none */
  private last = 0

  /** A step it took: a plan's, for the plan */
  use(name: string, input: unknown, id?: string): void {
    const value = (input ?? {}) as Record<string, unknown>
    if (name === 'TodoWrite' && Array.isArray(value.todos)) {
      this.steps = (value.todos as Record<string, unknown>[])
        .map((todo, index) => this.step(String(index + 1), todo))
        .filter((s) => s.text)
      return
    }
    if ((name === 'TaskCreate' || name === 'TaskUpdate') && id)
      this.asked.set(id, { name, input })
  }

  /**
   * How a step came back: a task made has the id Claude Code gave it, a task
   * changed its new state. One that failed changes nothing.
   */
  result(id: string, answer: unknown, failed: boolean): void {
    const asked = this.asked.get(id)
    if (!asked) return
    this.asked.delete(id)
    if (failed) return
    const input = (asked.input ?? {}) as Record<string, unknown>
    if (asked.name === 'TaskCreate') {
      const made = (answer as { task?: { id?: unknown } } | undefined)?.task?.id
      const taskId = made === undefined ? String(this.last + 1) : String(made)
      this.last = Math.max(this.last, Number(taskId) || 0)
      const step = this.step(taskId, { ...input, status: 'pending' })
      if (step.text)
        this.steps = [...this.steps.filter((s) => s.id !== taskId), step]
      return
    }
    const taskId = String(input.taskId ?? '')
    if (input.status === 'deleted') {
      this.steps = this.steps.filter((s) => s.id !== taskId)
      return
    }
    this.steps = this.steps.map((s) =>
      s.id === taskId
        ? {
            ...s,
            ...(STATES[String(input.status)]
              ? { state: STATES[String(input.status)]! }
              : {}),
            ...(text(input.subject) ? { text: text(input.subject) } : {}),
            ...(text(input.activeForm)
              ? { doing: text(input.activeForm) }
              : {}),
          }
        : s
    )
  }

  /** The plan as it stands, while a step of it is left; none once all done */
  plan(): SessionPlanStep[] | undefined {
    if (!this.steps.some((s) => s.state !== 'done')) return undefined
    return this.steps.slice(0, STEPS).map(({ text, state, doing }) => ({
      text,
      state,
      ...(doing ? { doing } : {}),
    }))
  }

  private step(id: string, value: Record<string, unknown>): Step {
    const doing = text(value.activeForm)
    return {
      id,
      text: text(value.subject) || text(value.content),
      state: STATES[String(value.status)] ?? 'todo',
      ...(doing ? { doing } : {}),
    }
  }
}
