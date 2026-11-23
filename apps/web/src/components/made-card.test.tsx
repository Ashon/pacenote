import type { MadeThing } from '@src/sessions/types'
import type { SessionItem } from '@src/tasks/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/lib/i18n'
import { MadeLine } from './made-card'
import { TalkItems } from './session-items'

afterEach(cleanup)

const shown = (children: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  )

const BOARD = 'https://claude.ai/artifact/SCpW1bK961hvQpa5yAWgST'
const board: MadeThing = {
  key: BOARD,
  kind: 'typed',
  title: 'Webhook retry storyboard',
  url: BOARD,
  typeName: 'Design',
  version: 3,
  times: 3,
  onlyYou: true,
}
const report: MadeThing = {
  key: '/Users/me/pay/out/failed-webhooks.html',
  kind: 'file',
  title: 'failed-webhooks.html',
  path: '/Users/me/pay/out/failed-webhooks.html',
  file: 'html',
  times: 1,
}

const items: SessionItem[] = [
  { role: 'user', text: 'Draw the retry settings' },
  { role: 'tool', name: 'Grep', text: 'max_attempts' },
  { role: 'tool', name: 'Artifact', text: 'quickstart' },
  { role: 'tool', name: 'Artifact', text: 'canvas.json', made: [BOARD] },
  { role: 'tool', name: 'Read', text: 'retry.ts' },
  { role: 'assistant', text: 'The report is ready.', made: [report.key] },
]

const talk = (props: Partial<Parameters<typeof TalkItems>[0]> = {}) =>
  shown(
    <ol>
      <TalkItems
        items={items}
        tool="Claude Code"
        cwd="/Users/me/pay"
        made={[board, report]}
        {...props}
      />
    </ol>
  )

describe('what a session made', () => {
  it('shows a card where it was published last, the steps on either side apart', () => {
    talk()
    expect(screen.getByText('Webhook retry storyboard')).toBeTruthy()
    expect(
      screen.getByText('Design on claude.ai · version 3, updated twice here')
    ).toBeTruthy()
    expect(screen.getAllByText('Only you')).toHaveLength(1)
    const open = screen.getByRole('link', {
      name: 'Open Webhook retry storyboard',
    })
    expect(open.getAttribute('href')).toBe(BOARD)
    expect(open.getAttribute('target')).toBe('_blank')
    // The steps before it are its own line, not folded with the one after
    expect(screen.getByText('max_attempts')).toBeTruthy()
    expect(screen.getByText('retry.ts')).toBeTruthy()
  })

  it('opens a file on the Mac the session runs on, its name alone elsewhere', () => {
    const open = vi.fn(() => Promise.resolve({}))
    talk({ open })
    expect(screen.getByText('HTML page on this Mac')).toBeTruthy()
    expect(screen.getByText('~/pay/out')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open failed-webhooks.html' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show in Finder' }))
    expect(open.mock.calls).toEqual([
      [report.key, 'open'],
      [report.key, 'show'],
    ])
    cleanup()
    talk()
    expect(screen.getByText('HTML page on your Mac')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Open failed-webhooks.html' })
    ).toBeNull()
  })

  it('lists them on a task, with a note to share them before a link goes out', () => {
    shown(<MadeLine made={[board, report]} askedBy="mina" />)
    expect(
      screen
        .getByRole('link', { name: 'Webhook retry storyboard' })
        .getAttribute('href')
    ).toBe(BOARD)
    expect(screen.getByText('failed-webhooks.html')).toBeTruthy()
    expect(
      screen.getByText(
        'Only you can open these. Share them on claude.ai before you send mina a link.'
      )
    ).toBeTruthy()
  })
})
