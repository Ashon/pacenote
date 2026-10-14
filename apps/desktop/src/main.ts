import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  nativeTheme,
  net,
  Notification,
  powerSaveBlocker,
  protocol,
  shell,
  Tray,
} from 'electron'
import { HistoryReader } from '../../../src/history/reader.js'
import { HistoryStore } from '../../../src/history/recorder.js'
import { handleLocalApi } from '../../../src/local-api.js'
import { consoleSink, createLogger, fileSink } from '../../../src/logger.js'
import {
  DESKTOP_LOG_FILE,
  LOG_FILE,
  readBotStatus,
} from '../../../src/runtime/status.js'
import type { BotStatus, LoginItemState } from '../../../src/runtime/types.js'
import {
  migrateEnvText,
  readEnvFile,
  readEnvValues,
  writeEnvFile,
} from '../../../src/settings/env-file.js'
import {
  secretValues,
  setupSettingsRoute,
} from '../../../src/settings/fields.js'
import {
  defaultHome,
  securePrivateDir,
  securePrivateFile,
} from '../../../src/settings/home.js'
import { envFilePath } from '../../../src/settings/paths.js'
import { BotSupervisor, type SupervisorState } from './bot.js'
import {
  currentTroubles,
  newTroubles,
  unknownWithoutBot,
  type Trouble,
} from './troubles.js'
import { SandboxService } from './sandbox.js'
import { UpdateCheck } from './updates.js'
import { diagnosticsText, tailFile } from './diagnostics.js'
import { resolveAppPaths } from './app-paths.js'
import { checkClaudeCredential } from '../../../src/sandbox/claude-credential.js'
import { isMcpClientId } from '../../../src/history/mcp-clients.js'
import {
  latestCollection,
  recentCollections,
} from '../../../src/tasks/collections.js'
import { outcomeOf, taskContext, threadOf } from '../../../src/tasks/context.js'
import { allTaskViews, decide, tasksView } from '../../../src/tasks/store.js'
import type { TaskDecision, WorkEntry } from '../../../src/tasks/types.js'
import {
  checkFolder,
  readRepos,
  recentFolders,
  repoFolder,
  saveRepo,
  suggestFolders,
} from '../../../src/tasks/folders.js'
import {
  addWork,
  readWork,
  updateWork,
  workFor,
} from '../../../src/tasks/work.js'
import { draftReply } from './drafter.js'
import {
  discoverSessions,
  findCodexSession,
  lastActive,
  readSessionLog,
  resumeCommand,
  resumeSession,
  sessionFile,
  startSession,
  terminalOf,
  type HandoffOptions,
  type Session,
} from './handoff.js'
import { ClaudeTokenSetup } from './claude-token.js'
import { KeepAwake } from './keep-awake.js'
import { McpClients } from './mcp-clients.js'
import { recordCollection, TaskCollector } from './task-collector.js'
import { HubPairing } from './hub-pairing.js'
import { SettingsStore } from './settings.js'
import { SetupStore } from './setup.js'
import { setupProblem } from './bot-readiness.js'
import {
  listenForClaim,
  type ClaimListener,
} from '../../../src/messengers/slack/claim.js'
import { checkCli } from '../../../src/reasoners/host-check.js'
import { hostEnv } from '../../../src/sandbox/host.js'
import { runProcess } from '../../../src/sandbox/process.js'
import { vmUnsupported } from '../../../src/sandbox/vm.js'

/**
 * Pacenote desktop app. Runs and manages Pace (the bot) (Slack Socket Mode) as
 * a child process and shows its status, logs, and run history.
 * - The UI (apps/web build) and the query API are served only over the
 *   pacenote://app protocol, so no external port is opened.
 * - Bot control (start, stop, restart) goes only through the preload IPC.
 * - Closing the window hides it to the tray and the bot keeps running. Quitting
 *   the app lets the bot finish active requests and then stops it.
 */
const distDir = path.dirname(fileURLToPath(import.meta.url))
/**
 * Dev runs use the repository build output; the packaged app (Pacenote.app)
 * uses the bundled files inside the app.
 */
const paths = resolveAppPaths(distDir, app.isPackaged)
// Pace and the sandbox jobs find the built-in sandbox's helper here, and Pace
// the ops broker's bundle.
process.env.PACENOTE_VM_BIN ??= paths.vmBin
process.env.PACENOTE_SANDBOX_DIR ??= paths.sandboxDir
const webDistDir = paths.webDist
/**
 * The settings file lives outside the repository. (PACENOTE_HOME, default
 * ~/.pacenote)
 */
const envFile = envFilePath()
const webDevUrl = app.isPackaged ? undefined : process.env.PACENOTE_WEB_DEV_URL
/** Saves the window as a PNG and quits. (for checking builds) */
const captureFile = process.env.PACENOTE_DESKTOP_CAPTURE
const dataDir = resolveDataDir()
// Settings, run history and logs stay with this account: other accounts on
// this Mac cannot list or read them.
securePrivateDir(path.dirname(envFile))
securePrivateDir(dataDir)
securePrivateFile(envFile)
/**
 * The app's own log, kept beside Pace's in the data folder so the installed
 * app's messages are not lost with its console. Open logs folder shows both.
 */
const log = createLogger('info', 'desktop', [
  consoleSink,
  fileSink(path.join(dataDir, DESKTOP_LOG_FILE)),
])
log.info(`Starting ${app.getVersion()} (pid ${process.pid})`)
// Settings that changed meaning are rewritten as Pace reads them now: the
// Docker sandbox is the built-in one, and answering anyone but you is gone.
try {
  const migrated = migrateEnvText(readEnvFile(envFile))
  if (migrated.changed) {
    writeEnvFile(envFile, migrated.text)
    for (const note of migrated.notes) log.info(`Settings: ${note}`)
  }
} catch (err) {
  log.warn(`Could not update the settings file: ${(err as Error).message}`)
}
// An error nothing caught goes to the log instead of a dialog; the bot runs in
// its own process either way.
process.on('uncaughtException', (err) =>
  log.error(`Uncaught error in the app: ${err.stack ?? err.message}`)
)
process.on('unhandledRejection', (reason) =>
  log.error(
    `Unhandled rejection in the app: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`
  )
)
const reader = new HistoryReader(dataDir)
/**
 * The app writes the task collections it runs into the run history (the bot
 * writes its answers). A collection left running when the app last quit ended
 * with it.
 */
