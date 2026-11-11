import type {
  K8sAccount,
  K8sConnected,
  K8sContextCheck,
} from '@src/sandbox/k8s-account'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'

const bridge = () => window.pacenoteDesktop?.settings.k8s

/**
 * Settings > Tools > Kubernetes' steps, asked of this Mac's kubectl
 * (apps/desktop/src/k8s-setup.ts): each context's read-only account, as the
 * screen has the settings, saved or not; making one; and what Pace's broker
 * reads with. Only in the desktop app, on the Mac itself. kubectl may reach
 * a cluster far away, so the screen asks when the connection opens and on
 * Check again, not on an interval.
 */
export function useK8sAccounts(
  contexts: string[],
  account: K8sAccount,
  enabled = true
) {
  const client = useQueryClient()
  const key = [
    'k8s-accounts',
    contexts.join(','),
    account.serviceAccount,
    account.namespace,
  ]
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<K8sContextCheck[]> =>
      (await bridge()?.check(contexts, account)) ?? [],
    enabled: Boolean(bridge()) && enabled && contexts.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })
  /** The context an account is being made in now */
  const [making, setMaking] = useState<string>()
  const create = async (context: string) => {
    const make = bridge()?.create
    if (!make) return
    setMaking(context)
    try {
      const made = await make(context, account)
      // That context's line, from the look after making it
      client.setQueryData<K8sContextCheck[]>(key, (checks) =>
        (checks ?? []).map((each) => (each.context === context ? made : each))
      )
    } finally {
      setMaking(undefined)
    }
  }
  const checks = contexts.length > 0 ? (query.data ?? []) : []
  return {
    checks,
    checking: query.isFetching,
    checkAgain: () => void query.refetch(),
    making,
    create,
  }
}

/** What Pace's broker reads each cluster with, asked with its own tokens */
export function useK8sConnected(enabled = true) {
  const query = useQuery({
    queryKey: ['k8s-connected'],
    queryFn: async (): Promise<K8sConnected> =>
      (await bridge()?.connected()) ?? { contexts: [] },
    enabled: Boolean(bridge()) && enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })
  return {
    connected: query.data,
    checking: query.isFetching,
    checkAgain: () => void query.refetch(),
  }
}
