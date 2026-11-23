import type { BundleSuggestion, TaskBundle } from '@src/tasks/bundle-view'
import type { TaskView } from '@src/tasks/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LanguageProvider } from '@/lib/i18n'
import { groupFacts } from '@/lib/todo-list'
import { DoneAllDialog, GroupRow, GroupSuggestion } from './task-group'

const NOW = new Date().toISOString()

const task = (id: string, extra: Partial<TaskView> = {}): TaskView => ({
  id,
  source: { conversation: 'C1', label: '#payments', message: id },
  title: `Task ${id}`,
  kind: 'asked',
  confidence: 'sure',
  reason: 'asked by name',
  postedAt: NOW,
  foundAt: NOW,
  repo: 'Ashon/payments',
  status: 'open',
  faded: false,
  ...extra,
})

const tasks = [
  task('a', { askedBy: 'hyun', title: 'Raise the webhook retry limit to 5' }),
  task('b', { askedBy: 'mina', due: 'Thursday', title: 'Review PR #482' }),
  task('c', { kind: 'promised', title: 'Update the runbook' }),
]

const group = (extra: Partial<TaskBundle> = {}): TaskBundle => ({
  id: 'g',
  tasks: ['a', 'b', 'c'],
  stale: false,
  canUndo: true,
  tookBack: false,
  at: NOW,
  fill: {
    title: 'Webhook retries',
    summary: 'Webhook retries go from 3 attempts to 5, with backoff.',
    waits: [{ task: 'b', wants: 'your review of PR #482' }],
    due: 'b',
    first: { task: 'a', why: 'the rest builds on it' },
    at: NOW,
    by: 'claude-code',
    for: 'k',
  },
  ...extra,
})

const inPage = (node: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider>
        <TooltipProvider>{node}</TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  )

afterEach(cleanup)

describe("a group's row", () => {
  const rowOf = (props: Partial<Parameters<typeof GroupRow>[0]> = {}) => {
    const calls = {
      onToggle: vi.fn(),
      onContinue: vi.fn(),
      onDoneAll: vi.fn(),
      onUngroup: vi.fn(),
      onUndo: vi.fn(),
      onFillAgain: vi.fn(),
    }
    const shown = props.group ?? group()
    inPage(
      <ul>
        <GroupRow
          group={shown}
          facts={groupFacts(shown, tasks)}
          open={false}
          {...calls}
          {...props}
        >
          <ul>
            <li>members</li>
          </ul>
        </GroupRow>
      </ul>
    )
    return calls
  }

  it('says what it is, who waits and the due, with its tasks under it', () => {
    const calls = rowOf()
    expect(screen.getByText('Webhook retries')).toBeTruthy()
    expect(screen.getByText('3 tasks')).toBeTruthy()
    expect(screen.getByText('hyun and mina wait · none done yet')).toBeTruthy()
    expect(screen.getByText('Thursday')).toBeTruthy()
    expect(screen.getByText('members')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue here' }))
    expect(calls.onContinue).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Done all' }))
    expect(calls.onDoneAll).toHaveBeenCalled()
  })

  it('opened, shows its summary, who waits for what, what comes first, and Undo', () => {
    const calls = rowOf({ open: true })
    expect(
      screen.getByText('Webhook retries go from 3 attempts to 5, with backoff.')
    ).toBeTruthy()
    expect(screen.getByText('your review of PR #482 · #payments')).toBeTruthy()
    // hyun's wait, from the task they asked, as your AI did not say
    expect(
      screen.getByText('Raise the webhook retry limit to 5 · #payments')
    ).toBeTruthy()
    expect(screen.getByText('the rest builds on it')).toBeTruthy()
    expect(screen.getByText('3 of 3')).toBeTruthy()
    expect(screen.getByText(/Filled in just now · Claude Code/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(calls.onUndo).toHaveBeenCalled()
  })

  it('says its AI is at work, and when all its tasks are done', () => {
    const done = tasks.map((each) => ({ ...each, status: 'done' as const }))
    inPage(
      <ul>
        <GroupRow
          group={group()}
          facts={groupFacts(group(), done)}
          open={false}
          filling="Claude Code"
          onToggle={() => undefined}
          onUngroup={() => undefined}
          onUndo={() => undefined}
          onFillAgain={() => undefined}
        >
          {null}
        </GroupRow>
      </ul>
    )
    expect(screen.getByText('Claude Code is filling it in')).toBeTruthy()
    expect(screen.getByText('all done')).toBeTruthy()
  })
})

describe("your AI's suggestion", () => {
  it('lists the tasks and takes Group them or Not one piece', async () => {
    const suggestion: BundleSuggestion = {
      id: 's',
      tasks: ['a', 'b', 'c'],
      name: 'Webhook retries',
      by: 'claude-code',
      after: 'c',
    }
    const onAnswer = vi.fn(async () => undefined)
    inPage(
      <GroupSuggestion
        suggestion={suggestion}
        tasks={tasks}
        onAnswer={onAnswer}
      />
    )
    expect(
      screen.getByText('These 3 look like one piece of work:')
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Claude Code saw them after filling in “Update the runbook”.'
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Group them' }))
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true))
  })
})

describe('Done all', () => {
  it('starts from what your AI wrote, and closes the open tasks with it', async () => {
    const onDone = vi.fn(async () => undefined)
    const onClose = vi.fn()
    inPage(
      <DoneAllDialog
        facts={groupFacts(group(), tasks)}
        aiName="Claude Code"
        open
        onClose={onClose}
        onWrapUp={async () => ({ text: 'Raised the limit to 5.' })}
        onDone={onDone}
      />
    )
    expect(screen.getByText('Done with Webhook retries?')).toBeTruthy()
    const note = await screen.findByDisplayValue('Raised the limit to 5.')
    fireEvent.change(note, { target: { value: 'Raised it to 5.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done all 3' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Raised it to 5.'))
    expect(onClose).toHaveBeenCalled()
  })
})
