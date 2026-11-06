import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { DesktopBridge } from '../../../src/desktop-bridge.js'
import type { LanguageState } from '../../../src/i18n/locale.js'

/**
 * Listens to what the app sends on a channel; the function returned stops
 * listening
 */
const subscribe =
  <T = void>(channel: string) =>
  (callback: (value: T) => void) => {
    const listener = (_event: IpcRendererEvent, value: T) => callback(value)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }

// What the screens may ask the app, and nothing else: each call as
// DesktopBridge has it (src/desktop-bridge.ts), which types the arguments
// here. History queries go through pacenote://app/api.
const bridge = {
  platform: process.platform,
  // Runs from the repository (Pacenote Dev), as opposed to the installed app.
  dev: process.argv.includes('--pacenote-dev'),
  // The app's language: the one chosen in Settings, or macOS's. Read before
  // the first paint, so the window opens in it.
  language: {
    initial: ipcRenderer.sendSync('pacenote:app:language') as LanguageState,
    set: (preference) =>
      ipcRenderer.invoke('pacenote:app:set-language', preference),
    onChanged: subscribe('pacenote:app:language-changed'),
  },
  // The error screen tells the app's log what broke.
  reportError: (report) =>
    ipcRenderer.invoke('pacenote:app:report-error', report),
  // Versions, Pace's state, settings without secrets and the latest logs, for
  // a bug report
  diagnostics: () => ipcRenderer.invoke('pacenote:app:diagnostics'),
  // A newer Pacenote, when there is one (Homebrew installs it)
  updates: {
    state: () => ipcRenderer.invoke('pacenote:app:update'),
    onChange: subscribe('pacenote:app:update-changed'),
  },
  // macOS full screen, where the window's traffic lights hide
  fullScreen: {
    get: () => ipcRenderer.invoke('pacenote:window:full-screen'),
    onChange: subscribe('pacenote:window:full-screen-changed'),
  },
  // Opening the app when you log in (macOS Login Items)
  loginItem: {
    get: () => ipcRenderer.invoke('pacenote:app:login-item'),
    set: (on) => ipcRenderer.invoke('pacenote:app:set-login-item', on),
    openSystemSettings: () =>
      ipcRenderer.invoke('pacenote:app:open-login-items'),
  },
  bot: {
    state: () => ipcRenderer.invoke('pacenote:bot:state'),
    start: () => ipcRenderer.invoke('pacenote:bot:start'),
    stop: () => ipcRenderer.invoke('pacenote:bot:stop'),
    restart: (rebuild = false) =>
      ipcRenderer.invoke('pacenote:bot:restart', rebuild),
    setAutoStart: (value) =>
      ipcRenderer.invoke('pacenote:bot:auto-start', value),
    // With Pace off: on again, its setup open where it got to
    setUp: () => ipcRenderer.invoke('pacenote:pace:set-up'),
    openLogs: () => ipcRenderer.invoke('pacenote:bot:open-logs'),
    onChange: subscribe('pacenote:bot:changed'),
  },
  // The screen the window opens on: Todo, or Overview as you chose
  landing: {
    get: () => ipcRenderer.invoke('pacenote:app:landing'),
    set: (patch) => ipcRenderer.invoke('pacenote:app:set-landing', patch),
  },
  settings: {
    get: () => ipcRenderer.invoke('pacenote:settings:get'),
    validate: (changes) =>
      ipcRenderer.invoke('pacenote:settings:validate', changes),
    checkSlack: (changes) =>
      ipcRenderer.invoke('pacenote:settings:check-slack', changes),
    save: (changes, restart = false) =>
      ipcRenderer.invoke('pacenote:settings:save', changes, restart),
    revealFile: () => ipcRenderer.invoke('pacenote:settings:reveal-file'),
    openDataDir: () => ipcRenderer.invoke('pacenote:settings:open-data-dir'),
    historyMcp: () => ipcRenderer.invoke('pacenote:settings:history-mcp'),
    found: (workFolder, fresh = false) =>
      ipcRenderer.invoke('pacenote:settings:found', workFolder, fresh),
  },
  // Your tasks: the list and your decisions (AI tools add them over MCP)
  tasks: {
    list: () => ipcRenderer.invoke('pacenote:tasks:list'),
    trend: () => ipcRenderer.invoke('pacenote:tasks:trend'),
    live: () => ipcRenderer.invoke('pacenote:tasks:live'),
    // A task file changed on disk: an AI tool over MCP, a collection, you
    onChanged: (callback) =>
      subscribe('pacenote:tasks:changed')(() => callback()),
    decide: (id, decision) =>
      ipcRenderer.invoke('pacenote:tasks:decide', id, decision),
    stage: (id, stage) => ipcRenderer.invoke('pacenote:tasks:stage', id, stage),
    // A device's tasks come with where they were added (argsFromDevice)
    add: (title, repo, due, guessed) =>
      ipcRenderer.invoke('pacenote:tasks:add', {
        title,
        repo,
        due,
        guessed: guessed === true,
      }),
    takeBackFill: (id) =>
      ipcRenderer.invoke('pacenote:tasks:take-back-fill', id),
    keepBoth: (id) => ipcRenderer.invoke('pacenote:tasks:keep-both', id),
    leaveOut: (label) => ipcRenderer.invoke('pacenote:tasks:leave-out', label),
    // Collect now: Claude Code reads Slack, read only, in the main process
    collect: () => ipcRenderer.invoke('pacenote:tasks:collect'),
    stopCollect: () => ipcRenderer.invoke('pacenote:tasks:collect-stop'),
    signIn: (cli) => ipcRenderer.invoke('pacenote:tasks:sign-in', cli),
    // A task's detail, and continuing it: in a terminal (Claude Code or
    // Codex), or with a reply drafted for you to send
    detail: (id) => ipcRenderer.invoke('pacenote:tasks:detail', id),
    answerProposal: (id, answer) =>
      ipcRenderer.invoke('pacenote:tasks:answer-proposal', id, answer),
    keepLeft: (id, text) =>
      ipcRenderer.invoke('pacenote:tasks:keep-left', id, text),
    you: () => ipcRenderer.invoke('pacenote:tasks:you'),
    answerGroup: (group, yours) =>
      ipcRenderer.invoke('pacenote:tasks:answer-group', group, yours),
    answerSuggestion: (entryId, yes) =>
      ipcRenderer.invoke('pacenote:tasks:answer-suggestion', entryId, yes),
    folders: (id) => ipcRenderer.invoke('pacenote:tasks:folders', id),
    chooseFolder: (repo) =>
      ipcRenderer.invoke('pacenote:tasks:choose-folder', repo),
    repos: () => ipcRenderer.invoke('pacenote:tasks:repos'),
    repoRows: () => ipcRenderer.invoke('pacenote:tasks:repo-rows'),
    apps: () => ipcRenderer.invoke('pacenote:tasks:apps'),
    setRepo: (repo, folder) =>
      ipcRenderer.invoke('pacenote:tasks:set-repo', repo, folder),
    continueIn: (id, how) =>
      ipcRenderer.invoke('pacenote:tasks:continue', id, how),
    resume: (entryId) => ipcRenderer.invoke('pacenote:tasks:resume', entryId),
    draft: (id) => ipcRenderer.invoke('pacenote:tasks:draft', id),
    copyReply: (id, text) =>
      ipcRenderer.invoke('pacenote:tasks:copy-reply', id, text),
    sessionLog: (entryId) =>
      ipcRenderer.invoke('pacenote:tasks:session-log', entryId),
  },
  // Settings > Devices: your other Macs, and where Pace answers
  macs: {
    view: () => ipcRenderer.invoke('pacenote:macs:view'),
    answerHere: () => ipcRenderer.invoke('pacenote:macs:answer-here'),
    follow: (on) => ipcRenderer.invoke('pacenote:macs:follow', on),
    addAddress: (address) =>
      ipcRenderer.invoke('pacenote:macs:add-address', address),
    removeAddress: (address) =>
      ipcRenderer.invoke('pacenote:macs:remove-address', address),
    ignore: (id) => ipcRenderer.invoke('pacenote:macs:ignore', id),
    removeDevice: (id) => ipcRenderer.invoke('pacenote:macs:remove-device', id),
    // Add a device: a new Mac's setup takes your Slack app from this one
    addStart: () => ipcRenderer.invoke('pacenote:macs:add-start'),
    addStop: () => ipcRenderer.invoke('pacenote:macs:add-stop'),
    addAllow: () => ipcRenderer.invoke('pacenote:macs:add-allow'),
    addDecline: () => ipcRenderer.invoke('pacenote:macs:add-decline'),
    addClose: () => ipcRenderer.invoke('pacenote:macs:add-close'),
    openPrivacy: () => ipcRenderer.invoke('pacenote:macs:open-privacy'),
    onChange: subscribe('pacenote:macs:changed'),
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
    rename: (id, name) => ipcRenderer.invoke('pacenote:you:rename', id, name),
    takeOut: (id, part) =>
      ipcRenderer.invoke('pacenote:you:take-out', id, part),
    merge: (id, into) => ipcRenderer.invoke('pacenote:you:merge', id, into),
    leave: (id, left) => ipcRenderer.invoke('pacenote:you:leave', id, left),
  },
  // Recap: a day, a week or a month of your work, and writing it up
  recap: {
    get: (period, key) => ipcRenderer.invoke('pacenote:recap:get', period, key),
    write: (period, key) =>
      ipcRenderer.invoke('pacenote:recap:write', period, key),
  },
  // Pacenote's MCP server in Claude Code and Codex: added with their own CLIs
  mcp: {
    status: () => ipcRenderer.invoke('pacenote:mcp:status'),
    connect: (id) => ipcRenderer.invoke('pacenote:mcp:connect', id),
    disconnect: (id) => ipcRenderer.invoke('pacenote:mcp:disconnect', id),
  },
  // Team hub pairing. The token stays in the main process; these return { error
  // } on failure.
  hub: {
    pairStart: (url) => ipcRenderer.invoke('pacenote:hub:pair-start', url),
    pairStatus: () => ipcRenderer.invoke('pacenote:hub:pair-status'),
    pairConfirm: (options) =>
      ipcRenderer.invoke('pacenote:hub:pair-confirm', options),
    pairCancel: () => ipcRenderer.invoke('pacenote:hub:pair-cancel'),
    disconnect: () => ipcRenderer.invoke('pacenote:hub:disconnect'),
    // For the hub's admins: its members, who may use it, and their Macs
    admin: () => ipcRenderer.invoke('pacenote:hub:admin'),
    adminAct: (act) => ipcRenderer.invoke('pacenote:hub:admin-act', act),
    people: (words) => ipcRenderer.invoke('pacenote:hub:people', words),
    // Installing a hub on a server: its command, then the wait for it
    installCommand: (input) =>
      ipcRenderer.invoke('pacenote:hub:install-command', input),
    installState: () => ipcRenderer.invoke('pacenote:hub:install-state'),
    installWait: () => ipcRenderer.invoke('pacenote:hub:install-wait'),
    installCancel: () => ipcRenderer.invoke('pacenote:hub:install-cancel'),
    onInstall: subscribe('pacenote:hub:install-changed'),
    // A pacenote:// link from the installer or a teammate's share link: the
    // hub it names, once
    takeLink: () => ipcRenderer.invoke('pacenote:hub:take-link'),
    onLinked: subscribe('pacenote:hub:linked'),
  },
  // The first-run wizard: its progress, what this Mac has, and "@Pace it's
  // me" on your own Slack app
  setup: {
    state: () => ipcRenderer.invoke('pacenote:setup:state'),
    save: (patch) => ipcRenderer.invoke('pacenote:setup:save', patch),
    detect: () => ipcRenderer.invoke('pacenote:setup:detect'),
    claimStart: () => ipcRenderer.invoke('pacenote:setup:claim-start'),
    // Connect to your other Mac: setup takes your Slack app from it
    macState: () => ipcRenderer.invoke('pacenote:setup:mac-state'),
    macLook: (mode) => ipcRenderer.invoke('pacenote:setup:mac-look', mode),
    macConnect: (target) =>
      ipcRenderer.invoke('pacenote:setup:mac-connect', target),
    macCancel: () => ipcRenderer.invoke('pacenote:setup:mac-cancel'),
    onMacChanged: subscribe('pacenote:setup:mac-changed'),
    claimConfirm: (user) =>
      ipcRenderer.invoke('pacenote:setup:claim-confirm', user),
    claimStop: () => ipcRenderer.invoke('pacenote:setup:claim-stop'),
    onClaim: subscribe('pacenote:setup:claimed'),
    onClaimEnded: subscribe('pacenote:setup:claim-ended'),
  },
  sandbox: {
    status: () => ipcRenderer.invoke('pacenote:sandbox:status'),
    job: () => ipcRenderer.invoke('pacenote:sandbox:job'),
    run: (kind) => ipcRenderer.invoke('pacenote:sandbox:run', kind),
    saveAllowlist: (domains) =>
      ipcRenderer.invoke('pacenote:sandbox:save-allowlist', domains),
    // The CLI signs in inside a VM; only its link and code come here, never
    // what it keeps.
    login: (cli) => ipcRenderer.invoke('pacenote:sandbox:login', cli),
    loginCode: (code) =>
      ipcRenderer.invoke('pacenote:sandbox:login-code', code),
    cancelLogin: () => ipcRenderer.invoke('pacenote:sandbox:login-cancel'),
    signOut: (cli) => ipcRenderer.invoke('pacenote:sandbox:sign-out', cli),
    onLoginPrompt: subscribe('pacenote:sandbox:login-prompt'),
    onJob: subscribe('pacenote:sandbox:job-changed'),
  },
  // MCP servers for Pace: their headers come back by name only
  servers: {
    list: () => ipcRenderer.invoke('pacenote:servers:list'),
    save: (draft, previous) =>
      ipcRenderer.invoke('pacenote:servers:save', draft, previous),
    addFound: (url, name, headers) =>
      ipcRenderer.invoke('pacenote:servers:add-found', url, name, headers),
    remove: (name) => ipcRenderer.invoke('pacenote:servers:remove', name),
    check: (draft, previous) =>
      ipcRenderer.invoke('pacenote:servers:check', draft, previous),
  },
} satisfies DesktopBridge

contextBridge.exposeInMainWorld('pacenoteDesktop', bridge)
