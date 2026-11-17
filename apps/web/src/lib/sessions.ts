import type { SessionsView } from '@src/sessions/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/**
 * The sessions on this Mac (src/sessions), from the desktop app. The screen
 * asks every few seconds, so a session that starts working or stops shows
 * soon; the sidebar's count, every half minute, and not while it is off.
 */
export function useSessions(screen = true) {
  const bridge = window.pacenoteDesktop?.sessions
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async (): Promise<SessionsView | null> =>
      (await bridge?.view()) ?? null,
    enabled: Boolean(bridge),
    refetchInterval: (query) =>
      screen ? 5_000 : query.state.data?.on ? 30_000 : false,
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
  const view = useSessions(false).data
  return view?.on ? view.counts.turn : 0
}
