import type { McpClientId, McpClientStatus } from '@src/history/mcp-clients'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

const KEY = ['mcp-clients']

/**
 * Whether Claude Code and Codex have Pacenote's MCP server and reach it, from
 * the desktop app (none on the dev server). Checking launches the server, so it
 * runs when asked and on focus, not on an interval.
 */
export function useMcpClients() {
  const bridge = window.pacenoteDesktop?.mcp
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await bridge?.status()) ?? [],
    enabled: Boolean(bridge),
    staleTime: 30_000,
  })
}

/** Adds Pacenote to a tool or takes it out, and keeps the tool's new status */
export function useMcpChange() {
  const client = useQueryClient()
  const [busy, setBusy] = useState<McpClientId>()
  const change = async (id: McpClientId, action: 'connect' | 'disconnect') => {
    const bridge = window.pacenoteDesktop?.mcp
    if (!bridge) return
    setBusy(id)
    try {
      const status = await bridge[action](id)
      if (status)
        client.setQueryData<McpClientStatus[]>(KEY, (list) =>
          list?.map((item) => (item.id === id ? status : item))
        )
    } finally {
      setBusy(undefined)
    }
  }
  return { busy, change }
}
