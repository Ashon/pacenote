import type { SessionRow, SessionTalk } from '@src/sessions/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LanguageProvider } from '@/lib/i18n'
import { closable, SessionEnd, WrapUpDialog } from './session-wrap'

const NOW = new Date().toISOString()

const row = (extra: Partial<SessionRow> = {}): SessionRow => ({
  id: 'codex:t1',
  tool: 'codex',
  session: 't1',
  title: 'Fix the retry',
  where: 'pacenote',
  state: 'quiet',
  lastAt: NOW,
  startedAt: NOW,
  cwd: '/Users/me/git/payments',
  typed: [],
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

afterEach(() => {
  cleanup()
  delete (window as { pacenoteDesktop?: unknown }).pacenoteDesktop
})

describe('closing a session', () => {
  it('is for one Pacenote runs or a Codex one its log shows open', () => {
    expect(closable(row())).toBe(true)
    expect(closable(row({ tool: 'claude', where: 'pacenote' }))).toBe(true)
    expect(closable(row({ where: 'codex-app' }))).toBe(true)
    expect(closable(row({ tool: 'claude', where: 'claude-app' }))).toBe(false)
    expect(closable(row({ state: 'ended' }))).toBe(false)
  })

  it("shows Close and Wrap up on the Mac, for an open task's session", async () => {
    const close = vi.fn(async () => ({}))
    window.pacenoteDesktop = {
      language: {},
      sessions: { close, wrapDraft: vi.fn(), wrapUp: vi.fn() },
    } as unknown as typeof window.pacenoteDesktop
    const talk = (extra: Partial<SessionRow>) =>
      ({ row: row(extra), items: [], typeIn: 'here' }) as SessionTalk
    const { rerender } = inPage(
      <SessionEnd talk={talk({ task: { id: 'k1', title: 'Retry limit' } })} />
    )
    expect(screen.getByRole('button', { name: 'Wrap up' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(close).toHaveBeenCalledWith('codex:t1'))
    // Its task closed already, and the session ended: neither
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <LanguageProvider>
          <SessionEnd
            talk={talk({
              state: 'ended',
              task: { id: 'k1', title: 'Retry limit', closed: true },
            })}
          />
        </LanguageProvider>
      </QueryClientProvider>
    )
    expect(screen.queryByRole('button', { name: 'Wrap up' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('shows neither on a device, which has no Close', () => {
    window.pacenoteDesktop = {
      language: {},
      sessions: {},
    } as unknown as typeof window.pacenoteDesktop
    inPage(
      <SessionEnd
        talk={
          {
            row: row({ task: { id: 'k1', title: 'Retry limit' } }),
            items: [],
            typeIn: 'here',
          } as SessionTalk
        }
      />
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Wrap up', () => {
  it("starts from your AI's draft, keeps what you check, and closes the session too", async () => {
    const onWrapUp = vi.fn(async () => undefined)
    const onClose = vi.fn()
    inPage(
      <WrapUpDialog
        task="Retry limit"
        closable
        open
        onClose={onClose}
        onDraft={async () => ({
          done: false,
          summary: 'Raised the limit to 5.',
          left: ['Tell hyun', 'Watch it a day'],
          by: 'Codex',
        })}
        onWrapUp={onWrapUp}
      />
    )
    const note = await screen.findByDisplayValue('Raised the limit to 5.')
    expect(screen.getByText('What was done, as Codex read it')).toBeTruthy()
    expect(screen.getByText(/does not read as finished/)).toBeTruthy()
    fireEvent.change(note, { target: { value: 'Raised it to 5.' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Watch it a day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Wrap up' }))
    await waitFor(() =>
      expect(onWrapUp).toHaveBeenCalledWith({
        summary: 'Raised it to 5.',
        keep: ['Tell hyun'],
        close: true,
      })
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('says why your AI could not write it, and wraps up with what you write', async () => {
    const onWrapUp = vi.fn(async () => undefined)
    inPage(
      <WrapUpDialog
        task="Retry limit"
        closable={false}
        open
        onClose={() => {}}
        onDraft={async () => ({
          error: 'Your AI could not write how it ended.',
        })}
        onWrapUp={onWrapUp}
      />
    )
    expect(
      await screen.findByText('Your AI could not write how it ended.')
    ).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Fixed by hand.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Wrap up' }))
    await waitFor(() =>
      expect(onWrapUp).toHaveBeenCalledWith({
        summary: 'Fixed by hand.',
        keep: [],
        close: false,
      })
    )
  })
})
