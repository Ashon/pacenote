import type { DesktopBridge } from '@src/desktop-bridge'
import type {
  FolderCheck,
  RelatedTask,
  TaskDetail,
  TaskView,
} from '@src/tasks/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LanguageProvider } from '@/lib/i18n'
import { TaskRow } from './task-row'
import type { Session } from './task-sessions'

const FOLDER = '/Users/me/code/pay'

const task = (extra: Partial<TaskView> = {}): TaskView => ({
  id: 't1',
  source: {
    conversation: 'C1',
    label: '#payments',
    message: '1',
    permalink: 'https://acme.slack.com/archives/C1/p1',
  },
  title: 'Review the retry PR',
  askedBy: 'mina',
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by name',
  summary: 'Mina wants the payment retry PR reviewed before Friday.',
  postedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  foundAt: new Date(Date.now() - 3600_000).toISOString(),
  status: 'open',
  faded: false,
  ...extra,
})

const session = (id: string, extra: Partial<Session> = {}): Session => ({
  kind: 'session',
  id,
  task: 't1',
  tool: 'claude',
  session: `${id}-tool-id`,
  cwd: FOLDER,
  startedAt: new Date(Date.now() - 3600_000).toISOString(),
  ...extra,
})

const earlier = (id: string, extra: Partial<RelatedTask> = {}) => ({
  id,
  title: `Earlier ${id}`,
  where: '#payments',
  postedAt: '2026-10-20T09:00:00Z',
  status: 'done' as const,
  ...extra,
})

/**
 * The desktop app's side of the row (window.pacenoteDesktop): the task's
 * detail as given, and each call it may make
 */
function desktop(detail: Partial<TaskDetail> = {}) {
  let current: TaskDetail = {
    task: task(),
    cli: 'claude',
    work: [],
    context: { thread: { runs: [], tasks: [] } },
    ...detail,
  }
  const folders: FolderCheck[] = [
    { path: FOLDER, matches: true, remote: 'git@github.com:acme/pay.git' },
  ]
  const tasks = {
    detail: vi.fn(async () => current),
    repos: vi.fn(async () => ({ 'acme/pay': FOLDER })),
    folders: vi.fn(async () => folders),
    chooseFolder: vi.fn(async () => undefined),
    continueIn: vi.fn(async () => ({
      note: 'Send it in the Claude app to start.',
    })),
    draft: vi.fn(async () => {
      current = {
        ...current,
        work: [
          {
            kind: 'draft' as const,
            id: 'd1',
            task: 't1',
            at: new Date().toISOString(),
            text: 'Looking at it today.',
          },
        ],
      }
      return {}
    }),
    copyReply: vi.fn(async () => ({})),
    resume: vi.fn(async () => ({})),
    answerSuggestion: vi.fn(async () => undefined),
    answerProposal: vi.fn(async () => ({})),
    keepLeft: vi.fn(async () => ({})),
    takeBackFill: vi.fn(async () => ({})),
    keepBoth: vi.fn(async () => ({})),
    answerGroup: vi.fn(async () => ({})),
    sessionLog: vi.fn(async () => ({
      items: [
        { role: 'user' as const, text: 'Look at the retry PR' },
        { role: 'assistant' as const, text: 'It retries twice now.' },
      ],
    })),
  }
  window.pacenoteDesktop = {
    language: {
      initial: { preference: 'en', locale: 'en' },
      set: vi.fn(),
      onChanged: () => () => {},
    },
    tasks,
  } as unknown as DesktopBridge
  return tasks
}

type RowProps = Parameters<typeof TaskRow>[0]

/** The row in its list, opened and closed as the Todo page does it */
function Row({
  opened = false,
  onToggle,
  ...props
}: Omit<RowProps, 'open' | 'onToggle'> & {
  opened?: boolean
  onToggle: () => void
}) {
  const [open, setOpen] = useState(opened)
  return (
    <TaskRow
      {...props}
      open={open}
      onToggle={() => {
        onToggle()
        setOpen(!open)
      }}
    />
  )
}

function renderRow(
  props: Partial<Omit<RowProps, 'open'>> & { task: TaskView },
  opened = false
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const calls = { onDecide: vi.fn(), onStage: vi.fn(), onToggle: vi.fn() }
  render(
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <TooltipProvider>
          <ul>
            <Row cli="claude" {...calls} {...props} opened={opened} />
          </ul>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  )
  return calls
}

