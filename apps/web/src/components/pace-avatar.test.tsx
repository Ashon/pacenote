import type { SessionItem } from '@src/tasks/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/lib/i18n'
import { PaceAvatar } from './pace-avatar'
import { NowItem, TalkItems } from './session-items'

afterEach(cleanup)

const shown = (children: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  )

const badges = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-engine]')].map((badge) =>
    badge.getAttribute('data-engine')
  )

const items: SessionItem[] = [
  { role: 'user', text: 'Fix the flaky retry test' },
  { role: 'assistant', text: 'It waits on a real clock.' },
]

describe("Pace's avatar", () => {
  it('names the tool and its model, to a screen reader where asked', () => {
    shown(<PaceAvatar engine="claude" model="claude-opus-5-5" label />)
    const badge = screen.getByRole('img', { name: 'Claude Code · Opus 5.5' })
    expect(badge.getAttribute('data-engine')).toBe('claude')
    expect(badge.parentElement?.title).toBe('Claude Code · Opus 5.5')
  })

  it('has no circle for a tool with no mark', () => {
    const { container } = shown(<PaceAvatar engine="opencode" />)
    expect(badges(container)).toEqual([])
    expect(container.querySelector('[title]')).toBeNull()
  })

  it("marks a session's answers, not your turns, with its tool", () => {
    const { container } = shown(
      <ol>
        <TalkItems items={items} tool="Codex" engine="codex" cwd="/x" />
        <NowItem
          live={{ busy: true, doing: 'writing', since: '2026-11-24T05:00:00Z' }}
          draft="Switching it to"
          tool="Codex"
          engine="codex"
          cwd="/x"
        />
      </ol>
    )
    expect(badges(container)).toEqual(['codex', 'codex'])
    // Your turn keeps your initial; the name is over the answer
    expect(screen.getByText('Y')).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'Codex' })).toBeNull()
    expect(container.querySelector('.pace-spinner')).toBeTruthy()
  })
})
