import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  createElement,
  Fragment,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { isLocale, pickLocale, setLocale, type Locale } from '@src/i18n/locale'

export type { Locale } from '@src/i18n/locale'

/** The app's language: macOS's (system), or one chosen in Settings */
export type LanguagePreference = 'system' | Locale

export interface LanguageState {
  preference: LanguagePreference
  /** The language the app is in now */
  locale: Locale
}

/** The dev server in a browser keeps the choice here */
const KEY = 'pacenote.language'

function browserLanguage(preference: LanguagePreference): LanguageState {
  return {
    preference,
    locale:
      preference === 'system' ? pickLocale(navigator.languages) : preference,
  }
}

/** The language at the first paint: the desktop app's, or the browser's */
function initialLanguage(): LanguageState {
  const desktop = window.pacenoteDesktop?.language.initial
  if (desktop && isLocale(desktop.locale)) return desktop
  try {
    const stored = localStorage.getItem(KEY)
    return browserLanguage(isLocale(stored) ? stored : 'system')
  } catch {
    return browserLanguage('system')
  }
}

function apply(state: LanguageState): LanguageState {
  setLocale(state.locale)
  document.documentElement.lang = state.locale
  return state
}

const LanguageContext = createContext<
  | (LanguageState & {
      setPreference: (preference: LanguagePreference) => Promise<void>
    })
  | undefined
>(undefined)

/**
 * Puts the app in its language. A change in Settings renders the app again
 * from the top in the new language (a screen keeps its place, as the route is
 * in the address), and asks the desktop app again for what it words itself,
 * such as setup issues.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => apply(initialLanguage()))
  const queryClient = useQueryClient()
  const setPreference = async (preference: LanguagePreference) => {
    const desktop = window.pacenoteDesktop?.language
    let next: LanguageState
    if (desktop) next = await desktop.set(preference)
    else {
      try {
        if (preference === 'system') localStorage.removeItem(KEY)
        else localStorage.setItem(KEY, preference)
      } catch {
        // Even if saving fails, it still applies for this session.
      }
      next = browserLanguage(preference)
    }
    setState(apply(next))
    void queryClient.invalidateQueries()
  }
  return createElement(
    LanguageContext.Provider,
    { value: { ...state, setPreference } },
    createElement(Fragment, { key: state.locale }, children)
  )
}

/** The language choice, the language it gives, and its setter */
export function useLanguage() {
  const language = useContext(LanguageContext)
  if (!language)
    throw new Error('useLanguage needs a LanguageProvider above it.')
  return language
}

/** The language the app is in now */
export function useLocale(): Locale {
  return useLanguage().locale
}

/**
 * A screen's messages in the app's language: const t = useText(text), with
 * text kept as { en, ko } beside the screen (docs/i18n.md). Code outside
 * components reads them with localized(text) from @src/i18n/locale.
 */
export function useText<T>(text: Record<Locale, T>): T {
  return text[useLocale()]
}
