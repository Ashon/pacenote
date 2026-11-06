import type { DesktopBridge } from '@src/desktop-bridge'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LanguageProvider } from '@/lib/i18n'

/**
 * For the screens' tests (*.test.tsx): a desktop bridge that answers what a
 * test gives it, and a screen drawn as the app draws it, in English.
 */

/** The bridge's parts a screen may call, by the name it calls them */
const PARTS = [
  'ai',
  'bot',
  'diagnostics',
  'fullScreen',
  'hub',
  'landing',
  'loginItem',
  'macs',
  'mcp',
  'recap',
  'sandbox',
  'servers',
  'settings',
  'setup',
  'tasks',
  'updates',
  'you',
] as const

type Part = (typeof PARTS)[number]

/** What a test gives a part of the bridge: some of its calls */
export type Given = { [P in Part]?: Partial<DesktopBridge[P]> }

/**
 * A part of the bridge with the calls given; every other call answers null,
 * and one that listens (onChanged, onJob...) hears nothing
 */
function part(given: object = {}): object {
  return new Proxy(given, {
    get(target, key) {
      if (key in target) return Reflect.get(target, key)
      if (typeof key !== 'string') return undefined
      return /^on[A-Z]/.test(key) ? () => () => {} : async () => null
    },
  })
}

/** Puts a bridge with these calls on window, as the app's preload does */
export function stubDesktop(given: Given = {}): DesktopBridge {
  const bridge = {
    platform: 'darwin',
    language: part({ initial: { preference: 'en', locale: 'en' } }),
    ...Object.fromEntries(PARTS.map((name) => [name, part(given[name])])),
  } as unknown as DesktopBridge
  window.pacenoteDesktop = bridge
  return bridge
}

/** Takes the bridge away again, as in a browser */
export function unstubDesktop() {
  delete window.pacenoteDesktop
}

/**
 * Draws a screen with what the app puts around it: queries and language. The
 * queries' client asks the bridge again when a test says the data changed.
 */
export function renderScreen(screen: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rendered = render(
    <QueryClientProvider client={client}>
      <LanguageProvider>{screen}</LanguageProvider>
    </QueryClientProvider>
  )
  return { ...rendered, client }
}