const button = (name: string) => screen.getByRole('button', { name })

afterEach(() => {
  cleanup()
  delete window.pacenoteDesktop
  window.location.hash = ''
})

describe('an open code task in the Todo list', () => {
  it('shows what it is, a button for each tool, Done and Dismiss', async () => {
    desktop()
    renderRow({ task: task({ action: 'code', repo: 'acme/pay', due: 'Fri' }) })
    expect(screen.getByText('Review the retry PR')).toBeTruthy()
    expect(screen.getByText(/^mina asked you · #payments/)).toBeTruthy()
    expect(screen.getByText('Fri')).toBeTruthy()
    expect(screen.getByText('acme/pay')).toBeTruthy()
    const tools = screen.getByRole('group', { name: 'Continue in' })
    expect(
      within(tools)
        .getAllByRole('button')
        .map((each) => each.textContent)
    ).toEqual(['Claude Code', 'Codex'])
    expect(button('Done')).toBeTruthy()
    expect(button('Dismiss')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open in Slack' }).getAttribute('href')
    ).toBe('https://acme.slack.com/archives/C1/p1')
    // The task's own folder: Continue opens there, in its menu another one
    await waitFor(() =>
      expect(window.pacenoteDesktop?.tasks.repos).toHaveBeenCalled()
    )
  })

  it('continues in the folder its repository opened in before', async () => {
    const tasks = desktop({ folder: FOLDER })
    const { onToggle } = renderRow({
      task: task({ action: 'code', repo: 'acme/pay' }),
    })
    fireEvent.click(button('Continue in Claude Code'))
    await waitFor(() =>
      expect(tasks.continueIn).toHaveBeenCalledWith('t1', {
        tool: 'claude',
        folder: FOLDER,
      })
    )
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect((await screen.findByRole('status')).textContent).toBe(
      'Send it in the Claude app to start.'
    )
  })

  it('asks where to open when its repository has no folder yet', async () => {
    const tasks = desktop()
    renderRow({ task: task({ action: 'code', repo: 'acme/pay' }) })
    fireEvent.click(button('Continue in Codex'))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('Where is acme/pay on this Mac?')
    ).toBeTruthy()
    const folder = await within(dialog).findByRole('radio')
    expect(folder.getAttribute('aria-checked')).toBe('true')
    expect(folder.textContent).toContain(FOLDER)
    expect(tasks.folders).toHaveBeenCalledWith('t1')
    fireEvent.click(within(dialog).getByRole('button', { name: /Open Codex/ }))
    await waitFor(() =>
      expect(tasks.continueIn).toHaveBeenCalledWith('t1', {
        tool: 'codex',
        folder: FOLDER,
      })
    )
  })

  it('is done, or dismissed with a reason', () => {
    desktop()
    const { onDecide } = renderRow({ task: task({ action: 'code' }) })
    fireEvent.click(button('Done'))
    expect(onDecide).toHaveBeenLastCalledWith({ status: 'done' })

    fireEvent.click(button('Dismiss'))
    const why = screen.getByRole('group', { name: 'Why dismiss it' })
    // Its steps wait while it asks why
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    fireEvent.click(within(why).getByRole('button', { name: 'Already done' }))
    expect(onDecide).toHaveBeenLastCalledWith({
      status: 'dismissed',
      reason: 'done-already',
    })
    fireEvent.click(within(why).getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('group', { name: 'Why dismiss it' })).toBeNull()
    expect(button('Done')).toBeTruthy()
  })

  it('sets its stage from its menu', async () => {
    desktop()
    const { onStage } = renderRow({ task: task({ action: 'code' }) })
    fireEvent.keyDown(button('More for this task'), { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(['Draft a reply', 'Mark in progress', 'Waiting on someone else'])
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Mark in progress' })
    )
    expect(onStage).toHaveBeenCalledWith('started')
  })

  it('goes back to open from waiting on someone else', () => {
    desktop()
    const { onStage } = renderRow({
      task: task(),
      stage: { stage: 'waiting', at: new Date().toISOString(), by: 'you' },
    })
    expect(screen.getByText('Waiting since today')).toBeTruthy()
    fireEvent.click(button('Back to open'))
    expect(onStage).toHaveBeenCalledWith('open')
  })
})

describe('a reply to send in the thread', () => {
  it('is drafted in the opened row, for you to copy', async () => {
    const tasks = desktop()
    const { onToggle } = renderRow({ task: task({ action: 'reply' }) })
    fireEvent.click(button('Draft a reply'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(tasks.draft).toHaveBeenCalledWith('t1'))
    const box = await screen.findByRole('textbox')
    await waitFor(() =>
      expect((box as HTMLTextAreaElement).value).toBe('Looking at it today.')
    )
    expect(screen.getByText('Pacenote never sends it for you.')).toBeTruthy()
    fireEvent.click(button('Copy and open thread'))
    await waitFor(() =>
      expect(tasks.copyReply).toHaveBeenCalledWith('t1', 'Looking at it today.')
    )
  })
})

describe('a Maybe', () => {
  it('is kept as a task, or dismissed', () => {
    desktop()
    const { onDecide } = renderRow({
      task: task({ status: 'maybe', confidence: 'maybe' }),
    })
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    fireEvent.click(button('Keep as a task'))
    expect(onDecide).toHaveBeenLastCalledWith({ status: 'kept' })
    expect(button('Dismiss')).toBeTruthy()
  })

  it('asks whether its group means you', async () => {
    const tasks = desktop()
    renderRow({
      task: task({ status: 'maybe', group: '@pay-team' }),
      askGroup: '@pay-team',
    })
    const ask = screen.getByRole('group', {
      name: 'Whether @pay-team means you',
    })
    expect(within(ask).getByText('Does @pay-team mean you?')).toBeTruthy()
    fireEvent.click(within(ask).getByRole('button', { name: 'It’s me' }))
    await waitFor(() =>
      expect(tasks.answerGroup).toHaveBeenCalledWith('@pay-team', true)
    )
  })
})

describe('a settled task', () => {
  it('says how it was closed, and reopens as kept', () => {
    desktop()
    const { onDecide } = renderRow({
      task: task({
        status: 'closed',
        closed: { at: new Date().toISOString(), why: 'resolved', by: 'codex' },
      }),
    })
    expect(screen.getByText('Closed: done in Codex')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
    fireEvent.click(button('Reopen'))
    expect(onDecide).toHaveBeenLastCalledWith({ status: 'kept' })
  })

  it('takes a decision back once done', () => {
    desktop()
    const { onDecide } = renderRow({ task: task({ status: 'done' }) })
    expect(screen.getByText('Done')).toBeTruthy()
    fireEvent.click(button('Reopen'))
    expect(onDecide).toHaveBeenLastCalledWith(null)
  })
})

describe('an opened task with a session', () => {
  const detail: Partial<TaskDetail> = {
    work: [session('s1', { lastActiveAt: new Date().toISOString() })],
    context: {
      thread: {
        runs: [],
        tasks: [earlier('e1', { outcome: 'Done in Claude Code' })],
      },
    },
  }

  it('reminds you of the thread, Last time and your work', async () => {
    const tasks = desktop(detail)
    renderRow({ task: task({ action: 'code' }) }, true)
    expect(
      screen.getByText(
        'Mina wants the payment retry PR reviewed before Friday.'
      )
    ).toBeTruthy()
    expect(await screen.findByText('Last time')).toBeTruthy()
    expect(screen.getByText('Earlier e1')).toBeTruthy()
    expect(screen.getByText('Your work')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'Claude Code session' })
        .getAttribute('href')
    ).toBe('#/tasks/t1/log/s1')
    fireEvent.click(button('Continue this session in Claude Code'))
    await waitFor(() => expect(tasks.resume).toHaveBeenCalledWith('s1'))
  })

  it("opens the session's log over the list", async () => {
    const tasks = desktop(detail)
    renderRow({ task: task({ action: 'code' }), logEntry: 's1' }, true)
    const log = await screen.findByRole('dialog')
    expect(within(log).getByText('Session log')).toBeTruthy()
    expect(await within(log).findByText('It retries twice now.')).toBeTruthy()
    expect(tasks.sessionLog).toHaveBeenCalledWith('s1')
    fireEvent.click(
      within(log).getByRole('button', { name: 'Continue in Claude Code' })
    )
    await waitFor(() => expect(tasks.resume).toHaveBeenCalledWith('s1'))
    fireEvent.click(within(log).getByRole('button', { name: 'Close the log' }))
    expect(window.location.hash).toBe('#/tasks/t1')
  })
})