const history = new HistoryStore(dataDir)
history.interruptStale(new Set(), new Date(), 'collection')
/** The last days' collection runs, newest first */
const collectionRuns = (days: number) =>
  reader.collections(new Date(Date.now() - days * 86_400_000))
/**
 * With PACENOTE_DESKTOP_BOT=off the app does not manage the bot and only shows
 * history. Screen captures leave the bot alone. (PACENOTE_DESKTOP_BOT=on
 * manages it during captures too)
 */
const botSetting = process.env.PACENOTE_DESKTOP_BOT
const manageBot = botSetting === 'on' || (botSetting !== 'off' && !captureFile)

/**
 * Runs from the repository are "Pacenote Dev": their own name and user data
 * folder give them their own single-instance lock, so they start next to an
 * installed Pacenote instead of handing over to it.
 */
const appName = app.isPackaged ? 'Pacenote' : 'Pacenote Dev'
/** Dock and window icon: dev runs get the one with the DEV tag. */
const appIcon = path.join(distDir, app.isPackaged ? 'icon.png' : 'icon-dev.png')
app.setName(appName)
// Screen captures and end-to-end tests (PACENOTE_DESKTOP_USER_DATA) use a user
// data folder of their own, so they do not hit the running app's
// single-instance lock.
const userData =
  process.env.PACENOTE_DESKTOP_USER_DATA ||
  (captureFile ? path.join(tmpdir(), 'pacenote-desktop-capture') : undefined)
if (userData) app.setPath('userData', userData)
else if (!app.isPackaged)
  app.setPath('userData', path.join(app.getPath('appData'), appName))
// UI theme: system (default), light, dark
const themeSource = process.env.PACENOTE_DESKTOP_THEME
if (themeSource === 'light' || themeSource === 'dark')
  nativeTheme.themeSource = themeSource

let isQuitting = false
let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let toolPathCache: string | undefined

/**
 * An app launched from Finder does not inherit the terminal's PATH (Homebrew,
 * nvm, codex, gh, pnpm).
 */
function toolPath(): string {
  if (toolPathCache) return toolPathCache
  try {
    const output = execFileSync(
      process.env.SHELL || '/bin/zsh',
      ['-ilc', 'printf "\\nPACENOTE_PATH=%s\\n" "$PATH"'],
      { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const line = output
      .split('\n')
      .reverse()
      .find((l) => l.startsWith('PACENOTE_PATH='))
    if (line) toolPathCache = line.slice('PACENOTE_PATH='.length)
  } catch {
    // Falls back to the default paths below.
  }
  toolPathCache ||= [
    process.env.PATH,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
    .filter(Boolean)
    .join(path.delimiter)
  return toolPathCache
}

/**
 * Settings screen that edits the settings file (.env). Works even when the bot
 * is not managed.
 */
const settings = new SettingsStore({
  envFile,
  dataDir,
  env: process.env,
})
const hubPairing = new HubPairing(settings)
/**
 * The first-run wizard's progress. A Pacenote that could already start Pace,
 * or has answered, was set up before the wizard and never opens on it.
 */
const setup = new SetupStore(dataDir, () => ({
  configured: setupProblem(settings.effectiveEnv()) === undefined,
  answered: reader.list({ kind: 'mention' }).length > 0,
}))
/** Setup listening for "@Pace it's me" on your own Slack app */
let claim: ClaimListener | undefined
/**
 * Pace was running when listening began, and runs again if listening ends
 * without anyone confirmed
 */
let claimPaused = false
async function stopClaim(): Promise<void> {
  const listening = claim
  claim = undefined
  await listening?.stop().catch(() => undefined)
}
/**
 * Listening starts, stops and is confirmed one at a time, in the order asked:
 * a screen left while it still connects stops the listener it was waiting for.
 */
let claimQueue: Promise<unknown> = Promise.resolve()
function claimStep<T>(run: () => Promise<T>): Promise<T> {
  const next = claimQueue.then(run, run)
  claimQueue = next.catch(() => undefined)
  return next
}
/**
 * Settings > Sandbox "Get token from Claude": runs claude setup-token and saves
 * its token to .env
 */
const claudeToken = new ClaudeTokenSetup({
  toolPath: () => toolPath(),
  save: (token) => settings.save({ SANDBOX_CLAUDE_OAUTH_TOKEN: token }),
  verify: (token) =>
    checkClaudeCredential({ oauthToken: token }, { fresh: true }),
})

/**
 * How AI tools launch Pacenote's MCP server: this app's own binary as Node,
 * with the bundled server. ready: the bundle exists (dev runs need pnpm bundle)
 */
function mcpLaunch() {
  return {
    command: process.execPath,
    args: [paths.historyMcp],
    env: { ELECTRON_RUN_AS_NODE: '1' },
    ready: existsSync(paths.historyMcp),
  }
}

/** Adds the MCP server to Claude Code and Codex, and checks they reach it */
const mcpClients = new McpClients({ launch: mcpLaunch, toolPath })

/** Collect now on the Todo screen: Claude Code reads Slack, read only */
const taskCollector = new TaskCollector({
  launch: () => {
    const { command, args, env } = mcpLaunch()
    return { command, args, env }
  },
  toolPath,
  cwd: dataDir,
  recorder: (startedAt) => recordCollection(history, startedAt),
  last: latestCollection(dataDir, collectionRuns(90)),
})

/** Sandbox status, allowed domains, apply jobs */
const sandbox = new SandboxService({
  sandboxDir: paths.sandboxDir,
  jobRunner: paths.jobRunner,
  envFile,
  dataDir,
  env: process.env,
  toolPath,
})

const supervisor = manageBot
  ? new BotSupervisor({
      entry: paths.botEntry,
      repoRoot: paths.repoRoot,
      // The packaged app runs the bot from the writable data folder.
      cwd: paths.repoRoot ?? dataDir,
      envFile,
      dataDir,
      toolPath,
      log: (message) => log.info(message),
    })
  : undefined

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pacenote',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
])

/**
 * Resolved from the environment variable, then PACENOTE_DATA_DIR in the
 * settings file, then the default home (~/.pacenote).
 */
function resolveDataDir(): string {
  const key = 'PACENOTE_DATA_DIR'
  let value = process.env[key]
  if (!value) {
    try {
      value = readFileSync(envFile, 'utf8')
        .split('\n')
        .find((l) => l.startsWith(`${key}=`))
        ?.slice(key.length + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
    } catch {
      // Without .env, the default is used.
    }
  }
  if (!value) return defaultHome()
  return path.resolve(
    value === '~' || value.startsWith('~/')
      ? path.join(homedir(), value.slice(1))
      : value
  )
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

function registerAppProtocol(): void {
  protocol.handle('pacenote', async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'app')
      return new Response('Not found', { status: 404 })
    if (url.pathname.startsWith('/api/')) {
      return handleLocalApi(reader, request.method, url)
    }
    const pathname =
      url.pathname === '/'
        ? 'index.html'
        : decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const filePath = path.resolve(webDistDir, pathname)
    const relative = path.relative(webDistDir, filePath)
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !existsSync(filePath) ||
      !statSync(filePath).isFile()
    ) {
      return new Response('Not found', { status: 404 })
    }
    const response = await net.fetch(pathToFileURL(filePath).toString())
    if (!filePath.endsWith('.html')) return response
    const headers = new Headers(response.headers)
    headers.set('content-security-policy', CSP)
    return new Response(response.body, { status: response.status, headers })
  })
}

