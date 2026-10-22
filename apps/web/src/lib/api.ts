import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type {
  HistoryRecord,
  RunKind,
  RunStats,
  RunStatus,
  RunSummary,
} from '@history/types'
import type { BotStatusView, LogLine } from '@runtime/types'

/**
 * The desktop app serves pacenote://app/api; on the dev server, Vite middleware
 * answers on the same path.
 */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return (await res.json()) as T
}

export const artifactUrl = (id: string, file: string) =>
  `/api/runs/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(file)}`

export interface RunFilter {
  kind?: RunKind
  status?: RunStatus
  q?: string
}

export function useRuns(filter: RunFilter) {
  const params = new URLSearchParams()
  if (filter.kind) params.set('kind', filter.kind)
  if (filter.status) params.set('status', filter.status)
  if (filter.q?.trim()) params.set('q', filter.q.trim())
  return useQuery({
    queryKey: [
      'runs',
      filter.kind ?? '',
      filter.status ?? '',
      filter.q?.trim() ?? '',
    ],
    queryFn: () => getJson<RunSummary[]>(`/api/runs?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: 3_000,
  })
}

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: ['run', id],
    queryFn: () =>
      getJson<HistoryRecord>(`/api/runs/${encodeURIComponent(id!)}`),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 1_500 : false,
  })
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => getJson<RunStats>('/api/stats'),
    refetchInterval: 10_000,
  })
}

export function useBotStatus() {
  return useQuery({
    queryKey: ['bot'],
    queryFn: () => getJson<BotStatusView>('/api/bot'),
    refetchInterval: 2_000,
  })
}

/** Pace's log, its last lines */
export function useBotLogs(lines: number) {
  const params = new URLSearchParams({ lines: String(lines) })
  return useQuery({
    queryKey: ['bot-logs', params.toString()],
    queryFn: () => getJson<LogLine[]>(`/api/bot/logs?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: 2_000,
  })
}
