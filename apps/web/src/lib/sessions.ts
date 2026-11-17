import type { SessionsView } from '@src/sessions/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/**
 * The sessions on this Mac (src/sessions), from the desktop app. The screen
 * asks every few seconds, so a session that starts working or stops shows
 * soon; Todo, every ten; the sidebar's count, every half minute. Only the
 * screen asks while it is off, for its card.
 */
const EVERY = { screen: 5_000, todo: 10_000, sidebar: 30_000 } as const

export function useSessions(asker: keyof typeof EVERY = 'screen') {
  const bridge = window.pacenoteDesktop?.sessions
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
