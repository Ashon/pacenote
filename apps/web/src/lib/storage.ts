/**
 * What this browser remembers between visits. Storage can be unavailable
 * (private windows, blocked site data), so a read gives null and a write is
 * left out quietly.
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Stores a value, writing only when it is not there already */
export function writeStored(key: string, value: string) {
  try {
    if (localStorage.getItem(key) !== value) localStorage.setItem(key, value)
  } catch {
    // Not remembered this time.
  }
}
