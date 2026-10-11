/**
 * Pacenote's MCP server in the AI tools on this Mac (Claude Code, Codex): what
 * each one has registered, compared with how this app launches the server. The
 * desktop app runs the tools' own CLIs (apps/desktop/src/mcp-clients.ts); this
 * file only reads what they print.
 */
export const MCP_SERVER_NAME = 'pacenote'

export const MCP_CLIENT_IDS = ['claude', 'codex'] as const
export type McpClientId = (typeof MCP_CLIENT_IDS)[number]
export const MCP_CLIENT_NAMES: Record<McpClientId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

export function isMcpClientId(value: unknown): value is McpClientId {
  return MCP_CLIENT_IDS.includes(value as McpClientId)
}

/** How a tool launches an MCP server over stdio */
export interface McpLaunch {
  command: string
  args: string[]
  env: Record<string, string>
}

/**
 * - missing: the tool is not installed (not on the PATH)
 * - absent: Pacenote is not added to it
 * - elsewhere: added, but it launches another Pacenote (a moved app, a dev
 *   build)
 * - connected: added as this app, and the server answers
 * - failed: added as this app, but the server does not answer, or the tool's
 *   config could not be read
 */
export type McpClientState =
  'missing' | 'absent' | 'elsewhere' | 'connected' | 'failed'

export interface McpClientStatus {
  id: McpClientId
  name: string
  state: McpClientState
  /** What the tool launches instead, when it is not this app */
  command?: string
  /** Why it does not answer, or why the last change did not go through */
  error?: string
  /** The server's tools, when Pacenote asked the server itself */
  tools?: string[]
}

/**
 * The launch in `claude mcp get <name>`, and Claude Code's own check of it.
 * Claude prints the arguments joined with spaces, so they come back split on
 * spaces: compare them with sameLaunch, which joins them again.
 */
export function parseClaudeGet(
  output: string
): { launch: McpLaunch; connected: boolean; issue?: string } | undefined {
  const field = (name: string) =>
    new RegExp(`^\\s*${name}:[ \\t]*(.*)$`, 'm').exec(output)?.[1]?.trim()
  const command = field('Command')
  if (!command) return undefined
  const args = field('Args')
  const env: Record<string, string> = {}
  const lines = output.split('\n')
  const start = lines.findIndex((line) => /^\s*Environment:\s*$/.test(line))
  if (start >= 0)
    for (const line of lines.slice(start + 1)) {
      const entry = /^\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
      if (!entry) break
      env[entry[1]!] = entry[2]!
    }
  const status = field('Status') ?? ''
  const connected = /\bConnected\b/.test(status)
  return {
    launch: { command, args: args ? args.split(' ') : [], env },
    connected,
    issue: connected
      ? undefined
      : (field('Issue') ?? (status.replace(/^\W+/, '') || undefined)),
  }
}

/**
 * The server in `codex mcp get <name> --json`. A streamable HTTP server has no
 * launch; its URL is given instead.
 */
export function parseCodexGet(
  output: string
): { launch?: McpLaunch; url?: string; enabled: boolean } | undefined {
  let config: {
    enabled?: boolean
    transport?: {
      type?: string
      command?: string
      args?: string[] | null
      env?: Record<string, string> | null
      url?: string
    }
  }
  try {
    config = JSON.parse(output) as typeof config
  } catch {
    return undefined
  }
  const transport = config.transport
  if (!transport) return undefined
  const enabled = config.enabled !== false
  if (transport.type !== 'stdio' || !transport.command)
    return { url: transport.url, enabled }
  return {
    launch: {
      command: transport.command,
      args: transport.args ?? [],
      env: transport.env ?? {},
    },
    enabled,
  }
}

/** The tool launches this app's server: same binary, script and variables */
export function sameLaunch(registered: McpLaunch, ours: McpLaunch): boolean {
  return (
    registered.command === ours.command &&
    registered.args.join(' ') === ours.args.join(' ') &&
    Object.entries(ours.env).every(
      ([key, value]) => registered.env[key] === value
    )
  )
}
