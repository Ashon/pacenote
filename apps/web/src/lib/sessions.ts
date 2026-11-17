import type {
  SessionMode,
  SessionsView,
  SessionTalk,
} from '@src/sessions/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * The sessions on this Mac (src/sessions), from the desktop app. The screen
 * asks every few seconds, so a session that starts working or stops shows
 * soon; Todo, every ten; the sidebar's count, every half minute. Only the
 * screen asks while it is off, for its card.
 */
const EVERY = { screen: 5_000, todo: 10_000, sidebar: 30_000 } as const
/** How long after a session Pacenote runs changes the list reads again */
const CHANGED_MS = 1_500
/** A session's page: while it works or is open elsewhere, and otherwise */
const TALK_BUSY_MS = 2_000
const TALK_MS = 5_000

export function useSessions(asker: keyof typeof EVERY = 'screen') {
  const bridge = window.pacenoteDesktop?.sessions
  const client = useQueryClient()
  // A session Pacenote runs works, stops or asks: the list soon after
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = bridge?.onChanged(() => {
      clearTimeout(timer)
      timer = setTimeout(
        () => void client.invalidateQueries({ queryKey: ['sessions'] }),
        CHANGED_MS
      )
    })
    return () => {
      clearTimeout(timer)
      stop?.()
    }
  }, [bridge, client])
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async (): Promise<SessionsView | null> =>
      (await bridge?.view()) ?? null,
    enabled: Boolean(bridge),
    refetchInterval: (query) =>
      asker === 'screen' || query.state.data?.on ? EVERY[asker] : false,
  })
}

/** Turns Sessions on (Settings > Todo > Sessions on this Mac) */
export function useShowSessions() {
  const client = useQueryClient()
  return async () => {
    await window.pacenoteDesktop?.settings.save({ TASKS_LINK_SESSIONS: 'on' })
    await client.invalidateQueries({ queryKey: ['sessions'] })
  }
}

/** Your turn, beside Sessions in the sidebar: none while it is off */
export function useSessionsTurn(): number {
  const view = useSessions('sidebar').data
  return view?.on ? view.counts.turn : 0
}

/**
 * What a session's row does with tasks: link it to one, take it off, make
 * a task of it, or answer the task it looks like. Each says what went wrong,
 * or nothing, and refreshes the sessions and the tasks after.
 */
export function useSessionTasks() {
  const client = useQueryClient()
  const bridge = window.pacenoteDesktop
  const after = async <T extends { error?: string }>(
    done: Promise<T | undefined> | undefined
  ): Promise<T | Record<string, never>> => {
    const result = (await done) ?? {}
    await Promise.all(
      ['sessions', 'tasks', 'task'].map((key) =>
        client.invalidateQueries({ queryKey: [key] })
      )
    )
    return result
  }
  return {
    link: async (id: string, task: string) =>
      (await after(bridge?.sessions.link(id, task))).error,
    unlink: async (id: string) =>
      (await after(bridge?.sessions.unlink(id))).error,
    makeTask: (id: string) => after(bridge?.sessions.makeTask(id)),
    /** The task it looks like: it is that task's work, or it is not */
    answer: async (suggestion: string, yes: boolean) =>
      void (await after(
        bridge?.tasks.answerSuggestion(suggestion, yes).then(() => ({}))
      )),
  }
}

/**
 * A session's page (#/sessions/<id>): its conversation and how Pacenote runs
 * it, read again at once when Pacenote's run of it changes, and every few
 * seconds besides, sooner while it works
 */
export function useSessionTalk(id: string) {
  const bridge = window.pacenoteDesktop?.sessions
  const client = useQueryClient()
  useEffect(
    () =>
      bridge?.onChanged((changed) => {
        if (changed === id)
          void client.invalidateQueries({ queryKey: ['session', id] })
      }),
    [bridge, client, id]
  )
  return useQuery({
    queryKey: ['session', id],
    queryFn: async (): Promise<SessionTalk | null> =>
      (await bridge?.talk(id)) ?? null,
    enabled: Boolean(bridge),
    refetchInterval: (query) => {
      const talk = query.state.data
      return talk?.live?.busy ||
        talk?.row.state === 'working' ||
        talk?.typeIn === 'elsewhere'
        ? TALK_BUSY_MS
        : TALK_MS
    },
  })
}

/**
 * What its page does with a session: send it what you typed, continue it in a
 * copy, answer what it asks, stop its turn, end its run here, change how it
 * asks. Each says what went wrong, or nothing, and reads it again after.
 */
export function useSessionActions(id: string) {
  const client = useQueryClient()
  const bridge = window.pacenoteDesktop?.sessions
  const after = async <T extends { error?: string }>(
    done: Promise<T> | undefined
  ): Promise<T | Record<string, never>> => {
    const result = (await done) ?? {}
    await client.invalidateQueries({ queryKey: ['session', id] })
    void client.invalidateQueries({ queryKey: ['sessions'] })
    return result
  }
  return {
    send: async (message: string) =>
      (await after(bridge?.send(id, message))).error,
    copy: (message: string) => after(bridge?.copy(id, message)),
    answer: async (
      ask: string,
      answer: 'allow' | 'always' | 'deny',
      message?: string
    ) => (await after(bridge?.answer(id, ask, answer, message))).error,
    stop: async () => (await after(bridge?.stop(id))).error,
    end: async () => (await after(bridge?.end(id))).error,
    mode: async (mode: SessionMode) =>
      (await after(bridge?.mode(id, mode))).error,
  }
}
