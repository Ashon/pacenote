import type { SessionRow } from '@src/sessions/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { AppWindow } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/lib/i18n'
import { PacenoteMark, PacenoteMonoMark } from './logo'
import { OpenButton } from './session-open'
import { ToolMark } from './tool-mark'

afterEach(cleanup)

const NOW = new Date().toISOString()

const row: SessionRow = {
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
}

const marks = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-tool-mark]')].map((mark) =>
    mark.getAttribute('data-tool-mark')
  )

describe("a tool's mark", () => {
  it("draws Claude's, OpenAI's and opencode's, and the fallback for a tool with none", () => {
    const { container } = render(
      <>
        <ToolMark tool="claude" />
        <ToolMark tool="codex" />
        <ToolMark tool="opencode" />
        <ToolMark tool="aider" />
        <ToolMark tool={undefined} fallback={AppWindow} />
      </>
    )
    expect(marks(container)).toEqual(['claude', 'codex', 'opencode'])
    // opencode's is two-tone: its frame, and the block in it drawn dimmer
    const opencode = container.querySelector('[data-tool-mark="opencode"]')
    expect(opencode?.querySelectorAll('path')).toHaveLength(2)
    expect(opencode?.querySelector('path[opacity]')).toBeTruthy()
    expect(container.querySelector('.lucide-square-terminal')).toBeTruthy()
    expect(container.querySelector('.lucide-app-window')).toBeTruthy()
    // An icon, not a name: the button or line beside it names the tool
    for (const svg of container.querySelectorAll('svg'))
      expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it("draws Pacenote's own mark in one color beside them, as theirs are", () => {
    const { container } = render(
      <>
        <PacenoteMonoMark />
        <PacenoteMark />
      </>
    )
    const [mono, mark] = container.querySelectorAll('svg')
    expect(mono?.getAttribute('data-tool-mark')).toBe('pacenote')
    expect(mono?.getAttribute('aria-hidden')).toBe('true')
    // The same ring and dot, in the color of what it is in, not the accent's
    const shapes = (svg?: Element) =>
      [...(svg?.querySelectorAll('path, circle') ?? [])].map((shape) => [
        shape.getAttribute('d') ?? shape.getAttribute('r'),
        shape.getAttribute('stroke') ?? shape.getAttribute('fill'),
      ])
    expect(shapes(mono).map(([geometry]) => geometry)).toEqual(
      shapes(mark).map(([geometry]) => geometry)
    )
    expect(shapes(mono).map(([, color]) => color)).toEqual([
      'currentColor',
      'currentColor',
    ])
  })

  it("marks a session's Open with its tool", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LanguageProvider>
          <OpenButton s={row} size="sm" />
        </LanguageProvider>
      </QueryClientProvider>
    )
    const open = screen.getByRole('link', { name: 'Open' })
    expect(marks(open)).toEqual(['codex'])
  })
})
