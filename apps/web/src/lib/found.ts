import type { FoundOnMac } from '@src/settings/found'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'

/**
 * Names on this Mac Settings > Tools offers to pick (src/settings/found.ts),
 * with the owners of the work folder's repositories as the screen has it.
 * Only in the desktop app, on the Mac itself: a device of yours never asks.
 * Looking runs gh and kubectl, so it runs when Tools opens a connection (once
 * a minute at most) and on Look again, not on an interval.
 */
export function useFound(workFolder: string, enabled = true) {
  const bridge = window.pacenoteDesktop?.settings
  // Look again asks the Mac afresh once; the next lookups may use what it kept.
  const fresh = useRef(false)
  const query = useQuery({
    queryKey: ['settings-found', workFolder],
    queryFn: async (): Promise<FoundOnMac> => {
      const again = fresh.current
      fresh.current = false
      return (
        (await bridge?.found(workFolder || undefined, again)) ?? {
          names: {},
          gaps: [],
        }
      )
    },
    enabled: Boolean(bridge) && enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })
  return {
    ...query,
    lookAgain: () => {
      fresh.current = true
      void query.refetch()
    },
  }
}
