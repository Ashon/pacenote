/** Whether this runs on a Mac, where shortcuts take ⌘ rather than Ctrl */
export const isMac = /Mac/.test(navigator.platform)

/** Whether a key press holds the shortcut key: ⌘ on a Mac, Ctrl elsewhere */
export const shortcutKeyHeld = (event: KeyboardEvent): boolean =>
  isMac ? event.metaKey : event.ctrlKey
