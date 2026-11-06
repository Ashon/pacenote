import { homedir } from 'node:os'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { dataDirFor } from '../settings/home.js'
import { settingsFilePath } from '../settings/paths.js'
import { readSettingsValues } from '../settings/settings-file.js'
import { folderRepo } from '../tasks/folders.js'
import { readTasksSettings } from '../tasks/settings.js'
import { createHistoryServer } from './mcp.js'
import { HistoryReader } from './reader.js'

/**
 * The run history server an AI tool on this Mac launches (history-mcp.ts),
 * for its environment and the folder it works in:
 * - The history is the one the desktop app shows: PACENOTE_DATA_DIR, or the
 *   home (~/.pacenote).
 * - Sharing (HISTORY_SHARE) is read from the settings file on every call, so
 *   the switch in Settings applies without restarting the client. A value set
 *   in the environment at launch wins.
 * - The app launches it for its own collections and drafts with
 *   PACENOTE_MCP_FROM_APP=1, so the Todo screen shows their progress its own
 *   way rather than as another AI tool's.
 * - The folder's repository's open tasks go into the instructions.
 */
export async function localHistoryServer({
  env = process.env,
  cwd = process.cwd(),
  home = homedir(),
  settingsFile = settingsFilePath(env, home),
}: {
  env?: NodeJS.ProcessEnv
  cwd?: string
  home?: string
  settingsFile?: string
} = {}): Promise<McpServer> {
  const launched = env.HISTORY_SHARE
  const data = dataDirFor(env.PACENOTE_DATA_DIR, home)
  return createHistoryServer({
    reader: new HistoryReader(data),
    enabled: () =>
      (launched ?? readSettingsValues(settingsFile).HISTORY_SHARE) === 'on',
    version: env.PACENOTE_VERSION ?? 'dev',
    tasks: {
      dataDir: data,
      home,
      settings: () => readTasksSettings(env, settingsFile),
      app: env.PACENOTE_MCP_FROM_APP === '1',
      repo: await folderRepo(cwd),
    },
  })
}
