import type { TaskDecision } from '@src/tasks/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/** Your tasks, from the desktop app (none on the dev server) */
export function useTasks() {
  const bridge = window.pacenoteDesktop?.tasks
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => (await bridge?.list()) ?? null,
    enabled: Boolean(bridge),
    refetchInterval: 3_000,
  })
}

/** Records a decision on a task (or takes it back) and refreshes the list */
export function useDecide() {
  const client = useQueryClient()
  return async (id: string, decision: Omit<TaskDecision, 'at'> | null) => {
    await window.pacenoteDesktop?.tasks.decide(id, decision)
    await client.invalidateQueries({ queryKey: ['tasks'] })
  }
}
