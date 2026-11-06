import type { TodoListView } from '@src/desktop-bridge'
import type { TaskView } from '@src/tasks/types'
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { renderScreen, stubDesktop, unstubDesktop } from '@/testing'
import { TasksPage } from './tasks-page'

const HOUR = 3600_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const task = (id: string, extra: Partial<TaskView> = {}): TaskView => ({
  id,
  source: { conversation: 'C1', label: '#payments', message: id },
  title: `Task ${id}`,
  askedBy: 'mina',
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by name',
  postedAt: ago(5 * HOUR),
  foundAt: ago(4 * HOUR),
  status: 'open',
  faded: false,
  ...extra,
})

/** Todo's list as the desktop app sends it, Todo on */
const todo = (
  tasks: TaskView[],
  extra: Partial<TodoListView> = {}
): TodoListView => ({
  tasks,
  collectedAt: ago(HOUR),
  settings: {
    on: true,
    dms: false,
    exclude: [],
    cli: 'claude',
    tools: ['claude', 'codex'],
    opensIn: { claude: 'terminal', codex: 'terminal', opencode: 'terminal' },
  },
  collect: {},
  ai: { chosen: 'claude', fallback: true, state: {} },
  aiSet: true,
  collections: [],
  working: {},
  stages: {},
  proposals: {},
  groups: { yours: [], notYours: [] },
  areas: {},
  ...extra,
})

/**
 * Todo with the desktop app answering this list, and its calls to watch;
 * again() has Todo ask for the list once more, as it does every few seconds
 */
function todoWith(list: TodoListView | null) {
  const tasks = {
    list: vi.fn(async () => list),
    collect: vi.fn(async () => undefined),
    leaveOut: vi.fn(async () => []),
  }
  stubDesktop({ tasks })
  const { client } = renderScreen(
    <TooltipProvider>
      <TasksPage />
    </TooltipProvider>
  )
  const again = (next: TodoListView) => {
    tasks.list.mockResolvedValue(next)
    return client.invalidateQueries({ queryKey: ['tasks'] })
  }
  return { ...tasks, again }
}

const tab = (name: RegExp) => screen.getByRole('tab', { name })

/** The titles of the rows listed, as their buttons read */
const listed = () =>
  [...document.querySelectorAll('[data-task-row] [data-task-title]')].map(
    (title) => title.textContent
  )

/** Waits for a row's title, which opens it */
const row = (title: string) => screen.findByRole('button', { name: title })

afterEach(() => {
  cleanup()
  unstubDesktop()
  localStorage.clear()
})

describe('Todo', () => {
  it('says the desktop app gathers tasks, outside it', () => {
    renderScreen(<TasksPage />)
    expect(
      screen.getByText('Tasks are gathered by the desktop app.')
    ).toBeTruthy()
  })

  it('says how to turn tasks on while they are off', async () => {
    todoWith(todo([], { settings: { ...todo([]).settings, on: false } }))
    expect(
      await screen.findByRole('button', { name: 'Turn on in Settings' })
    ).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('lists the open tasks, with each tab counted', async () => {
    todoWith(
      todo([
        task('a'),
        task('b'),
        task('maybe', { status: 'maybe', title: 'A guess' }),
        task('done', { status: 'done', settledAt: ago(HOUR) }),
      ])
    )
    await row('Task a')
    expect(listed()).toEqual(['Task a', 'Task b'])
    expect(screen.getByText(/^2 open · collected/)).toBeTruthy()
    expect(tab(/^Open/).textContent).toBe('Open 2')
    expect(tab(/^Maybe/).textContent).toBe('Maybe 1')
    // Waiting shows once a task waits on someone
    expect(screen.queryByRole('tab', { name: /^Waiting/ })).toBeNull()
  })

  it("moves to a tab's list, with what the tab says", async () => {
    todoWith(todo([task('a'), task('maybe', { status: 'maybe' })]))
    await row('Task a')
    fireEvent.mouseDown(tab(/^Maybe/))
    fireEvent.click(tab(/^Maybe/))
    await row('Task maybe')
    expect(listed()).toEqual(['Task maybe'])
    expect(screen.getByText(/^Guesses Pace is not sure about/)).toBeTruthy()
  })

  it('keeps a task that comes in while you look behind a notice', async () => {
    const calls = todoWith(todo([task('a')]))
    await row('Task a')
    await act(() => calls.again(todo([task('a'), task('new')])))
    const notice = await screen.findByRole('button', { name: '1 new task' })
    expect(listed()).toEqual(['Task a'])
    fireEvent.click(notice)
    await row('Task new')
    expect(listed()).toEqual(['Task a', 'Task new'])
  })

  it('says why Open is empty, before and after a collection', async () => {
    todoWith(todo([]))
    expect(
      await screen.findByText(/^Nothing open\. The next collection/)
    ).toBeTruthy()
    cleanup()
    unstubDesktop()
    todoWith(todo([], { collectedAt: undefined, aiSet: false }))
    expect(await screen.findByText(/^Nothing yet\. Add a task/)).toBeTruthy()
    // With no AI set up, the header offers one in place of Collect now
    expect(
      screen.getByRole('button', { name: 'Find tasks with AI' })
    ).toBeTruthy()
  })

  it('collects now from the header', async () => {
    const calls = todoWith(todo([task('a')]))
    await row('Task a')
    fireEvent.click(screen.getByRole('button', { name: 'Collect now' }))
    await waitFor(() => expect(calls.collect).toHaveBeenCalledOnce())
  })

  it('offers to leave out a channel you kept dismissing, until you say not now', async () => {
    const leaveOut = { conversation: 'C9', label: '#random', count: 4 }
    const calls = todoWith(todo([task('a')], { leaveOut }))
    const offer = (await screen.findByText(/^You dismissed 4 tasks from/))
      .parentElement!
    fireEvent.click(within(offer).getByRole('button', { name: 'Leave it out' }))
    expect(calls.leaveOut).toHaveBeenCalledWith('#random')
    fireEvent.click(within(offer).getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText(/^You dismissed 4 tasks from/)).toBeNull()
    expect(localStorage.getItem('pacenote.tasks.leave-out-declined')).toBe(
      '["C9"]'
    )
  })
})
