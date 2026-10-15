import { homedir } from 'node:os'
import path from 'node:path'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createHistoryServer } from '../history/mcp.js'
import { HistoryReader } from '../history/reader.js'
import { defaultHome } from '../settings/home.js'
import { loadSettings } from '../settings/load-settings.js'
import { settingsFilePath } from '../settings/paths.js'
import { readSettingsValues } from '../settings/settings-file.js'
import { readTasksSettings } from '../tasks/settings.js'

/**
 * Pacenote's run history over MCP (stdio), for AI tools on this Mac. They
 * launch it themselves; Settings adds it to Claude Code and Codex (or shows
 * the command), running this bundle with the app's own Node
 * (ELECTRON_RUN_AS_NODE=1), so no Node install is needed. In the repository:
 * pnpm mcp.
 * - The history is the one the desktop app shows: PACENOTE_DATA_DIR, or the
 *   home (~/.pacenote).
 * - Sharing (HISTORY_SHARE) is read from the settings file on every call, so
 *   the switch in Settings applies without restarting the client. A value set
 *   in the environment at launch wins.
 * stdout carries the protocol; warnings go to stderr.
 */
const launched = process.env.HISTORY_SHARE
const settingsFile = settingsFilePath()
loadSettings()

const data = dataDir(process.env.PACENOTE_DATA_DIR)
const server = createHistoryServer({
  reader: new HistoryReader(data),
  enabled: () =>
    (launched ?? readSettingsValues(settingsFile).HISTORY_SHARE) === 'on',
  version: process.env.PACENOTE_VERSION ?? 'dev',
  tasks: {
    dataDir: data,
    home: homedir(),
    settings: () => readTasksSettings(process.env, settingsFile),
  },
})
await server.connect(new StdioServerTransport())

/** Same as the desktop app: the configured folder, or the home */
function dataDir(value: string | undefined): string {
  if (!value) return defaultHome()
  return path.resolve(
    value === '~' || value.startsWith('~/')
      ? path.join(homedir(), value.slice(1))
      : value
  )
}
