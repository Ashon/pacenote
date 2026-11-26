import { useSyncExternalStore } from 'react'

/**
 * New task asked for from anywhere (⌘N): Todo opens its form when it is there,
 * at once or once the window has moved to it.
 */
let asked = false
const listeners = new Set<() => void>()

function set(next: boolean) {
  asked = next
  for (const listener of listeners) listener()
}

export const askNewTask = () => set(true)

/** The form opened for it */
export const clearNewTask = () => set(false)

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useNewTaskAsked(): boolean {
  return useSyncExternalStore(subscribe, () => asked)
}