/**
 * Shows the window; with a route (e.g. "#/settings") it also switches to that
 * screen.
 */
function showMainWindow(route?: string): void {
  if (!mainWindow) {
    void createWindow(route).catch(reportStartupError)
    return
  }
  if (route)
    void mainWindow.webContents.executeJavaScript(
      `location.hash = ${JSON.stringify(route)}`
    )
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

const PHASE_LABEL: Record<SupervisorState['phase'], string> = {
  idle: 'Stopped',
  setup: 'Setup needed',
  failed: 'Failed to start',
  building: 'Building',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  crashed: 'Crashed',
  external: 'Running in terminal',
}

function botSummary(): {
  label: string
  active: number
  status: BotStatus | undefined
} {
  const view = readBotStatus(dataDir)
  const status = view.alive ? view.status : undefined
  const phase = supervisor?.current.phase
  let label = phase ? PHASE_LABEL[phase] : status ? 'Running' : 'Stopped'
  if (supervisor?.current.retryAt !== undefined) label += ', starting again'
  if (status?.state === 'running' && status.socket.state !== 'connected') {
    label = `Socket Mode ${status.socket.state === 'reconnecting' ? 'reconnecting' : 'disconnected'}`
  } else if (
    status?.state === 'running' &&
    (phase === 'running' || phase === 'external')
  ) {
    label = `Connected${phase === 'external' ? ' in terminal' : ''} (${status.reasoner ?? '?'})`
  }
  return { label, active: status?.requests.active ?? 0, status }
}

/** Troubles already told as notifications (troubles.ts) */
const toldTroubles = new Set<string>()

/**
 * Tells each new trouble once as a notification, unless the window is in
 * front, where the app shows it already. Clicking one opens where to look.
 */
function tellTroubles(troubles: readonly Trouble[], botRunning: boolean): void {
  const fresh = newTroubles(
    toldTroubles,
    troubles,
    (key) => botRunning || !unknownWithoutBot(key)
  )
  if (fresh.length === 0 || mainWindow?.isFocused()) return
  if (!Notification.isSupported()) return
  for (const trouble of fresh) {
    log.info(`Notifying: ${trouble.title}: ${trouble.body}`)
    const notice = new Notification({
      title: trouble.title,
      body: trouble.body,
    })
    notice.on('click', () => showMainWindow(trouble.route))
    notice.show()
  }
}

/** A menu item's text, short enough for the menu bar's menu */
function truncateLabel(text: string, max = 72): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Looks for a newer release: the installed app only, or a dev run pointed at a
 * test server with PACENOTE_DESKTOP_UPDATE_URL.
 * PACENOTE_DESKTOP_UPDATE_CHECK=off turns it off.
 */
const updateUrl = process.env.PACENOTE_DESKTOP_UPDATE_URL
const updates =
  process.env.PACENOTE_DESKTOP_UPDATE_CHECK !== 'off' &&
  !captureFile &&
  (app.isPackaged || updateUrl)
    ? new UpdateCheck({
        current: app.getVersion(),
        url: updateUrl,
        // Chromium's network stack, which follows the system proxy
        fetch: net.fetch as typeof fetch,
        log: (message) => log.info(message),
      })
    : undefined

/** Holds off system sleep while Pace has requests in progress */
const keepAwake = new KeepAwake(powerSaveBlocker)

let lastTrayKey = ''
/** Every 2 seconds: the menu bar item, and keeping the Mac awake */
function updateTray(): void {
  const summary = botSummary()
  keepAwake.set(summary.active > 0)
  const troubles = supervisor
    ? currentTroubles(supervisor.current, summary.status)
    : []
  tellTroubles(troubles, summary.status !== undefined)
  if (!tray) return
  const phase = supervisor?.current.phase
  // What the status line does not say already
  const notes = troubles
    .filter((trouble) => trouble.key !== 'exit' && trouble.key !== 'setup')
    .map((trouble) =>
      trouble.key === 'socket' ? trouble.title : truncateLabel(trouble.body)
    )
  const update = updates?.current.available
    ? updates.current.latest?.version
    : undefined
  const key = JSON.stringify([
    summary.label,
    summary.active,
    phase,
    troubles.length,
    notes,
    update,
  ])
  if (key === lastTrayKey) return
  lastTrayKey = key
  tray.setToolTip(`${appName} - Pace: ${summary.label}`)
  // Shows the number of active requests next to the menu bar icon. (macOS)
  // Dev runs say so next to the tray icon, since the installed Pacenote may sit
  // beside it.
  // A warning sign while there is trouble, so it shows with the window
  // closed.
  tray.setTitle(
    [
      app.isPackaged ? '' : 'Dev',
      troubles.length > 0 ? '\u26a0\ufe0e' : '',
      summary.active > 0 ? String(summary.active) : '',
    ]
      .filter(Boolean)
      .join(' ')
  )
  // The tray opens the app first, then the status and quick actions. Bot
  // control is on the Bot screen; app settings (start automatically, run
  // history folder) are on the Settings screen.
  const live = phase === 'running' || phase === 'starting'
  // When setup is needed, the quick action is opening Settings rather than a
  // Start that would stop again.
  const controls: MenuItemConstructorOptions[] = supervisor
    ? [
        live
          ? { label: 'Restart Pace', click: () => void supervisor.restart() }
          : phase === 'setup'
            ? setup.view().open
              ? {
                  label: 'Set up Pace...',
                  click: () => showMainWindow('#/setup'),
                }
              : {
                  label: 'Open Settings...',
                  click: () =>
                    showMainWindow(
                      setupSettingsRoute(supervisor?.current.issues)
                    ),
                }
            : {
                label: 'Start Pace',
                enabled:
                  phase === 'idle' || phase === 'failed' || phase === 'crashed',
                click: () => void supervisor.start(),
              },
      ]
    : []
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${appName}`, click: () => showMainWindow() },
      { type: 'separator' },
      { label: `Pace: ${summary.label}`, enabled: false },
      ...notes.map((note) => ({ label: note, enabled: false })),
      ...(summary.active > 0
        ? [
            {
              label: `${summary.active} active ${summary.active === 1 ? 'request' : 'requests'}`,
              enabled: false,
            },
          ]
        : []),
      ...controls,
      { type: 'separator' },
      ...(update
        ? [
            {
              label: `Pacenote ${update} is out...`,
              click: () => showMainWindow('#/settings/general'),
            },
          ]
        : []),
      { label: `Quit ${appName}`, click: () => app.quit() },
    ])
  )
}

function createTray(): void {
  // If tray@2x.png is in the same directory, Retina displays use it
  // automatically.
  tray = new Tray(nativeImage.createFromPath(path.join(distDir, 'tray.png')))
  tray.on('click', () => tray?.popUpContextMenu())
  updateTray()
  setInterval(updateTray, 2_000).unref()
}

/** Diagnostics for a bug report (diagnostics.ts) */
function diagnostics(): string {
  return diagnosticsText({
    app: {
      version: app.getVersion(),
      packaged: app.isPackaged,
      electron: process.versions.electron,
      node: process.versions.node,
      os:
        process.platform === 'darwin'
          ? `macOS ${process.getSystemVersion()}`
          : `${process.platform} ${process.getSystemVersion()}`,
      arch: process.arch,
    },
    supervisor: supervisor?.current,
    bot: readBotStatus(dataDir),
    settings: readEnvValues(readEnvFile(envFile)),
    secrets: secretValues(settings.effectiveEnv()),
    logs: [
      {
        name: "Pace's log",
        lines: tailFile(path.join(dataDir, LOG_FILE), 200),
      },
      {
        name: "The app's log",
        lines: tailFile(path.join(dataDir, DESKTOP_LOG_FILE), 200),
      },
    ],
  })
}

/**
 * Whether the app opens when you log in. macOS keeps the setting (Login Items),
 * and only the installed app can be one: a dev run would add Electron itself.
 */
function loginItem(): LoginItemState {
  if (!app.isPackaged)
    return { available: false, on: false, needsApproval: false }
  const item = app.getLoginItemSettings()
  return {
    available: true,
    on: item.openAtLogin,
    needsApproval: item.status === 'requires-approval',
  }
}

/** Bot control from the UI. Accepts requests only from the main window. */
function registerBotIpc(): void {
  const fromMainWindow = (event: Electron.IpcMainInvokeEvent) =>
    event.sender === mainWindow?.webContents
  ipcMain.handle('pacenote:bot:state', (event) =>
    fromMainWindow(event) && supervisor ? supervisor.current : null
  )
  ipcMain.handle('pacenote:bot:start', async (event) => {
    if (fromMainWindow(event)) await supervisor?.start()
  })
  ipcMain.handle('pacenote:bot:stop', async (event) => {
    if (fromMainWindow(event)) await supervisor?.stop()
  })
  ipcMain.handle('pacenote:bot:restart', async (event, rebuild: unknown) => {
    if (fromMainWindow(event))
      await supervisor?.restart({ rebuild: rebuild === true })
  })
  ipcMain.handle('pacenote:bot:auto-start', (event, value: unknown) => {
    if (fromMainWindow(event) && typeof value === 'boolean')
      supervisor?.setAutoStart(value)
  })
  // The window's error screen reports what broke, for the log.
  ipcMain.handle('pacenote:app:report-error', (event, report: unknown) => {
    if (!fromMainWindow(event)) return
    const { message, stack } = (report ?? {}) as {
      message?: unknown
      stack?: unknown
    }
    log.error(
      `The window hit an error: ${String(message).slice(0, 2_000)}${typeof stack === 'string' ? `\n${stack.slice(0, 8_000)}` : ''}`
    )
  })
  ipcMain.handle('pacenote:app:login-item', (event) =>
    fromMainWindow(event) ? loginItem() : null
  )
  ipcMain.handle('pacenote:app:set-login-item', (event, value: unknown) => {
    if (!fromMainWindow(event)) return null
    if (app.isPackaged && typeof value === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: value })
      log.info(`Open at login ${value ? 'on' : 'off'}`)
    }
    return loginItem()
  })
  ipcMain.handle('pacenote:app:open-login-items', (event) => {
    if (fromMainWindow(event))
      void shell.openExternal(
        'x-apple.systempreferences:com.apple.LoginItems-Settings.extension'
      )
  })
  ipcMain.handle('pacenote:app:diagnostics', (event) =>
    fromMainWindow(event) ? diagnostics() : null
  )
  ipcMain.handle('pacenote:bot:open-logs', (event) => {
    if (fromMainWindow(event)) void shell.openPath(path.join(dataDir, 'logs'))
  })

  // Your tasks: AI tools add them through the MCP server; the app shows them
  // and keeps your decisions (tasks-decisions.json, which only the app writes).
  const tasksSettings = () => {
    const env = settings.effectiveEnv()
    return {
      on: env.TASKS === 'on',
      dms: env.TASKS_DMS === 'on',
      exclude: (env.TASKS_EXCLUDE_CHANNELS ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
      /** Where code tasks continue */
      cli: env.TASKS_CLI === 'codex' ? ('codex' as const) : ('claude' as const),
    }
  }
  ipcMain.handle('pacenote:tasks:list', (event) => {
    if (!fromMainWindow(event)) return null
    const current = tasksSettings()
    return {
      settings: current,
      collect: taskCollector.state,
      collections: recentCollections(dataDir, collectionRuns(7)),
      ...tasksView(dataDir, current.exclude),
    }
  })
  ipcMain.handle('pacenote:tasks:collect', (event) => {
    if (!fromMainWindow(event)) return undefined
    if (!tasksSettings().on)
      return {
        at: new Date().toISOString(),
        ok: false,
        error: 'Turn on Settings > Todo > Gather my tasks from Slack first.',
      }
    return taskCollector.run()
  })
  ipcMain.handle('pacenote:tasks:collect-stop', (event) => {
    if (fromMainWindow(event)) taskCollector.cancel()
  })
  ipcMain.handle(
    'pacenote:tasks:decide',
    (event, id: unknown, decision: unknown) => {
      if (!fromMainWindow(event) || typeof id !== 'string') return
      decide(dataDir, id, taskDecision(decision))
    }
  )
  ipcMain.handle('pacenote:tasks:leave-out', (event, label: unknown) => {
    if (!fromMainWindow(event) || typeof label !== 'string' || !label.trim())
      return []
    const { exclude } = tasksSettings()
    if (exclude.includes(label)) return []
    return settings.save({
      TASKS_EXCLUDE_CHANNELS: [...exclude, label].join(', '),
    })
  })
  // A task's detail: what came before it, its work log, and continuing it in
  // Claude Code or Codex, or drafting a reply to send yourself
  const env = () => settings.effectiveEnv()
  const handoff = (): HandoffOptions => ({
    dataDir,
    home: homedir(),
    bin: (tool) =>
      (tool === 'claude' ? env().CLAUDE_BIN : env().CODEX_BIN)?.trim() || tool,
    terminal: () => terminalOf(env().TASKS_TERMINAL),
    planFirst: () => env().TASKS_PLAN_FIRST !== 'off',
  })
  let lookedForSessions = 0
  /** Sessions you started yourself, looked for at most once a minute */
  const findOwnSessions = () => {
    if (env().TASKS_LINK_SESSIONS !== 'on') return
    if (Date.now() - lookedForSessions < 60_000) return
    lookedForSessions = Date.now()
    const known = new Set(
      readWork(dataDir).entries.flatMap((entry) =>
        entry.kind === 'session' && entry.session ? [entry.session] : []
      )
    )
    const tasks = allTaskViews(dataDir).map((task) => ({
      id: task.id,
      link: task.source.permalink,
    }))
    for (const entry of discoverSessions(homedir(), tasks, known))
      addWork(dataDir, entry)
  }
  const taskDetail = (id: string) => {
    const all = allTaskViews(dataDir)
    const task = all.find((t) => t.id === id)
    if (!task) return null
    // Codex sessions Pacenote opened get their id once they have started.
    for (const entry of workFor(readWork(dataDir).entries, id))
      if (
        entry.kind === 'session' &&
        entry.tool === 'codex' &&
        !entry.session
      ) {
        const session = findCodexSession(homedir(), entry)
        if (session) updateWork(dataDir, entry.id, (e) => ({ ...e, session }))
      }
    findOwnSessions()
    const work = readWork(dataDir).entries
    const thread = threadOf(task)
    const at = thread.indexOf(':')
    const context = taskContext(
      task,
      all,
      work,
      reader.inThread(thread.slice(0, at), thread.slice(at + 1))
    )
    return {
      task,
      context,
      outcome: outcomeOf(task, work),
      work: workFor(work, id).map((entry) =>
        entry.kind === 'session'
          ? {
              ...entry,
              lastActiveAt: lastActive(homedir(), entry),
              resume: resumeCommand(entry),
            }
          : entry
      ),
      folder: task.repo ? repoFolder(dataDir, task.repo) : undefined,
      cli:
        env().TASKS_CLI === 'codex' ? ('codex' as const) : ('claude' as const),
    }
  }
  const sessionEntry = (entryId: unknown): Session | undefined => {
    const entry = readWork(dataDir).entries.find((e) => e.id === entryId)
    return entry?.kind === 'session' ? entry : undefined
  }
  ipcMain.handle('pacenote:tasks:detail', (event, id: unknown) =>
    fromMainWindow(event) && typeof id === 'string' ? taskDetail(id) : null
  )
  // Where a task may open: its repository's folder and checkouts, or the
  // folders you worked in lately, likeliest first
  ipcMain.handle('pacenote:tasks:folders', (event, id: unknown) => {
    if (!fromMainWindow(event) || typeof id !== 'string') return []
    const task = allTaskViews(dataDir).find((t) => t.id === id)
    return task ? suggestFolders(task, { home: homedir(), dataDir }) : []
  })
  ipcMain.handle(
    'pacenote:tasks:choose-folder',
    async (event, repo: unknown) => {
      if (!fromMainWindow(event) || !mainWindow) return undefined
      // Next to the folder you worked in last, where your checkouts are
      const [last] = recentFolders(homedir(), { leaveOut: [dataDir], limit: 1 })
      const result = await dialog.showOpenDialog(mainWindow, {
        title:
          typeof repo === 'string' ? `Where is ${repo}?` : 'Choose a folder',
        defaultPath: last ? path.dirname(last.path) : homedir(),
        properties: ['openDirectory'],
      })
      const folder = result.filePaths[0]
      if (result.canceled || !folder) return undefined
      return checkFolder(folder, typeof repo === 'string' ? repo : undefined)
    }
  )
  ipcMain.handle('pacenote:tasks:repos', (event) =>
    fromMainWindow(event) ? readRepos(dataDir) : {}
  )
  ipcMain.handle(
    'pacenote:tasks:set-repo',
    (event, repo: unknown, folder: unknown) => {
      if (!fromMainWindow(event) || typeof repo !== 'string') return {}
      return saveRepo(
        dataDir,
        repo,
        typeof folder === 'string' && folder ? folder : undefined
      )
    }
  )
  ipcMain.handle(
    'pacenote:tasks:continue',
    async (event, id: unknown, how: unknown) => {
      if (!fromMainWindow(event) || typeof id !== 'string') return undefined
      const { tool, folder } = (how ?? {}) as {
        tool?: unknown
        folder?: unknown
      }
      const detail = taskDetail(id)
      if (!detail) return { error: 'There is no such task.' }
      if (typeof folder !== 'string' || !folder)
        return { error: 'Choose the folder to work in first.' }
      try {
        if (detail.task.repo) saveRepo(dataDir, detail.task.repo, folder)
        const entry = await startSession(
          handoff(),
          detail.task,
          detail.context,
          tool === 'codex' ? 'codex' : 'claude',
          folder
        )
        addWork(dataDir, entry)
        return { entry }
      } catch (error) {
        return { error: (error as Error).message }
      }
    }
  )
  ipcMain.handle('pacenote:tasks:resume', async (event, entryId: unknown) => {
    if (!fromMainWindow(event)) return undefined
    const entry = sessionEntry(entryId)
    if (!entry) return { error: 'There is no such session.' }
    try {
      await resumeSession(handoff(), entry)
      updateWork(dataDir, entry.id, (e) =>
        e.kind === 'session'
          ? {
              ...e,
              resumedAt: [...(e.resumedAt ?? []), new Date().toISOString()],
            }
          : e
      )
      return {}
    } catch (error) {
      return { error: (error as Error).message }
    }
  })
  const drafting = new Set<string>()
  ipcMain.handle('pacenote:tasks:draft', async (event, id: unknown) => {
    if (!fromMainWindow(event) || typeof id !== 'string') return undefined
    const detail = taskDetail(id)
    if (!detail) return { error: 'There is no such task.' }
    if (drafting.has(id)) return { error: 'A draft is already being written.' }
    drafting.add(id)
    try {
      const { command, args, env: launchEnv } = mcpLaunch()
      const draft = await draftReply({
        bin: env().CLAUDE_BIN?.trim() || 'claude',
        launch: { command, args, env: launchEnv },
        toolPath: toolPath(),
        cwd: dataDir,
        task: detail.task,
        context: detail.context,
      })
      if ('error' in draft) return draft
      const entry: WorkEntry = {
        kind: 'draft',
        id: randomUUID(),
        task: id,
        at: new Date().toISOString(),
        text: draft.text,
      }
      addWork(dataDir, entry)
      return { entry }
    } finally {
      drafting.delete(id)
    }
  })
  ipcMain.handle(
    'pacenote:tasks:copy-reply',
    (event, id: unknown, text: unknown) => {
      if (!fromMainWindow(event) || typeof id !== 'string') return undefined
      if (typeof text !== 'string' || !text.trim())
        return { error: 'The reply is empty.' }
      const task = allTaskViews(dataDir).find((t) => t.id === id)
      if (!task) return { error: 'There is no such task.' }
      clipboard.writeText(text)
      const at = new Date().toISOString()
      const latest = workFor(readWork(dataDir).entries, id).find(
        (entry) => entry.kind === 'draft'
      )
      if (latest)
        updateWork(dataDir, latest.id, (e) =>
          e.kind === 'draft' ? { ...e, text, copiedAt: at } : e
        )
      else
        addWork(dataDir, {
          kind: 'draft',
          id: randomUUID(),
          task: id,
          at,
          text,
          copiedAt: at,
        })
      const link = task.source.permalink
      if (link && /^https:\/\//.test(link)) void shell.openExternal(link)
      return {}
    }
  )
  ipcMain.handle('pacenote:tasks:session-log', (event, entryId: unknown) => {
    if (!fromMainWindow(event)) return undefined
    const entry = sessionEntry(entryId)
    if (!entry) return { error: 'There is no such session.' }
    const file = sessionFile(homedir(), entry)
    if (!file)
      return {
        error: `${entry.tool === 'claude' ? 'Claude Code' : 'Codex'} has no log of this session on this Mac.`,
      }
    try {
      return { items: readSessionLog(file, entry.tool) }
    } catch (error) {
      return { error: (error as Error).message }
    }
  })
  ipcMain.handle('pacenote:settings:get', (event) =>
    fromMainWindow(event) ? settings.view() : null
  )
  ipcMain.handle('pacenote:settings:validate', (event, changes: unknown) =>
    fromMainWindow(event) ? settings.validate(changes) : []
  )
  ipcMain.handle('pacenote:settings:check-slack', (event, changes: unknown) =>
    fromMainWindow(event) ? settings.checkSlack(changes) : []
  )
  // New settings take effect only after the bot restarts. A stopped bot is
  // started fresh.
  const applySettings = async (): Promise<boolean> => {
    if (!supervisor) return false
    const phase = supervisor.current.phase
    if (phase === 'running' || phase === 'starting') await supervisor.restart()
    else if (
      phase === 'idle' ||
      phase === 'setup' ||
      phase === 'failed' ||
      phase === 'crashed'
    )
      await supervisor.start()
    else return false
    return true
  }
  ipcMain.handle(
    'pacenote:settings:save',
    async (event, changes: unknown, restart: unknown) => {
      if (!fromMainWindow(event)) return { issues: [], restarted: false }
      const issues = settings.save(changes)
      if (issues.length > 0 || restart !== true)
        return { issues, restarted: false }
      return { issues, restarted: await applySettings() }
    }
  )
  // Team hub pairing. Errors reach the UI as { error }, since thrown errors
  // lose their message over IPC.
  const hubCall = async <T>(
    event: Electron.IpcMainInvokeEvent,
    run: () => Promise<T>
  ) => {
    if (!fromMainWindow(event)) return { error: 'Not allowed.' }
    try {
      return await run()
    } catch (err) {
      return { error: (err as Error).message }
    }
  }
  ipcMain.handle('pacenote:hub:pair-start', (event, url: unknown) =>
    hubCall(event, () => hubPairing.start(url))
  )
  ipcMain.handle('pacenote:hub:pair-status', (event) =>
    hubCall(event, () => hubPairing.status())
  )
  // Settings starts Pace once paired; setup starts it after its review.
  ipcMain.handle('pacenote:hub:pair-confirm', (event, options: unknown) =>
    hubCall(event, async () => {
      const confirmed = await hubPairing.confirm()
      const start =
        (options as { start?: unknown } | undefined)?.start !== false
      const started =
        start && confirmed.issues.length === 0 && (await applySettings())
      return { ...confirmed, started }
    })
  )
  // The first-run wizard: where it got to, what this Mac has, and "@Pace
  // it's me" on your own Slack app.
  ipcMain.handle('pacenote:setup:state', (event) =>
    fromMainWindow(event) ? setup.view() : null
  )
  ipcMain.handle('pacenote:setup:save', (event, patch: unknown) =>
    fromMainWindow(event) ? setup.save(patch) : null
  )
  ipcMain.handle('pacenote:setup:detect', async (event) => {
    if (!fromMainWindow(event)) return null
    const env = settings.effectiveEnv()
    const runner = (command: string) => (args: string[]) =>
      runProcess(command, args, {
        cwd: tmpdir(),
        input: '',
        timeoutMs: 20_000,
        env: { ...hostEnv(process.env), PATH: toolPath() },
      })
    const cli = (backend: 'claude' | 'codex', setting: string | undefined) => {
      const command = setting?.trim() || backend
      return checkCli(backend, command, runner(command))
    }
    const [claude, codex] = await Promise.all([
      cli('claude', env.CLAUDE_BIN),
      cli('codex', env.CODEX_BIN),
    ])
    return { cli: { claude, codex }, sandbox: { unsupported: vmUnsupported() } }
  })
  ipcMain.handle('pacenote:setup:claim-start', (event) =>
    hubCall(event, () =>
      claimStep(async () => {
        await stopClaim()
        const env = settings.effectiveEnv()
        const appToken = env.SLACK_APP_TOKEN?.trim()
        const botToken = env.SLACK_BOT_TOKEN?.trim()
        if (!appToken || !botToken)
          throw new Error('Connect your Slack app with both tokens first.')
        if (supervisor?.current.phase === 'external')
          throw new Error(
            'Pace is running elsewhere, such as a terminal, and takes the mentions. Stop it there, then try again.'
          )
        // Pace on the same app would take some of the mentions meanwhile.
        if (supervisor?.managing) {
          claimPaused = true
          await supervisor.stop()
        }
        claim = await listenForClaim({
          appToken,
          botToken,
          apiUrl: env.SLACK_API_URL,
          log: log.child('setup'),
          onMention: (user) =>
            mainWindow?.webContents.send('pacenote:setup:claimed', user),
        })
        return { ok: true as const }
      })
    )
  )
  ipcMain.handle('pacenote:setup:claim-confirm', (event, raw: unknown) =>
    hubCall(event, () =>
      claimStep(async () => {
        const user = (raw ?? {}) as { id?: unknown; name?: unknown }
        if (
          typeof user.id !== 'string' ||
          !/^[UW][A-Z0-9]+$/.test(user.id) ||
          typeof user.name !== 'string'
        )
          throw new Error('That is not a Slack member.')
        await stopClaim()
        // Pace answers only you, so this is the one it answers: saying it
        // again replaces the one before, and a wrong "Yes" is undone by the
        // right one.
        const issues = settings.save({ MENTION_ALLOWED_USERS: user.id })
        if (issues.length === 0) {
          claimPaused = false
          setup.save({ me: { id: user.id, name: user.name } })
        }
        return { issues }
      })
    )
  )
  // Left without confirming: Pace runs again if listening stopped it.
  ipcMain.handle('pacenote:setup:claim-stop', (event) =>
    fromMainWindow(event)
      ? claimStep(async () => {
          await stopClaim()
          if (claimPaused) {
            claimPaused = false
            await supervisor?.start()
          }
        })
      : undefined
  )
  ipcMain.handle('pacenote:hub:pair-cancel', (event) => {
    if (fromMainWindow(event)) hubPairing.cancel()
  })
  ipcMain.handle('pacenote:hub:disconnect', (event) =>
    hubCall(event, async () => {
      const issues = await hubPairing.disconnect(settings.effectiveEnv())
      if (issues.length === 0) await applySettings()
      return { issues }
    })
  )
  ipcMain.handle('pacenote:settings:open-data-dir', (event) => {
    if (fromMainWindow(event)) void shell.openPath(dataDir)
  })
  ipcMain.handle('pacenote:settings:reveal-env', (event) => {
    if (fromMainWindow(event)) shell.showItemInFolder(envFile)
  })
  // The settings screen turns the launch into commands to add it by hand.
  ipcMain.handle('pacenote:settings:history-mcp', (event) =>
    fromMainWindow(event) ? mcpLaunch() : undefined
  )
  ipcMain.handle('pacenote:mcp:status', (event) =>
    fromMainWindow(event) ? mcpClients.status() : []
  )
  ipcMain.handle('pacenote:mcp:connect', (event, id: unknown) =>
    fromMainWindow(event) && isMcpClientId(id)
      ? mcpClients.connect(id)
      : undefined
  )
  ipcMain.handle('pacenote:mcp:disconnect', (event, id: unknown) =>
    fromMainWindow(event) && isMcpClientId(id)
      ? mcpClients.disconnect(id)
      : undefined
  )
  ipcMain.handle('pacenote:sandbox:status', (event) =>
    fromMainWindow(event) ? sandbox.status() : null
  )
  ipcMain.handle('pacenote:sandbox:job', (event) =>
    fromMainWindow(event) ? (sandbox.job ?? null) : null
  )
  ipcMain.handle('pacenote:sandbox:run', (event, kind: unknown) =>
    fromMainWindow(event) ? sandbox.run(kind) : { error: 'Denied' }
  )
  ipcMain.handle(
    'pacenote:sandbox:save-allowlist',
    (event, domains: unknown) =>
      fromMainWindow(event) ? sandbox.saveAllowlist(domains) : []
  )
  ipcMain.handle('pacenote:sandbox:claude-token', (event) =>
    fromMainWindow(event)
      ? claudeToken.run()
      : { ok: false, error: 'Not allowed.' }
  )
  ipcMain.handle('pacenote:sandbox:claude-token-cancel', (event) => {
    if (fromMainWindow(event)) claudeToken.cancel()
  })
  sandbox.on('job', (job) => {
    mainWindow?.webContents.send('pacenote:sandbox:job-changed', job)
    // A finished job may have started or stopped the proxy or the broker; the
    // bot checks the sandbox again.
    if (job.state !== 'running') supervisor?.recheckSandbox()
  })
  supervisor?.on('change', (state) => {
    mainWindow?.webContents.send('pacenote:bot:changed', state)
    updateTray()
    // Pace takes the mentions from here on, so setup stops listening for
    // "it's me" rather than share them.
    if (claim && (state.phase === 'starting' || state.phase === 'external'))
      void claimStep(async () => {
        if (!claim) return
        await stopClaim()
        claimPaused = false
        mainWindow?.webContents.send(
          'pacenote:setup:claim-ended',
          state.phase === 'external'
            ? 'Pace started running elsewhere, such as a terminal, and takes the mentions now. Stop it there, then try again.'
            : 'Pace started, so setup stopped listening. Try again to stop Pace and listen.'
        )
      })
  })
  ipcMain.handle('pacenote:window:full-screen', (event) =>
    fromMainWindow(event) ? (mainWindow?.isFullScreen() ?? false) : false
  )
  ipcMain.handle('pacenote:app:update', (event) =>
    fromMainWindow(event) ? (updates?.current ?? null) : null
  )
  updates?.on('change', (state) => {
    mainWindow?.webContents.send('pacenote:app:update-changed', state)
    updateTray()
  })
}

async function createWindow(route = ''): Promise<void> {
  if (mainWindow) {
    showMainWindow(route || undefined)
    return
  }
  const window = new BrowserWindow({
    // For captures the size can be changed: a narrow width for tight layouts, a
    // tall height for long screens.
    width:
      (captureFile && Number(process.env.PACENOTE_DESKTOP_CAPTURE_WIDTH)) ||
      1360,
    height:
      (captureFile && Number(process.env.PACENOTE_DESKTOP_CAPTURE_HEIGHT)) ||
      880,
    minWidth: 600,
    minHeight: 600,
    show: false,
    title: appName,
    icon: appIcon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1714' : '#fafdfb',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(distDir, 'preload.cjs'),
      // Tells the UI it runs from the repository (preload reads it from argv).
      additionalArguments: app.isPackaged ? [] : ['--pacenote-dev'],
    },
  })
  mainWindow = window
  if (!captureFile) window.once('ready-to-show', () => window.show())
  // Full screen hides the traffic lights, so the title bar stops keeping room
  // for them.
  window.on('enter-full-screen', () =>
    window.webContents.send('pacenote:window:full-screen-changed', true)
  )
  window.on('leave-full-screen', () =>
    window.webContents.send('pacenote:window:full-screen-changed', false)
  )
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  // A window whose process ended is blank: it loads again, unless that keeps
  // happening.
  const gone: number[] = []
  window.webContents.on('render-process-gone', (_event, details) => {
    log.error(
      `The window's process ended (${details.reason}, exit code ${details.exitCode})`
    )
    if (details.reason === 'clean-exit' || isQuitting) return
    const now = Date.now()
    gone.push(now)
    while (gone.length && now - gone[0]! > 60_000) gone.shift()
    if (gone.length > 3) {
      log.error('Not reloading the window: its process keeps ending.')
      return
    }
    window.webContents.reload()
  })
  window.on('unresponsive', () => log.warn('The window stopped responding.'))
  window.on('responsive', () => log.info('The window responds again.'))
  // External addresses such as Slack links open in the default browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (
      !url.startsWith('pacenote://app/') &&
      !(webDevUrl && url.startsWith(webDevUrl))
    ) {
      event.preventDefault()
    }
  })
  if (webDevUrl) await waitForUrl(webDevUrl)
  await window.loadURL(`${webDevUrl ?? 'pacenote://app/'}${route}`)
  if (captureFile) await capture(window, captureFile)
}

