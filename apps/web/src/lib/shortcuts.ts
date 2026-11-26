import { useEffect, useEffectEvent, useSyncExternalStore } from 'react'
import { isMac } from './platform'

/**
 * The app's keyboard shortcuts: ⌘ (Ctrl elsewhere) and a key, with Shift or
 * Option when they say so. A screen names the keys with useShortcut while it is
 * there, and a KeyHint where the control is shows them while you hold ⌘ by
 * itself (keysShown), as a list of what each key does on the screen you are
 * on.
 */
export interface Keys {
  /**
   * The key as keyOf names it: a letter or digit ("n", "1"), the character
   * the key carries without Shift ("[", ","), or a named key ("Enter",
   * "Backspace", "ArrowLeft")
   */
  key: string
  shift?: boolean
  alt?: boolean
}

/** Characters on keys outside the letters and digits, by the key's place */
const CODES: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Slash: '/',
}

/**
 * The key a press is for. A layout that types another character on it
 * (Hangul, an "&" on AZERTY's 1) or Shift turning "[" into "{" falls back to
 * the key's place, so ⌘N is ⌘N with a Korean input source on.
 */
export function keyOf(event: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const { key, code } = event
  // Named keys: Enter, Backspace, the arrows
  if (key.length > 1 && key !== 'Dead' && key !== 'Unidentified') return key
  const plain = key.toLowerCase()
  if (/^[a-z0-9[\],./]$/.test(plain)) return plain
  const letter = /^Key([A-Z])$/.exec(code)?.[1]
  if (letter) return letter.toLowerCase()
  const digit = /^Digit(\d)$/.exec(code)?.[1]
  if (digit) return digit
  return CODES[code] ?? plain
}

/** Whether a press is these keys: ⌘ (Ctrl elsewhere) and exactly the rest */
export function pressed(event: KeyboardEvent, keys: Keys): boolean {
  const command = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
  return (
    command &&
    event.shiftKey === Boolean(keys.shift) &&
    event.altKey === Boolean(keys.alt) &&
    keyOf(event) === keys.key
  )
}

/** How a named key is drawn */
const SYMBOLS: Record<string, string> = {
  Enter: '↩',
  Backspace: '⌫',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
}

const NAMES: Record<string, string> = {
  Enter: 'Enter',
  Backspace: 'Backspace',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
}

/** The keys as a Mac's menus write them (⌥⇧⌘N), or Ctrl+Shift+N elsewhere */
export function keysLabel(keys: Keys): string {
  if (isMac)
    return `${keys.alt ? '⌥' : ''}${keys.shift ? '⇧' : ''}⌘${SYMBOLS[keys.key] ?? keys.key.toUpperCase()}`
  return [
    'Ctrl',
    keys.alt && 'Alt',
    keys.shift && 'Shift',
    NAMES[keys.key] ?? keys.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join('+')
}

/** The keys for aria-keyshortcuts: Meta+Shift+N */
export function ariaKeys(keys: Keys): string {
  const key = {
    Enter: 'Enter',
    Backspace: 'Backspace',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ',': 'Comma',
    '[': 'BracketLeft',
    ']': 'BracketRight',
  }[keys.key]
  return [
    isMac ? 'Meta' : 'Control',
    keys.alt && 'Alt',
    keys.shift && 'Shift',
    key ?? keys.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join('+')
}

/** The shortcuts the app has, in one place so no two screens take one key */
export const KEYS = {
  /** The sidebar's sections, top to bottom: ⌘1 is Todo */
  section: (n: number): Keys => ({ key: String(n) }),
  settings: { key: ',' },
  back: { key: '[' },
  forward: { key: ']' },
  sidebar: { key: 'b' },
  search: { key: 'k' },
  newTask: { key: 'n' },
  newSession: { key: 'n', shift: true },
  /** The tab before or after the one you are on (Todo's, Recap's periods) */
  tabBefore: { key: '[', shift: true },
  tabAfter: { key: ']', shift: true },
  /** Recap's period before or after the one shown */
  periodBefore: { key: 'ArrowLeft' },
  periodAfter: { key: 'ArrowRight' },
  /** The open task: Done (Keep as a task in Maybe), Dismiss */
  taskDone: { key: 'Enter' },
  taskDismiss: { key: 'Backspace' },
} satisfies Record<string, Keys | ((n: number) => Keys)>

interface Entry {
  keys: Keys
  run: () => void
  typing: boolean
}

const entries = new Set<Entry>()

/** Where a press types text, so keys that edit it stay the field's */
const typingIn = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    Boolean(target.closest('input, textarea, select')))

/** A dialog or menu over the window: its keys are its own */
const layerOpen = () =>
  Boolean(
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"]'
    )
  )

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.repeat) return
  const typing = typingIn(event.target)
  // KEYS keeps the screens' keys apart, so one at most is there for a press
  const entry = [...entries].find(
    (each) => pressed(event, each.keys) && (each.typing || !typing)
  )
  if (!entry || layerOpen()) return
  event.preventDefault()
  held.used()
  entry.run()
}

