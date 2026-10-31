import { shell } from 'electron'
import { isMcpClientId } from '../../../../src/history/mcp-clients.js'
import type { HubInstall } from '../hub-install.js'
import type { HubPairing } from '../hub-pairing.js'
import { mcpLaunch, type McpClients } from '../mcp-clients.js'
import type { Desktop } from './context.js'
import type { Ipc } from './gate.js'

/**
 * Settings: its values, saved and applied to Pace; the team hub, paired or
 * installed; and the AI tools Pacenote's MCP server is added to
 */
export function registerSettingsIpc(
  ipc: Ipc,
  desktop: Desktop,
  {
    settingsFile,
    applySettings,
    hubPairing,
    hubInstall,
    takeLinkedHub,
    mcpClients,
    historyMcp,
  }: {
    settingsFile: string
    /** Restarts or starts Pace on the settings saved; false when it cannot */
    applySettings: () => Promise<boolean>
    hubPairing: HubPairing
    /** A team hub installed from Settings or setup (deploy/hub/install.sh) */
    hubInstall: HubInstall
    /** The hub a pacenote:// link opened, once */
    takeLinkedHub: () => string | undefined
    mcpClients: McpClients
    /** The history MCP server, as the AI tools launch it */
    historyMcp: string
  }
): void {
  const { dataDir, settings } = desktop
  ipc.handle('pacenote:settings:get', null, () => settings.view())
  ipc.handle('pacenote:settings:validate', [], (changes) =>
    settings.validate(changes)
  )
  ipc.handle('pacenote:settings:check-slack', [], (changes) =>
    settings.checkSlack(changes)
  )
  ipc.handle(
    'pacenote:settings:save',
    { issues: [], restarted: false },
    async (changes, restart) => {
      const issues = settings.save(changes)
      if (issues.length > 0 || restart !== true)
        return { issues, restarted: false }
      return { issues, restarted: await applySettings() }
    }
  )
  // Team hub pairing
  ipc.handleOrError('pacenote:hub:pair-start', (url) => hubPairing.start(url))
  ipc.handleOrError('pacenote:hub:pair-status', () => hubPairing.status())
  // Settings starts Pace once paired; setup starts it after its review.
  ipc.handleOrError('pacenote:hub:pair-confirm', async (options) => {
    const confirmed = await hubPairing.confirm()
    const start = (options as { start?: unknown } | undefined)?.start !== false
    const started =
      start && confirmed.issues.length === 0 && (await applySettings())
    return { ...confirmed, started }
  })
  ipc.handle('pacenote:hub:pair-cancel', undefined, () => hubPairing.cancel())
  // Installing a hub from Settings or setup (deploy/hub/install.sh)
  ipc.handleOrError('pacenote:hub:install-command', async (input) =>
    hubInstall.command(input)
  )
  ipc.handle('pacenote:hub:install-state', { step: 'idle' }, () =>
    hubInstall.current()
  )
  ipc.handle('pacenote:hub:install-wait', { step: 'idle' }, () =>
    hubInstall.resume()
  )
  ipc.handle('pacenote:hub:install-cancel', undefined, () =>
    hubInstall.cancel()
  )
  // The hub a pacenote:// link opened, once
  ipc.handle('pacenote:hub:take-link', null, () => takeLinkedHub() ?? null)
  ipc.handleOrError('pacenote:hub:disconnect', async () => {
    const issues = await hubPairing.disconnect(settings.effectiveEnv())
    if (issues.length === 0) await applySettings()
    return { issues }
  })
  ipc.handle('pacenote:settings:open-data-dir', undefined, () => {
    void shell.openPath(dataDir)
  })
  ipc.handle('pacenote:settings:reveal-file', undefined, () => {
    shell.showItemInFolder(settingsFile)
  })
  // The settings screen turns the launch into commands to add it by hand.
  ipc.handle('pacenote:settings:history-mcp', undefined, () =>
    mcpLaunch(historyMcp)
  )
  ipc.handle('pacenote:mcp:status', [], () => mcpClients.status())
  ipc.handle('pacenote:mcp:connect', undefined, (id) =>
    isMcpClientId(id) ? mcpClients.connect(id) : undefined
  )
  ipc.handle('pacenote:mcp:disconnect', undefined, (id) =>
    isMcpClientId(id) ? mcpClients.disconnect(id) : undefined
  )
}
