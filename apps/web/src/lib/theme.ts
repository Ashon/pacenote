import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { readStored, writeStored } from './storage'

export type ThemeMode = 'system' | 'light' | 'dark'
const KEY = 'pacenote.theme'

const readMode = (): ThemeMode => {
  const value = readStored(KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

/**
 * The system's light or dark as the phone and iPad app says it when it comes
 * back in front (a pacenote:scheme event), where the web view's own
 * prefers-color-scheme can still say what it was before; a change the web
 * view sees itself after that takes over again
 */
let told: boolean | undefined

/**
 * Puts the window in light or dark all at once: it crossfades as one picture
 * where the web view has View Transitions, and no part eases its own colors
 * meanwhile (motion.css, theme), so nothing changes ahead of the rest. As the
 * window opens it just is what it is, with no fade.
 */
function show(dark: boolean, fade: boolean) {
  const html = document.documentElement
  if (html.classList.contains('dark') === dark) return
  const flip = () => {
    html.classList.add('motion-theme-switching')
    html.classList.toggle('dark', dark)
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

const ThemeContext = createContext<
  { mode: ThemeMode; setMode: (mode: ThemeMode) => void } | undefined
>(undefined)

/**
 * Applies the theme to the whole app: follows the system setting, and remembers
 * the choice made in Settings.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readMode)
  // The first time, as the window opens, there is nothing to fade from
  const shown = useRef(false)
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
    { value: { mode, setMode } },
    children
  )
}

/** The current theme choice and its setter. Use inside ThemeProvider. */
export function useTheme() {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('useTheme needs a ThemeProvider above it.')
  return theme
}