/**
 * Runs `run` on the keys while the calling component is there and `when`
 * holds. Keys that edit text (Enter, Backspace, the arrows) leave a field being
 * typed in alone unless `typing` says otherwise; the others work from anywhere.
 */
export function useShortcut(
  keys: Keys,
  run: () => void,
  { when = true, typing }: { when?: boolean; typing?: boolean } = {}
) {
  const fire = useEffectEvent(run)
  const inText = typing ?? !(keys.key in SYMBOLS)
  const { key, shift, alt } = keys
  useEffect(() => {
    if (!when) return
    const entry: Entry = {
      keys: { key, shift, alt },
      run: () => fire(),
      typing: inText,
    }
    if (entries.size === 0) window.addEventListener('keydown', onKeyDown)
    entries.add(entry)
    return () => {
      entries.delete(entry)
      if (entries.size === 0) window.removeEventListener('keydown', onKeyDown)
    }
  }, [key, shift, alt, when, inText])
}

/** How long ⌘ is held by itself before the keys show */
export const HOLD_MS = 500

/**
 * Whether the keys show: ⌘ held by itself for HOLD_MS. A key pressed with it
 * (⌘C, a shortcut) or a click puts them away until ⌘ is let go, as does the
 * window losing focus (⌘Tab), which never tells ⌘'s release.
 */
const held = (() => {
  let shown = false
  let spent = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const set = (next: boolean) => {
    if (shown === next) return
    shown = next
    if (next) document.documentElement.dataset.keys = ''
    else delete document.documentElement.dataset.keys
    for (const listener of listeners) listener()
  }
  const reset = () => {
    clearTimeout(timer)
    timer = undefined
    spent = false
    set(false)
  }
  const used = () => {
    clearTimeout(timer)
    timer = undefined
    spent = true
    set(false)
  }
  /** Something else done while ⌘ is held: a key with it, a click */
  const meanwhile = () => {
    if (shown || timer) used()
  }
  const isCommand = (key: string) => key === (isMac ? 'Meta' : 'Control')
  const down = (event: KeyboardEvent) => {
    if (!isCommand(event.key)) return meanwhile()
    if (event.repeat || spent || shown || timer) return
    timer = setTimeout(() => {
      timer = undefined
      if (!layerOpen()) set(true)
    }, HOLD_MS)
  }
  const up = (event: KeyboardEvent) => {
    if (isCommand(event.key)) reset()
  }
  const start = () => {
    // Nothing was watched before: a shortcut since then says nothing of ⌘
    reset()
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('pointerdown', meanwhile, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('pointerdown', meanwhile, true)
      window.removeEventListener('blur', reset)
      reset()
    }
  }
  let stop: (() => void) | undefined
  return {
    used,
    subscribe(listener: () => void) {
      if (listeners.size === 0) stop = start()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop?.()
      }
    },
    shown: () => shown,
  }
})()

/**
 * Watches ⌘ for the keys to show while the calling component is there (the
 * window's). It marks the window's root (data-keys), which KeyHint and what
 * steps aside for it follow, so nothing renders again for it.
 */
export function useKeysWatch() {
  useEffect(() => held.subscribe(() => {}), [])
}

/** Whether the keys show now, for what has to know it as it renders */
export function useKeysShown(): boolean {
  return useSyncExternalStore(held.subscribe, held.shown, () => false)
}
