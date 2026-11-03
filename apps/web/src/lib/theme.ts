import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { readStored, writeStored } from './storage'

export type ThemeMode = 'system' | 'light' | 'dark'
const KEY = 'pacenote.theme'

/**
 * The accent colors, as Settings offers them: from green around the color
 * wheel, so each sits beside its neighbors and yellow comes back round to
 * green (their tokens: accents.css)
 */
export const ACCENTS = [
  'green',
  'blue',
  'purple',
  'pink',
  'red',
  'orange',
  'yellow',
] as const
export type Accent = (typeof ACCENTS)[number]
const ACCENT_KEY = 'pacenote.accent'

const readMode = (): ThemeMode => {
  const value = readStored(KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** Green unless another was picked; one this version does not know is green */
const readAccent = (): Accent =>
  ACCENTS.find((accent) => accent === readStored(ACCENT_KEY)) ?? 'green'

/**
 * The system's light or dark as the phone and iPad app says it when it comes
 * back in front (a pacenote:scheme event), where the web view's own
 * prefers-color-scheme can still say what it was before; a change the web
 * view sees itself after that takes over again
 */
let told: boolean | undefined

/**
 * Changes the window's colors all at once: it crossfades as one picture
 * where the web view has View Transitions, and no part eases its own colors
 * meanwhile (motion.css, theme), so nothing changes ahead of the rest. As the
 * window opens it just is what it is, with no fade.
 */
function recolor(change: (html: HTMLElement) => void, fade: boolean) {
  const html = document.documentElement
  const flip = () => {
    html.classList.add('motion-theme-switching')
    change(html)
    // Its new colors settle with no transition; transitions come back after
    void html.offsetWidth
    requestAnimationFrame(() => html.classList.remove('motion-theme-switching'))
  }
  if (
    fade &&
    document.visibilityState === 'visible' &&
    'startViewTransition' in document
  )
    document.startViewTransition(flip)
  else flip()
}

/** Light or dark */
function show(dark: boolean, fade: boolean) {
  if (document.documentElement.classList.contains('dark') === dark) return
  recolor((html) => html.classList.toggle('dark', dark), fade)
}

/** The accent: data-accent on the root, none for green */
function tint(accent: Accent, fade: boolean) {
  if ((document.documentElement.dataset.accent ?? 'green') === accent) return
  recolor((html) => {
    if (accent === 'green') delete html.dataset.accent
    else html.dataset.accent = accent
  }, fade)
}

const ThemeContext = createContext<
  | {
      mode: ThemeMode
      setMode: (mode: ThemeMode) => void
      accent: Accent
      setAccent: (accent: Accent) => void
    }
  | undefined
>(undefined)

/**
 * Applies the theme to the whole app: follows the system setting, and remembers
 * the choices made in Settings, light or dark and the accent, on this device.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readMode)
  const [accent, setAccent] = useState<Accent>(readAccent)
  // The first time, as the window opens, there is nothing to fade from
  const shown = useRef(false)
  const tinted = useRef(false)
  // Before the first paint, so the window never shows green first
  useLayoutEffect(() => {
    tint(accent, tinted.current)
    tinted.current = true
    writeStored(ACCENT_KEY, accent)
  }, [accent])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const system = told ?? media.matches
      const dark = mode === 'dark' || (mode === 'system' && system)
      show(dark, shown.current)
      shown.current = true
    }
    const changed = () => {
      told = undefined
      apply()
    }
    const heard = (event: Event) => {
      told = (event as Event & { dark?: unknown }).dark === true
      apply()
    }
    apply()
    // Even if saving fails, it still applies for this session.
    writeStored(KEY, mode)
    media.addEventListener('change', changed)
    window.addEventListener('pacenote:scheme', heard)
    // Back in front, it looks again
    document.addEventListener('visibilitychange', apply)
    return () => {
      media.removeEventListener('change', changed)
      window.removeEventListener('pacenote:scheme', heard)
      document.removeEventListener('visibilitychange', apply)
    }
  }, [mode])
  return createElement(
    ThemeContext.Provider,
    { value: { mode, setMode, accent, setAccent } },
    children
  )
}

/** The current theme choice and its setter. Use inside ThemeProvider. */
export function useTheme() {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('useTheme needs a ThemeProvider above it.')
  return theme
}