/**
 * Waits until the dev server is up. (pnpm desktop:dev starts the UI and the app
 * together)
 */
async function waitForUrl(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok) return
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Could not connect to ${url}.`)
}

async function capture(window: BrowserWindow, file: string): Promise<void> {
  const hash = process.env.PACENOTE_DESKTOP_CAPTURE_HASH
  if (hash)
    await window.webContents.executeJavaScript(
      `location.hash = ${JSON.stringify(hash)}`
    )
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Number(process.env.PACENOTE_DESKTOP_CAPTURE_DELAY) || 2_500
    )
  )
  const image = await window.webContents.capturePage()
  writeFileSync(file, image.toPNG())
  isQuitting = true
  app.quit()
}

function reportStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  log.error(`Could not start: ${message}`)
  dialog.showErrorBox(`${appName} could not start`, message)
  app.quit()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
  app
    .whenReady()
    .then(async () => {
      registerAppProtocol()
      registerBotIpc()
      // Opened only to be told to quit (see before-quit): no tray, window or
      // Pace for the moment it lasts.
      if (isQuitting) return
      if (process.platform === 'darwin' && !app.isPackaged) {
        app.dock?.setIcon(nativeImage.createFromPath(appIcon))
      }
      if (!captureFile) createTray()
      // The bot starts independently of the window and does not wait for it.
      if (
        supervisor?.current.autoStart &&
        supervisor.current.phase === 'idle'
      ) {
        void supervisor.start()
      }
      // Opened at login, it stays in the menu bar until you open it.
      const atLogin =
        app.isPackaged && app.getLoginItemSettings().wasOpenedAtLogin
      // A test server answers at once; GitHub can wait for the app to settle.
      updates?.start(updateUrl ? 1_000 : 30_000)
      if (atLogin) log.info('Opened at login; the window waits')
      else await createWindow(setup.view().open ? '#/setup' : '')
      app.on('activate', () => showMainWindow())
    })
    .catch(reportStartupError)
}

let botStopped = false
let botStopping: Promise<void> | undefined
/**
 * Homebrew quits the app before an upgrade by asking again and again until it
 * is gone. A request that lands just as the app exits makes macOS open the app
 * again to deliver it, and that copy is told to quit while it starts. So from
 * the first request on, nothing starts Pace again, and one stop answers them
 * all.
 */
app.on('before-quit', (event) => {
  isQuitting = true
  taskCollector.cancel()
  void stopClaim()
  supervisor?.dispose()
  // A bot started by the app finishes active requests before it stops. (up to
  // 30 seconds)
  if (supervisor?.managing && !botStopped) {
    event.preventDefault()
    tray?.setToolTip(`${appName} - Pace: Stopping`)
    botStopping ??= supervisor.stop().finally(() => {
      botStopped = true
      app.quit()
    })
  }
})
app.on('window-all-closed', () => {
  if (isQuitting) app.quit()
})
process.once('SIGTERM', () => app.quit())

/** A decision from the screen, or undefined to take one back */
function taskDecision(value: unknown): Omit<TaskDecision, 'at'> | undefined {
  const { status, reason } = (value ?? {}) as Partial<TaskDecision>
  if (status !== 'done' && status !== 'dismissed' && status !== 'kept')
    return undefined
  const reasons = ['not-mine', 'done-already', 'not-worth-it']
  return status === 'dismissed' && reason && reasons.includes(reason)
    ? { status, reason }
    : { status }
}
