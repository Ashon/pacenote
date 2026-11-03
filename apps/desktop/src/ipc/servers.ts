import { localized } from '../../../../src/i18n/locale.js'
import { checkServer } from '../../../../src/pace/mcp-relay.js'
import {
  foundMcpServers,
  readMcpServers,
  removeMcpServer,
  saveMcpServer,
  viewMcpServers,
  type McpServerDraft,
  type McpServerSetting,
} from '../../../../src/settings/mcp-servers.js'
import { text } from '../main.text.js'
import type { Ipc } from './gate.js'

/**
 * Settings > Tools > MCP servers: the servers Pace may use, added by hand or
 * from Claude Code's and Codex's settings, and a check of what each has. The
 * window's alone, as they act with your keys: its screen sees each header by
 * name, never its value, and sends a value only to set it.
 */
export function registerServersIpc(
  ipc: Ipc,
  { file, version }: { file: string; version: string }
): void {
  const denied = () => ({ error: localized(text).notAllowed })
  ipc.windowOnly('pacenote:servers:list', denied, () => {
    const servers = readMcpServers(file)
    return {
      servers: viewMcpServers(servers),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      found: foundMcpServers(servers).map(({ values, ...found }) => found),
    }
  })
  ipc.windowOnly('pacenote:servers:save', denied, (draft, previous) => ({
    issues: saveMcpServer(
      file,
      asDraft(draft),
      typeof previous === 'string' ? previous : undefined
    ),
  }))
  // One found in an AI tool's settings, with what it has there and the
  // headers filled in here
  ipc.windowOnly('pacenote:servers:add-found', denied, (url, name, headers) => {
    const found = foundMcpServers(readMcpServers(file)).find(
      (each) => each.url === url
    )
    if (!found) return { issues: ['notFound'] }
    return {
      issues: saveMcpServer(file, {
        name: typeof name === 'string' ? name : found.name,
        url: found.url,
        headers: { ...found.values, ...strings(headers) },
        ...(found.transport ? { transport: found.transport } : {}),
        read: true,
        write: false,
        from: found.from,
      }),
    }
  })
  ipc.windowOnly('pacenote:servers:remove', denied, (name) => {
    if (typeof name === 'string') removeMcpServer(file, name)
  })
  // A server as it is being edited, its kept headers from the file
  ipc.windowOnly('pacenote:servers:check', denied, (draft, previous) => {
    const edited = asDraft(draft)
    const was = readMcpServers(file).find((each) => each.name === previous)
    const server: McpServerSetting = {
      ...edited,
      headers: Object.fromEntries(
        Object.entries(edited.headers).flatMap(([header, value]) => {
          const kept = value ?? was?.headers[header]
          return kept === undefined ? [] : [[header, kept]]
        })
      ),
    }
    return checkServer(server, version)
  })
}

/** What the screen sent, as a draft: strings where strings go */
function asDraft(value: unknown): McpServerDraft {
  const draft = (value ?? {}) as Partial<McpServerDraft>
  const headers = Object.fromEntries(
    Object.entries(draft.headers ?? {}).filter(
      (entry): entry is [string, string | null] =>
        typeof entry[1] === 'string' || entry[1] === null
    )
  )
  return {
    name: String(draft.name ?? '').trim(),
    url: String(draft.url ?? '').trim(),
    headers,
    ...(draft.transport === 'sse' || draft.transport === 'http'
      ? { transport: draft.transport }
      : {}),
    read: draft.read === true,
    write: draft.write === true,
    ...(draft.from &&
    (draft.from.cli === 'claude' || draft.from.cli === 'codex')
      ? { from: draft.from }
      : {}),
  }
}

function strings(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries((value ?? {}) as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
}
