import { KEYS, keysLabel, useShortcut, type Keys } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

/** Where the keys sit on their control, which is positioned (relative) */
const PLACES = {
  /** Over its bottom edge, centered, clear of its label: a button, a tab */
  below: 'top-full left-1/2 -translate-x-1/2 -translate-y-1/4',
  /** Inside its right end: a row of the sidebar */
  end: 'top-1/2 right-2 -translate-y-1/2',
  /** Just past its right edge: an icon by itself, which it leaves clear */
  side: 'top-1/2 left-full -translate-x-1.5 -translate-y-1/2',
} as const

/**
 * A shortcut's keys over its control, shown while you hold ⌘ (motion-key-hint
 * follows the window's data-keys, which useKeysWatch sets). Drawn as the
 * tooltip is, so it reads as something over the screen, not part of it; a
 * screen reader has the control's aria-keyshortcuts instead.
 */
export function KeyHint({
  keys,
  place = 'below',
  className,
}: {
  /** None: nothing shows (a tab no key leads to) */
  keys: Keys | undefined
  place?: keyof typeof PLACES
  className?: string
}) {
  if (!keys) return null
  return (
    <kbd
      aria-hidden="true"
      data-key-hint
      className={cn(
        'motion-key-hint pointer-events-none absolute z-30 rounded-[5px] bg-foreground px-1.5 font-sans text-caption leading-[17px] whitespace-nowrap text-background tabular-nums shadow-float',
        PLACES[place],
        className
      )}
    >
      {keysLabel(keys)}
    </kbd>
  )
}

/**
 * ⇧⌘[ and ⇧⌘] for the tabs on either side of the one you are on, as Safari's
 * tabs take them. It gives the keys that lead to a tab, for the KeyHint on it.
 */
export function useTabKeys<T extends string>(
  tabs: readonly T[],
  current: T,
  onTab: (tab: T) => void
): (tab: T) => Keys | undefined {
  const at = tabs.indexOf(current)
  const before = at > 0 ? tabs[at - 1] : undefined
  const after = at >= 0 ? tabs[at + 1] : undefined
  useShortcut(KEYS.tabBefore, () => before && onTab(before), {
    when: before !== undefined,
  })
  useShortcut(KEYS.tabAfter, () => after && onTab(after), {
    when: after !== undefined,
  })
  return (tab) =>
    tab === before ? KEYS.tabBefore : tab === after ? KEYS.tabAfter : undefined
}
