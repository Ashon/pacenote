import type { SessionItem } from '@src/tasks/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/lib/i18n'
import { TalkItems } from './session-items'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const shown = (children: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  )

/** The desktop app as far as these read it: its language */
const desktop = {
  language: { initial: 'en', onChanged: () => () => undefined },
}

const items: SessionItem[] = [
  { role: 'user', text: 'Why is this red?', images: 2, ref: 'line-1' },
]

const talk = (session?: string) =>
  shown(
    <ol>
      <TalkItems
        items={items}
        tool="Claude Code"
        cwd="/Users/me/pay"
        session={session}
      />
    </ol>
  )

describe('the images sent with a turn of yours', () => {
  it('shows each from its log, and opens it large', async () => {
    const image = vi.fn(
      async (_id: string, _ref: string, index: number) =>
        `data:image/png;base64,${index ? 'REVG' : 'QUJD'}`
    )
    vi.stubGlobal('pacenoteDesktop', { ...desktop, sessions: { image } })
    talk('claude:s1')
    const first = await screen.findByRole('button', { name: 'Open image 1' })
    await screen.findByRole('button', { name: 'Open image 2' })
    expect(image).toHaveBeenCalledWith('claude:s1', 'line-1', 0)
    expect(image).toHaveBeenCalledWith('claude:s1', 'line-1', 1)
    fireEvent.click(first)
    expect(
      (await screen.findByRole('img', { name: 'Image 1' })).getAttribute('src')
    ).toBe('data:image/png;base64,QUJD')
  })

  it('says how many where they cannot be shown', () => {
    vi.stubGlobal('pacenoteDesktop', { ...desktop, sessions: {} })
    talk('claude:s1')
    expect(screen.getByText('2 images')).toBeTruthy()
    cleanup()
    talk()
    expect(screen.getByText('2 images')).toBeTruthy()
  })
})
