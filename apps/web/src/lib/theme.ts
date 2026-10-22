import {
  createContext,
  createElement,
  useContext,
  useEffect,
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

const ThemeContext = createContext<
  { mode: ThemeMode; setMode: (mode: ThemeMode) => void } | undefined
>(undefined)

/**
 * Applies the theme to the whole app: follows the system setting, and remembers
 * the choice made in Settings.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readMode)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    // Even if saving fails, it still applies for this session.
    writeStored(KEY, mode)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
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
