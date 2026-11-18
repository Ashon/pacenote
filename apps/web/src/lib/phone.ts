import { useSyncExternalStore } from 'react'
import { remoteMac } from './desktop'

/** A phone's width: the app's tab bar below it, an iPad's rail from it */
const PHONE = '(max-width: 767px)'

const subscribe = (changed: () => void) => {
  const media = window.matchMedia?.(PHONE)
  media?.addEventListener('change', changed)
  return () => media?.removeEventListener('change', changed)
}

const onPhone = () =>
  remoteMac() !== undefined && Boolean(window.matchMedia?.(PHONE).matches)

/**
 * Whether these screens are on a phone (the iPhone and Android app): a list's
 * row then opens its own screen, as the phone's other lists do, and what the
 * phone's bar has (a section's New, a screen's More) is not here too. Never
 * in the desktop app, however narrow its window.
 */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, onPhone, () => false)
}
