import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { localHistoryServer } from '../history/local-server.js'
import { loadSettings } from '../settings/load-settings.js'

/**
 * Pacenote's run history over MCP (stdio), for AI tools on this Mac
 * (history/local-server.ts). They launch it themselves; Settings adds it to
 * Claude Code and Codex (or shows the command), running this bundle with the
 * app's own Node (ELECTRON_RUN_AS_NODE=1), so no Node install is needed. In
 * the repository: pnpm mcp.
 * stdout carries the protocol; warnings go to stderr.
 */
loadSettings()
const server = await localHistoryServer()
await server.connect(new StdioServerTransport())
