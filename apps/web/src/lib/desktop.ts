import type {
  LoginItemState,
  SupervisorState,
  UpdateState,
} from '@runtime/types'
import type {
  SandboxJob,
  SandboxJobKind,
  SandboxStatus,
} from '@src/sandbox/types'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/** Where a desktop value comes from: a read, and its change events */
interface Feed<T> {
  read: () => Promise<T | null>
  onChange: (listener: (value: T) => void) => () => void
}

/**
 * A value the desktop app holds and sends as it changes, shared by every
 * component that shows it (useDesktopValue): read once and listened to once
 * while any of them is on screen, and forgotten when the last one goes.
 * No feed outside the app.
 */
export function desktopValue<T>(feed: () => Feed<T> | undefined) {
  let value: T | undefined
  let stop: (() => void) | undefined
  /** Which time it is listened to: a read from an earlier time is let go */
  let session = 0
  const listeners = new Set<() => void>()
  const set = (next: T) => {
    value = next
    for (const listener of listeners) listener()
  }
  const start = () => {
    const source = feed()
    if (!source) return
    const current = ++session
    void source.read().then((read) => {
      if (read != null && current === session) set(read)
    })
    stop = source.onChange(set)
  }
  const end = () => {
    session += 1
    stop?.()
    stop = undefined
    value = undefined
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    if (!stop) start()
    return () => {
      listeners.delete(listener)
      // A screen taking another's place subscribes in the same commit, so
      // the value carries over instead of being read again.
      queueMicrotask(() => {
        if (listeners.size === 0) end()
      })
    }
  }
  return { subscribe, get: () => value }
}

export const useDesktopValue = <T>(store: ReturnType<typeof desktopValue<T>>) =>
  useSyncExternalStore(store.subscribe, store.get)

const supervisor = desktopValue(() => {
  const bridge = window.pacenoteDesktop?.bot
  return bridge && { read: () => bridge.state(), onChange: bridge.onChange }
})

/**
 * Bot process state managed by the desktop app. undefined in the browser (dev
 * server)
 */
export function useSupervisor(): SupervisorState | undefined {
  return useDesktopValue(supervisor)
}

export const botControl = () => window.pacenoteDesktop?.bot

/**
 * On a device of yours (the iPhone, iPad and Android app), the Mac these
 * screens are that Mac's for: what stays on it (secrets, sign-ins, its
 * folders, Finder, a run's prompt) these screens leave out, or show as being
 * there. undefined in the desktop app.
 */
export const remoteMac = (): string | undefined =>
  window.pacenoteDesktop?.remote?.mac

const update = desktopValue(() => {
  const bridge = window.pacenoteDesktop?.updates
  return bridge && { read: () => bridge.state(), onChange: bridge.onChange }
})

/** What the app knows about a newer Pacenote. undefined outside the app */
export function useUpdate(): UpdateState | undefined {
  return useDesktopValue(update)
}

/**
 * Whether the app opens when you log in. Read again when the window comes back,
 * since System Settings can change it too.
 */
export function useLoginItem() {
  const bridge = window.pacenoteDesktop?.loginItem
  const [state, setState] = useState<LoginItemState>()
  useEffect(() => {
    if (!bridge) return
    const read = () =>
      void bridge.get().then((value) => value && setState(value))
    read()
    window.addEventListener('focus', read)
    return () => window.removeEventListener('focus', read)
  }, [bridge])
  const set = (on: boolean) =>
    void bridge?.set(on).then((value) => value && setState(value))
  return {
    state,
    set,
    openSystemSettings: () => void bridge?.openSystemSettings(),
  }
}

/** Sandbox status and apply jobs. Reloads the status when a job finishes. */
export function useSandbox() {
  const bridge = window.pacenoteDesktop?.sandbox
  const [status, setStatus] = useState<SandboxStatus>()
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState<SandboxJob>()
  /** Why the last job could not start, beside that job's button */
  const [error, setError] = useState<{
    kind: SandboxJobKind
    message: string
  }>()

  const refresh = useCallback(() => {
    if (!bridge) return
    setLoading(true)
    void bridge
      .status()
      .then((value) => value && setStatus(value))
      .finally(() => setLoading(false))
  }, [bridge])

  useEffect(() => {
    if (!bridge) return
    refresh()
    void bridge.job().then((value) => value && setJob(value))
    return bridge.onJob((next) => {
      setJob(next)
      if (next.state !== 'running') refresh()
    })
  }, [bridge, refresh])

  const run = (kind: SandboxJobKind) => {
    setError(undefined)
    void bridge?.run(kind).then((result) => {
      if (result.error) setError({ kind, message: result.error })
      else if (result.job) setJob(result.job)
    })
  }

  return {
    available: Boolean(bridge),
    status,
    loading,
    refresh,
    job,
    run,
    error,
  }
}
