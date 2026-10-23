import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/**
 * Listens to what the app sends on a channel; the function returned stops
 * listening
 */
const subscribe =
  <T>(channel: string) =>
  (callback: (value: T) => void) => {
    const listener = (_event: IpcRendererEvent, value: T) => callback(value)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }

// Exposes only the platform (window button placement), bot control, settings
// read/write, and sandbox management to the UI. History queries go through
// pacenote://app/api.
contextBridge.exposeInMainWorld('pacenoteDesktop', {
  platform: process.platform,
  // Runs from the repository (Pacenote Dev), as opposed to the installed app.
  dev: process.argv.includes('--pacenote-dev'),
  // The app's language: the one chosen in Settings, or macOS's. Read before
  // the first paint, so the window opens in it.
  language: {
    initial: ipcRenderer.sendSync('pacenote:app:language') as unknown,
    set: (preference: string) =>
      ipcRenderer.invoke('pacenote:app:set-language', preference),
  },
  // The error screen tells the app's log what broke.
  reportError: (report: { message: string; stack?: string }) =>
    ipcRenderer.invoke('pacenote:app:report-error', report),
  // Versions, Pace's state, settings without secrets and the latest logs, for
  // a bug report
  diagnostics: () => ipcRenderer.invoke('pacenote:app:diagnostics'),
  // A newer Pacenote, when there is one (Homebrew installs it)
  updates: {
    state: () => ipcRenderer.invoke('pacenote:app:update'),
    onChange: subscribe<unknown>('pacenote:app:update-changed'),
  },
  // macOS full screen, where the window's traffic lights hide
  fullScreen: {
    get: () => ipcRenderer.invoke('pacenote:window:full-screen'),
    onChange: subscribe<boolean>('pacenote:window:full-screen-changed'),
  },
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
    onChange: subscribe<unknown>('pacenote:bot:changed'),
  },
  settings: {
    get: () => ipcRenderer.invoke('pacenote:settings:get'),
    validate: (changes: unknown) =>
      ipcRenderer.invoke('pacenote:settings:validate', changes),
    checkSlack: (changes: unknown) =>
      ipcRenderer.invoke('pacenote:settings:check-slack', changes),
    save: (changes: unknown, restart = false) =>
      ipcRenderer.invoke('pacenote:settings:save', changes, restart),
    revealFile: () => ipcRenderer.invoke('pacenote:settings:reveal-file'),
    openDataDir: () => ipcRenderer.invoke('pacenote:settings:open-data-dir'),
    historyMcp: () => ipcRenderer.invoke('pacenote:settings:history-mcp'),
  },
  // Your tasks: the list and your decisions (AI tools add them over MCP)
  tasks: {
    list: () => ipcRenderer.invoke('pacenote:tasks:list'),
    trend: () => ipcRenderer.invoke('pacenote:tasks:trend'),
    live: () => ipcRenderer.invoke('pacenote:tasks:live'),
    // A task file changed on disk: an AI tool over MCP, a collection, you
    onChanged: (callback: () => void) =>
      subscribe('pacenote:tasks:changed')(() => callback()),
    decide: (id: string, decision: unknown) =>
      ipcRenderer.invoke('pacenote:tasks:decide', id, decision),
    leaveOut: (label: string) =>
      ipcRenderer.invoke('pacenote:tasks:leave-out', label),
    // Collect now: Claude Code reads Slack, read only, in the main process
    collect: () => ipcRenderer.invoke('pacenote:tasks:collect'),
    stopCollect: () => ipcRenderer.invoke('pacenote:tasks:collect-stop'),
    signIn: (cli?: 'claude' | 'codex') =>
      ipcRenderer.invoke('pacenote:tasks:sign-in', cli),
    // A task's detail, and continuing it: in a terminal (Claude Code or
    // Codex), or with a reply drafted for you to send
    detail: (id: string) => ipcRenderer.invoke('pacenote:tasks:detail', id),
    answerProposal: (id: string, answer: 'close' | 'not-yet') =>
      ipcRenderer.invoke('pacenote:tasks:answer-proposal', id, answer),
    keepLeft: (id: string, text: string) =>
      ipcRenderer.invoke('pacenote:tasks:keep-left', id, text),
    you: () => ipcRenderer.invoke('pacenote:tasks:you'),
    answerGroup: (group: string, yours: boolean) =>
      ipcRenderer.invoke('pacenote:tasks:answer-group', group, yours),
    answerSuggestion: (entryId: string, yes: boolean) =>
      ipcRenderer.invoke('pacenote:tasks:answer-suggestion', entryId, yes),
    folders: (id: string) => ipcRenderer.invoke('pacenote:tasks:folders', id),
    chooseFolder: (repo?: string) =>
      ipcRenderer.invoke('pacenote:tasks:choose-folder', repo),
    repos: () => ipcRenderer.invoke('pacenote:tasks:repos'),
    repoRows: () => ipcRenderer.invoke('pacenote:tasks:repo-rows'),
    apps: () => ipcRenderer.invoke('pacenote:tasks:apps'),
    setRepo: (repo: string, folder?: string) =>
      ipcRenderer.invoke('pacenote:tasks:set-repo', repo, folder),
    continueIn: (id: string, how: { tool: string; folder: string }) =>
      ipcRenderer.invoke('pacenote:tasks:continue', id, how),
    resume: (entryId: string) =>
      ipcRenderer.invoke('pacenote:tasks:resume', entryId),
    draft: (id: string) => ipcRenderer.invoke('pacenote:tasks:draft', id),
    copyReply: (id: string, text: string) =>
      ipcRenderer.invoke('pacenote:tasks:copy-reply', id, text),
    sessionLog: (entryId: string) =>
      ipcRenderer.invoke('pacenote:tasks:session-log', entryId),
  },
  // Settings > Macs: your other Macs, and where Pace answers
  macs: {
    view: () => ipcRenderer.invoke('pacenote:macs:view'),
    answerHere: () => ipcRenderer.invoke('pacenote:macs:answer-here'),
    follow: (on: boolean) => ipcRenderer.invoke('pacenote:macs:follow', on),
    addAddress: (address: string) =>
      ipcRenderer.invoke('pacenote:macs:add-address', address),
    removeAddress: (address: string) =>
      ipcRenderer.invoke('pacenote:macs:remove-address', address),
    ignore: (id: string) => ipcRenderer.invoke('pacenote:macs:ignore', id),
    // Add a Mac: a new Mac's setup takes your Slack app from this one
    addStart: () => ipcRenderer.invoke('pacenote:macs:add-start'),
    addStop: () => ipcRenderer.invoke('pacenote:macs:add-stop'),
    addAllow: () => ipcRenderer.invoke('pacenote:macs:add-allow'),
    addDecline: () => ipcRenderer.invoke('pacenote:macs:add-decline'),
    addClose: () => ipcRenderer.invoke('pacenote:macs:add-close'),
    openPrivacy: () => ipcRenderer.invoke('pacenote:macs:open-privacy'),
    onChange: subscribe<unknown>('pacenote:macs:changed'),
  },
  // Pacenote's own work: the CLIs that do it, and what each last did
  ai: {
    state: () => ipcRenderer.invoke('pacenote:ai:state'),
    now: () => ipcRenderer.invoke('pacenote:ai:now'),
  },
  // You: where you contribute, and your fixes to your areas
  you: {
    get: () => ipcRenderer.invoke('pacenote:you:get'),
    confirm: () => ipcRenderer.invoke('pacenote:you:confirm'),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke('pacenote:you:rename', id, name),
    takeOut: (id: string, part: string) =>
      ipcRenderer.invoke('pacenote:you:take-out', id, part),
    merge: (id: string, into: string) =>
      ipcRenderer.invoke('pacenote:you:merge', id, into),
    leave: (id: string, left: boolean) =>
      ipcRenderer.invoke('pacenote:you:leave', id, left),
  },
  // Recap: a day, a week or a month of your work, and writing it up
  recap: {
    get: (period: string, key?: string) =>
      ipcRenderer.invoke('pacenote:recap:get', period, key),
    write: (period: string, key: string) =>
      ipcRenderer.invoke('pacenote:recap:write', period, key),
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
    pairConfirm: (options?: { start?: boolean }) =>
      ipcRenderer.invoke('pacenote:hub:pair-confirm', options),
    pairCancel: () => ipcRenderer.invoke('pacenote:hub:pair-cancel'),
    disconnect: () => ipcRenderer.invoke('pacenote:hub:disconnect'),
    // Installing a hub on a server: its command, then the wait for it
    installCommand: (input: unknown) =>
      ipcRenderer.invoke('pacenote:hub:install-command', input),
    installState: () => ipcRenderer.invoke('pacenote:hub:install-state'),
    installWait: () => ipcRenderer.invoke('pacenote:hub:install-wait'),
    installCancel: () => ipcRenderer.invoke('pacenote:hub:install-cancel'),
    onInstall: subscribe<unknown>('pacenote:hub:install-changed'),
    // A pacenote:// link from the installer: the hub it names, once
    takeLink: () => ipcRenderer.invoke('pacenote:hub:take-link'),
    onLinked: subscribe<void>('pacenote:hub:linked'),
  },
  // The first-run wizard: its progress, what this Mac has, and "@Pace it's
  // me" on your own Slack app
  setup: {
    state: () => ipcRenderer.invoke('pacenote:setup:state'),
    save: (patch: unknown) => ipcRenderer.invoke('pacenote:setup:save', patch),
    detect: () => ipcRenderer.invoke('pacenote:setup:detect'),
    claimStart: () => ipcRenderer.invoke('pacenote:setup:claim-start'),
    // Connect to your other Mac: setup takes your Slack app from it
    macState: () => ipcRenderer.invoke('pacenote:setup:mac-state'),
    macLook: () => ipcRenderer.invoke('pacenote:setup:mac-look'),
    macConnect: (target: { instance: string } | { address: string }) =>
      ipcRenderer.invoke('pacenote:setup:mac-connect', target),
    macCancel: () => ipcRenderer.invoke('pacenote:setup:mac-cancel'),
    onMacChanged: subscribe<unknown>('pacenote:setup:mac-changed'),
    claimConfirm: (user: unknown) =>
      ipcRenderer.invoke('pacenote:setup:claim-confirm', user),
    claimStop: () => ipcRenderer.invoke('pacenote:setup:claim-stop'),
    onClaim: subscribe<unknown>('pacenote:setup:claimed'),
    onClaimEnded: subscribe<string>('pacenote:setup:claim-ended'),
  },
  sandbox: {
    status: () => ipcRenderer.invoke('pacenote:sandbox:status'),
    job: () => ipcRenderer.invoke('pacenote:sandbox:job'),
    run: (kind: string) => ipcRenderer.invoke('pacenote:sandbox:run', kind),
    saveAllowlist: (domains: string[]) =>
      ipcRenderer.invoke('pacenote:sandbox:save-allowlist', domains),
    // The CLI signs in inside a VM; only its link and code come here, never
    // what it keeps.
    login: (cli: string) => ipcRenderer.invoke('pacenote:sandbox:login', cli),
    loginCode: (code: string) =>
      ipcRenderer.invoke('pacenote:sandbox:login-code', code),
    cancelLogin: () => ipcRenderer.invoke('pacenote:sandbox:login-cancel'),
    signOut: (cli: string) =>
      ipcRenderer.invoke('pacenote:sandbox:sign-out', cli),
    onLoginPrompt: subscribe<unknown>('pacenote:sandbox:login-prompt'),
    onJob: subscribe<unknown>('pacenote:sandbox:job-changed'),
  },
})
