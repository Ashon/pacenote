import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// Exposes only the platform (window button placement), bot control, settings
// read/write, and sandbox management to the UI. History queries go through
// pacenote://app/api.
contextBridge.exposeInMainWorld('pacenoteDesktop', {
  platform: process.platform,
  // Runs from the repository (Pacenote Dev), as opposed to the installed app.
  dev: process.argv.includes('--pacenote-dev'),
  // The error screen tells the app's log what broke.
  reportError: (report: { message: string; stack?: string }) =>
    ipcRenderer.invoke('pacenote:app:report-error', report),
  // Opening the app when you log in (macOS Login Items)
  loginItem: {
    get: () => ipcRenderer.invoke('pacenote:app:login-item'),
    set: (on: boolean) => ipcRenderer.invoke('pacenote:app:set-login-item', on),
    openSystemSettings: () =>
      ipcRenderer.invoke('pacenote:app:open-login-items'),
  },
  bot: {
    state: () => ipcRenderer.invoke('pacenote:bot:state'),
    start: () => ipcRenderer.invoke('pacenote:bot:start'),
    stop: () => ipcRenderer.invoke('pacenote:bot:stop'),
    restart: (rebuild = false) =>
      ipcRenderer.invoke('pacenote:bot:restart', rebuild),
    setAutoStart: (value: boolean) =>
      ipcRenderer.invoke('pacenote:bot:auto-start', value),
    openLogs: () => ipcRenderer.invoke('pacenote:bot:open-logs'),
    onChange: (callback: (state: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, state: unknown) =>
        callback(state)
      ipcRenderer.on('pacenote:bot:changed', listener)
      return () => ipcRenderer.removeListener('pacenote:bot:changed', listener)
    },
  },
  settings: {
    get: () => ipcRenderer.invoke('pacenote:settings:get'),
    validate: (changes: unknown) =>
      ipcRenderer.invoke('pacenote:settings:validate', changes),
    checkSlack: (changes: unknown) =>
      ipcRenderer.invoke('pacenote:settings:check-slack', changes),
    save: (changes: unknown, restart = false) =>
      ipcRenderer.invoke('pacenote:settings:save', changes, restart),
    revealEnv: () => ipcRenderer.invoke('pacenote:settings:reveal-env'),
    openDataDir: () => ipcRenderer.invoke('pacenote:settings:open-data-dir'),
    historyMcp: () => ipcRenderer.invoke('pacenote:settings:history-mcp'),
  },
  // Your tasks: the list and your decisions (AI tools add them over MCP)
  tasks: {
    list: () => ipcRenderer.invoke('pacenote:tasks:list'),
    decide: (id: string, decision: unknown) =>
      ipcRenderer.invoke('pacenote:tasks:decide', id, decision),
    leaveOut: (label: string) =>
      ipcRenderer.invoke('pacenote:tasks:leave-out', label),
    // Collect now: Claude Code reads Slack, read only, in the main process
    collect: () => ipcRenderer.invoke('pacenote:tasks:collect'),
    stopCollect: () => ipcRenderer.invoke('pacenote:tasks:collect-stop'),
  },
  // Pacenote's MCP server in Claude Code and Codex: added with their own CLIs
  mcp: {
    status: () => ipcRenderer.invoke('pacenote:mcp:status'),
    connect: (id: string) => ipcRenderer.invoke('pacenote:mcp:connect', id),
    disconnect: (id: string) =>
      ipcRenderer.invoke('pacenote:mcp:disconnect', id),
  },
  // Team hub pairing. The token stays in the main process; these return { error
  // } on failure.
  hub: {
    pairStart: (url: string) =>
      ipcRenderer.invoke('pacenote:hub:pair-start', url),
    pairStatus: () => ipcRenderer.invoke('pacenote:hub:pair-status'),
    pairConfirm: () => ipcRenderer.invoke('pacenote:hub:pair-confirm'),
    pairCancel: () => ipcRenderer.invoke('pacenote:hub:pair-cancel'),
    disconnect: () => ipcRenderer.invoke('pacenote:hub:disconnect'),
  },
  sandbox: {
    status: () => ipcRenderer.invoke('pacenote:sandbox:status'),
    job: () => ipcRenderer.invoke('pacenote:sandbox:job'),
    run: (kind: string) => ipcRenderer.invoke('pacenote:sandbox:run', kind),
    saveAllowlist: (domains: string[]) =>
      ipcRenderer.invoke('pacenote:sandbox:save-allowlist', domains),
    // Runs claude setup-token; the token goes to .env in the main process and
    // never comes back here.
    claudeToken: () => ipcRenderer.invoke('pacenote:sandbox:claude-token'),
    cancelClaudeToken: () =>
      ipcRenderer.invoke('pacenote:sandbox:claude-token-cancel'),
    onJob: (callback: (job: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, job: unknown) => callback(job)
      ipcRenderer.on('pacenote:sandbox:job-changed', listener)
      return () =>
        ipcRenderer.removeListener('pacenote:sandbox:job-changed', listener)
    },
  },
})
