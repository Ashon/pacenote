import path from 'node:path'
import {
  applyEdits,
  findNodeAtLocation,
  modify,
  parse,
  parseTree,
  type ParseError,
} from 'jsonc-parser'
import { MCP_SERVER_NAME, type McpLaunch } from './mcp-clients.js'

/**
 * Pacenote's MCP server in opencode's global config. opencode's CLI adds it
 * (`opencode mcp add --global`) but cannot take one out, so the desktop app
 * reads the file here and takes it out itself, as JSON with comments: the
 * comments and the rest of the file stay as they were.
 */

/**
 * The global config opencode uses: opencode.jsonc or opencode.json in
 * $XDG_CONFIG_HOME/opencode, else ~/.config/opencode. The first that exists;
 * opencode.json when neither does, as opencode writes then.
 */
export function opencodeConfigFiles(
  env: NodeJS.ProcessEnv,
  home: string
): string[] {
  const dir = path.join(
    env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config'),
    'opencode'
  )
  return ['opencode.jsonc', 'opencode.json'].map((name) => path.join(dir, name))
}

/** Where the server is in the file: opencode 2's mcp.servers, or mcp itself */
const PLACES = [
  ['mcp', 'servers', MCP_SERVER_NAME],
  ['mcp', MCP_SERVER_NAME],
]

function at(root: unknown, keys: string[]): unknown {
  let node = root
  for (const key of keys) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

/**
 * The server in the file: its launch for a local one, its URL for a remote
 * one, and whether it is on. undefined when it is not there or the file is
 * not readable.
 */
export function parseOpencodeConfig(
  text: string
): { launch?: McpLaunch; url?: string; enabled: boolean } | undefined {
  const errors: ParseError[] = []
  const root: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length > 0) return undefined
  const server = PLACES.map((keys) => at(root, keys)).find(
    (value) => typeof value === 'object' && value !== null
  ) as
    | {
        type?: string
        command?: unknown
        environment?: Record<string, string>
        url?: string
        enabled?: boolean
      }
    | undefined
  if (!server) return undefined
  const enabled = server.enabled !== false
  const command = Array.isArray(server.command)
    ? server.command.map(String)
    : []
  if (server.type === 'remote' || command.length === 0)
    return { url: server.url, enabled }
  return {
    launch: {
      command: command[0]!,
      args: command.slice(1),
      env: server.environment ?? {},
    },
    enabled,
  }
}

/** The file's text without the server, wherever it was in it */
export function opencodeWithout(text: string): string {
  let next = text
  for (const keys of PLACES) {
    const tree = parseTree(next)
    if (!tree || !findNodeAtLocation(tree, keys)) continue
    next = applyEdits(
      next,
      modify(next, keys, undefined, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      })
    )
  }
  return next
}
