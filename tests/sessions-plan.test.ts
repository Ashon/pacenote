import { describe, expect, it } from 'vitest'
import { PlanReader } from '../src/sessions/plan.js'

describe('PlanReader: the plan a Claude Code session keeps while it works', () => {
  it('follows its task list as it makes and moves its tasks', () => {
    const plan = new PlanReader()
    plan.use(
      'TaskCreate',
      { subject: 'Read the test', activeForm: 'Reading' },
      'a'
    )
    plan.use('TaskCreate', { subject: 'Fix the delay' }, 'b')
    // Not a plan until they come back
    expect(plan.plan()).toBeUndefined()
    plan.result('a', { task: { id: '1', subject: 'Read the test' } }, false)
    plan.result('b', { task: { id: '2', subject: 'Fix the delay' } }, false)
    expect(plan.plan()).toEqual([
      { text: 'Read the test', state: 'todo', doing: 'Reading' },
      { text: 'Fix the delay', state: 'todo' },
    ])
    plan.use('TaskUpdate', { taskId: '1', status: 'completed' }, 'c')
    plan.use(
      'TaskUpdate',
      { taskId: '2', status: 'in_progress', activeForm: 'Fixing the delay' },
      'd'
    )
    plan.result('c', {}, false)
    plan.result('d', {}, false)
    expect(plan.plan()).toEqual([
      { text: 'Read the test', state: 'done', doing: 'Reading' },
      { text: 'Fix the delay', state: 'doing', doing: 'Fixing the delay' },
    ])
    // A step that failed changes nothing; one deleted is gone
    plan.use('TaskUpdate', { taskId: '2', status: 'completed' }, 'e')
    plan.result('e', {}, true)
    expect(plan.plan()?.[1]?.state).toBe('doing')
    plan.use('TaskCreate', { subject: 'Tidy up' }, 'f')
    // An answer that names no id: the one after the last
    plan.result('f', undefined, false)
    expect(plan.plan()).toHaveLength(3)
    plan.use('TaskUpdate', { taskId: '3', status: 'deleted' }, 'g')
    plan.result('g', {}, false)
    expect(plan.plan()).toHaveLength(2)
    // All done: no plan left to show
    plan.use('TaskUpdate', { taskId: '2', status: 'completed' }, 'h')
    plan.result('h', {}, false)
    expect(plan.plan()).toBeUndefined()
  })

  it('takes a to-do list written whole (TodoWrite)', () => {
    const plan = new PlanReader()
    plan.use('TodoWrite', {
      todos: [
        { content: 'Read it', status: 'completed' },
        { content: 'Fix it', status: 'in_progress', activeForm: 'Fixing it' },
        { content: '', status: 'pending' },
        { content: 'Ship it', status: 'pending' },
      ],
    })
    expect(plan.plan()).toEqual([
      { text: 'Read it', state: 'done' },
      { text: 'Fix it', state: 'doing', doing: 'Fixing it' },
      { text: 'Ship it', state: 'todo' },
    ])
    // Another tool, or a step it never sent back, changes nothing
    plan.use('Bash', { command: 'pnpm test' }, 'x')
    plan.result('x', {}, false)
    plan.result('nobody', {}, false)
    expect(plan.plan()).toHaveLength(3)
  })

  it('keeps a long plan short', () => {
    const plan = new PlanReader()
    plan.use('TodoWrite', {
      todos: Array.from({ length: 40 }, (_, index) => ({
        content: `${index} ${'x'.repeat(300)}`,
        status: 'pending',
      })),
    })
    expect(plan.plan()).toHaveLength(30)
    expect(plan.plan()?.[0]?.text).toHaveLength(200)
  })
})
