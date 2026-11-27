import type { SessionRow, SessionsView } from '@src/sessions/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/lib/i18n'
import { NewSessionPage } from './session-new'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const TASK = 'C1:1.2'

/** The task's Claude Code session, resting since Pacenote let it go */
const resting = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: 'claude:5b1e4c7d',
  tool: 'claude',
  session: '5b1e4c7d',
  title: 'Raise the webhook retry limit to 5',
  where: 'pacenote',
  state: 'quiet',
  resting: true,
  lastAt: new Date(Date.now() - 42 * 60_000).toISOString(),
  startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  cwd: '/w/pay',
  typed: [],
  task: { id: TASK, title: 'Raise the webhook retry limit to 5' },
  ...over,
})

const viewOf = (rows: SessionRow[]): SessionsView => ({
  on: true,
  open: [{ key: 'none', sessions: rows }],
  ended: [],
  counts: { open: rows.length, working: 0, turn: 0, ended: 0 },
  listed: true,
})

/** A desktop bridge with what the page reads; the rest does nothing */
const desktop = (view: () => Promise<SessionsView>) => {
  const part = (given: Record<string, unknown>) =>
    new Proxy(given, {
      get: (target, key) =>
        key in target
          ? Reflect.get(target, key)
          : typeof key === 'string' && /^on[A-Z]/.test(key)
            ? () => () => undefined
            : async () => null,
    })
  return {
    language: { initial: 'en', onChanged: () => () => undefined },
    settings: part({}),
    tasks: part({
      newSession: async () => ({
        prompt: 'Raise the retry limit',
        marker: 'm1',
        folder: '/w/pay',
      }),
      detail: async () => ({
        task: {
          id: TASK,
          title: 'Raise the webhook retry limit to 5',
          repo: 'Ashon/payments',
          status: 'open',
        },
        context: { thread: { runs: [], tasks: [] } },
        work: [],
      }),
    }),
    sessions: part({
      view,
      tools: async () => ({ claude: { ready: true }, codex: { ready: true } }),
    }),
  }
}

const page = (shown: SessionsView) => {
  const view = vi.fn(async () => shown)
  vi.stubGlobal('pacenoteDesktop', desktop(view))
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider>
        <NewSessionPage task={TASK} />
      </LanguageProvider>
    </QueryClientProvider>
  )
  return view
}

describe('a new session for a task that has one open (Y5)', () => {
  it('says so and opens that one, to go on in its conversation', async () => {
    page(viewOf([resting()]))
    expect(
      await screen.findByText('This task has a session you have not closed')
    ).toBeTruthy()
    const open = screen.getByRole('link', { name: 'Open that session' })
    expect(open.getAttribute('href')).toBe('#/sessions/claude%3A5b1e4c7d')
    expect(screen.getByText(/^Quiet 42/)).toBeTruthy()
  })

  it("says nothing when its open sessions are other tasks' or none", async () => {
    const view = page(
      viewOf([
        resting({ task: { id: 'C1:9.9', title: 'Another task' } }),
        resting({ id: 'claude:none', session: 'none', task: undefined }),
      ])
    )
    expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy()
    // Once the page has the sessions
    await waitFor(() => expect(view).toHaveBeenCalled())
    await new Promise((done) => setTimeout(done, 20))
    expect(
      screen.queryByText('This task has a session you have not closed')
    ).toBeNull()
  })
})
