import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync, writeFileSync } from 'node:fs'
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
  secretValues,
  setupSettingsRoute,
} from '../../../src/settings/fields.js'
import {
  defaultHome,
  securePrivateDir,
  securePrivateFile,
} from '../../../src/settings/home.js'
import { settingsFilePath } from '../../../src/settings/paths.js'
import {
  moveEnvSettings,
  readSettingsValues,
} from '../../../src/settings/settings-file.js'
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
import { isMcpClientId } from '../../../src/history/mcp-clients.js'
import {
  latestCollection,
  recentCollections,
} from '../../../src/tasks/collections.js'
import { outcomeOf, taskContext, threadOf } from '../../../src/tasks/context.js'
import {
  allTaskViews,
  decide,
  readTasks,
  tasksView,
} from '../../../src/tasks/store.js'
import { listOf } from '../../../src/tasks/settings.js'
import {
  answerGroup,
  notYourGroups,
  yourGroups,
} from '../../../src/tasks/you.js'
import { liveTasks, readActivity } from '../../../src/tasks/activity.js'
import { taskTrend } from '../../../src/tasks/trend.js'
import type {
  Proposal,
  TaskDecision,
  WorkEntry,
  WorkTool,
} from '../../../src/tasks/types.js'
import {
  checkFolder,
  readRepos,
  recentFolders,
  repoFolder,
  saveRepo,
  suggestFolders,
  yourFolder,
} from '../../../src/tasks/folders.js'
import {
  addWork,
  answerSuggestion,
  changeWork,
  openProposals,
  readWork,
  updateWork,
  workFor,
} from '../../../src/tasks/work.js'
import { addFollowUp, closeTask } from '../../../src/tasks/write.js'
import {
  leaveArea,
  mergeAreas,
  renameArea,
  takeOut,
  taskArea,
} from '../../../src/you/areas.js'
import {
  changeYou,
  checkAccounts,
  countYou,
  readYou,
} from '../../../src/you/store.js'
import type { YouFile, YouView } from '../../../src/you/types.js'
import {
  countRecap,
  keepWritten,
  periodKey,
  periodRange,
  periodWords,
  RECAP_PERIODS,
  recapPrompt,
  type RecapPeriod,
  type RecapView,
} from '../../../src/you/recap.js'
import { keepRecapSpend } from '../../../src/you/spent.js'
import { writeRecap } from './recap-writer.js'
import {
  dueForJudging,
  judge,
  judgePrompt,
  pullRequestOf,
  QUIET_MS,
} from './done-watch.js'
import { draftReply } from './drafter.js'
import { SessionIndex } from './session-index.js'
import { isTaskBranch, linkSessions, RepoLookup } from './session-links.js'
import {
  findCodexSession,
  lastActive,
  readSessionLog,
  resumeCommand,
  resumeSession,
  sessionFile,
  signInClaude,
  startSession,
  terminalOf,
  type HandoffOptions,
  type Session,
} from './handoff.js'
import { KeepAwake } from './keep-awake.js'
import { McpClients } from './mcp-clients.js'
import { recordCollection, TaskCollector } from './task-collector.js'
import { watchTasks } from './tasks-watch.js'
import { HubPairing } from './hub-pairing.js'
import { SandboxSignIn } from './sandbox-login.js'
import { SettingsStore } from './settings.js'
import { SetupStore } from './setup.js'
import { BundleWatch } from './bundle-watch.js'
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
const settingsFile = settingsFilePath()
const webDevUrl = app.isPackaged ? undefined : process.env.PACENOTE_WEB_DEV_URL
/** Saves the window as a PNG and quits. (for checking builds) */
const captureFile = process.env.PACENOTE_DESKTOP_CAPTURE
// Settings, run history and logs stay with this account: other accounts on
// this Mac cannot list or read them.
securePrivateDir(path.dirname(settingsFile))
/**
 * An earlier version's .env becomes settings.json, once, before anything reads
 * it; logged once the log is open. Settings that changed meaning are rewritten
 * as Pace reads them now.
 */
const moved = (() => {
  try {
    return { notes: moveEnvSettings(settingsFile) }
  } catch (err) {
    return { notes: [], error: (err as Error).message }
  }
})()
const dataDir = resolveDataDir()
securePrivateDir(dataDir)
securePrivateFile(settingsFile)
/**
 * The app's own log, kept beside Pace's in the data folder so the installed
 * app's messages are not lost with its console. Open logs folder shows both.
 */
const log = createLogger('info', 'desktop', [
  consoleSink,
  fileSink(path.join(dataDir, DESKTOP_LOG_FILE)),
])
log.info(`Starting ${app.getVersion()} (pid ${process.pid})`)
for (const note of moved.notes) log.info(`Settings: ${note}`)
if (moved.error)
  log.warn(`Could not move the settings to settings.json: ${moved.error}`)
/**
 * Another version put in this app's place while it runs (BundleWatch): Pace
 * stops as on any quit, and the app opens again as the new version. The
 * packaged app watches its own Info.plist; end-to-end tests name one
 * (PACENOTE_DESKTOP_BUNDLE_INFO) and keep it from opening again
 * (PACENOTE_DESKTOP_NO_RELAUNCH).
 */
const bundleInfo = app.isPackaged
  ? path.join(path.dirname(path.dirname(process.execPath)), 'Info.plist')
  : process.env.PACENOTE_DESKTOP_BUNDLE_INFO
const bundleWatch = bundleInfo
  ? new BundleWatch({
      file: bundleInfo,
      running: app.getVersion(),
      onReplaced: (version) => {
        restartInto(version)
        app.quit()
      },
    })
  : undefined
let restarting = false
/** Opens the version on disk once this copy is gone, once however asked */
function restartInto(version: string): void {
  if (restarting) return
  restarting = true
  log.info(`The app on disk is ${version} now; restarting into it`)
  if (process.env.PACENOTE_DESKTOP_NO_RELAUNCH !== '1') app.relaunch()
}
/** Pace has stopped: an upgrade that went on meanwhile is opened as it goes */
async function reopenIfReplaced(): Promise<void> {
  const version = await bundleWatch?.onDisk()
  if (version && version !== app.getVersion()) restartInto(version)
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
/** Stops telling the window about task files changing on disk */
let stopTasksWatch: (() => void) | undefined
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
 * Settings screen that edits the settings file. Works even when the bot is not
 * managed.
 */
const settings = new SettingsStore({
  settingsFile,
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
 * Settings > Sandbox "Sign in to Claude" or "Codex": the CLI signs in inside a
 * VM itself; its link and code go to the screen as they come
 */
const sandboxSignIn = new SandboxSignIn({
  env: process.env,
  onPrompt: (prompt) =>
    mainWindow?.webContents.send('pacenote:sandbox:login-prompt', prompt),
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
    return { command, args, env: { ...env, PACENOTE_MCP_FROM_APP: '1' } }
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
  settingsFile,
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
      settingsFile,
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
 * Resolved from the environment variable, then the data folder in the settings
 * file, then the default home (~/.pacenote).
 */
function resolveDataDir(): string {
  let value = process.env.PACENOTE_DATA_DIR
  if (!value) {
    try {
      value = readSettingsValues(settingsFile).PACENOTE_DATA_DIR?.trim()
    } catch {
      // A file that cannot be read leaves the default.
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
    // macOS shows notifications only for a signed app (an unsigned
    // development build gets this) and only once notifications are allowed
    notice.on('failed', (_event, error) =>
      log.warn(`Could not show a notification: ${error}`)
    )
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
    settings: (() => {
      try {
        return readSettingsValues(settingsFile)
      } catch {
        return {}
      }
    })(),
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
      exclude: listOf(env.TASKS_EXCLUDE_CHANNELS),
      names: listOf(env.TASKS_NAMES),
      groups: listOf(env.TASKS_GROUPS),
      /** Where code tasks continue */
      cli: env.TASKS_CLI === 'codex' ? ('codex' as const) : ('claude' as const),
    }
  }
  ipcMain.handle('pacenote:tasks:list', (event) => {
    if (!fromMainWindow(event)) return null
    const current = tasksSettings()
    const view = tasksView(dataDir, current.exclude)
    linkSessionsSoon()
    judgeSoon()
    const open = view.tasks.filter((task) => task.status === 'open')
    const yours = yourGroups(current)
    const areas = readYou(dataDir).areas
    return {
      settings: current,
      collect: taskCollector.state,
      collections: recentCollections(dataDir, collectionRuns(7)),
      ...view,
      working: working(open),
      proposals: openProposals(
        readWork(dataDir),
        new Set(open.map((task) => task.id))
      ),
      // A Maybe from a group neither list has asks whether it means you.
      groups: {
        yours,
        notYours: notYourGroups(readTasks(dataDir), yours),
      },
      // The area each task is in, for its row (src/you)
      areas: Object.fromEntries(
        view.tasks.flatMap((task) => {
          const area = taskArea(areas, task)
          return area ? [[task.id, area]] : []
        })
      ),
    }
  })
  // Who you are in Slack, as Collect now last looked you up
  ipcMain.handle('pacenote:tasks:you', (event) =>
    fromMainWindow(event) ? (readTasks(dataDir).you ?? null) : null
  )
  // Whether a user group means you: one that does goes into Settings, and its
  // Maybes into the list; one that does not is not asked about again.
  ipcMain.handle(
    'pacenote:tasks:answer-group',
    (event, value: unknown, yours: unknown) => {
      if (!fromMainWindow(event) || typeof value !== 'string') return {}
      const group = answerGroup(dataDir, value, yours === true)
      if (!group) return { error: `${value} is not a user group.` }
      if (yours !== true) return {}
      const current = tasksSettings()
      if (!yourGroups(current).includes(group)) {
        const problems = settings.save({
          TASKS_GROUPS: [...(current.groups ?? []), group].join(', '),
        })
        if (problems.length > 0)
          return { error: problems.map((p) => p.message).join(' ') }
      }
      const kept = tasksView(dataDir, current.exclude).tasks.filter(
        (task) => task.status === 'maybe' && task.group === group
      )
      for (const task of kept) decide(dataDir, task.id, { status: 'kept' })
      return { kept: kept.length }
    }
  )
  // You: where you contribute, from your tasks and your sessions on this Mac
  // (src/you). Counted at most every minute, in the background once there is
  // a count to show; a fix applies at once and is counted again with it.
  const YOU_EVERY_MS = 60_000
  let you: { view: YouView; at: number } | undefined
  let counting: Promise<YouView> | undefined
  const countYouNow = (): Promise<YouView> => {
    counting ??= (async () => {
      await checkAccounts(dataDir, toolPath()).catch(() => undefined)
      const view = await countYou({ dataDir, home: homedir(), keep: true })
      you = { view, at: Date.now() }
      return view
    })().finally(() => {
      counting = undefined
    })
    return counting
  }
  ipcMain.handle('pacenote:you:get', (event) => {
    if (!fromMainWindow(event)) return null
    if (!you) return countYouNow()
    if (Date.now() - you.at > YOU_EVERY_MS) void countYouNow()
    return you.view
  })
  const fixYou = async (change: (file: YouFile) => YouFile) => {
    changeYou(dataDir, change)
    // A count under way may have read the areas before the fix.
    await counting?.catch(() => undefined)
    return countYouNow()
  }
  const text = (value: unknown) =>
    typeof value === 'string' && value.length < 200 ? value : undefined
  ipcMain.handle('pacenote:you:confirm', (event) =>
    fromMainWindow(event)
      ? fixYou((file) => ({ ...file, confirmedAt: new Date().toISOString() }))
      : null
  )
  ipcMain.handle('pacenote:you:rename', (event, id: unknown, name: unknown) => {
    const area = text(id)
    const to = text(name)
    return fromMainWindow(event) && area && to
      ? fixYou((file) => renameArea(file, area, to))
      : null
  })
  ipcMain.handle(
    'pacenote:you:take-out',
    (event, id: unknown, part: unknown) => {
      const area = text(id)
      const key = text(part)
      return fromMainWindow(event) && area && key
        ? fixYou((file) => takeOut(file, area, key))
        : null
    }
  )
  ipcMain.handle('pacenote:you:merge', (event, id: unknown, into: unknown) => {
    const area = text(id)
    const target = text(into)
    return fromMainWindow(event) && area && target
      ? fixYou((file) => mergeAreas(file, area, target))
      : null
  })
  ipcMain.handle('pacenote:you:leave', (event, id: unknown, left: unknown) => {
    const area = text(id)
    return fromMainWindow(event) && area
      ? fixYou((file) => leaveArea(file, area, left === true))
      : null
  })
  // Recap: what you did in a day, a week or a month (src/you/recap.ts),
  // counted again at most every minute; Write it up asks Claude Code with no
  // tools, only when you click it.
  const RECAP_EVERY_MS = 60_000
  const recaps = new Map<string, { view: RecapView; at: number }>()
  const periodOf = (value: unknown): RecapPeriod | undefined =>
    RECAP_PERIODS.find((period) => period === value)
  const recapRuns = (since: Date) =>
    reader
      .list({ kind: 'mention', limit: 1000 })
      .filter(
        (run) => Date.parse(run.startedAt) >= since.getTime() - 86_400_000
      )
      .map((run) => ({
        at: run.startedAt,
        label: run.conversationLabel,
        request: run.request,
      }))
  const countRecapNow = async (period: RecapPeriod, key: string) => {
    // The areas the recap puts work in are the ones You shows.
    if (!you) await countYouNow().catch(() => undefined)
    const counted = await countRecap({
      dataDir,
      home: homedir(),
      period,
      key,
      runs: recapRuns,
    })
    if (counted)
      recaps.set(`${period}:${key}`, { view: counted.view, at: Date.now() })
    return counted
  }
  ipcMain.handle(
    'pacenote:recap:get',
    async (event, period: unknown, key: unknown) => {
      const which = periodOf(period)
      if (!fromMainWindow(event) || !which) return null
      const at =
        typeof key === 'string' && periodRange(which, key)
          ? key
          : periodKey(which, new Date())
      const kept = recaps.get(`${which}:${at}`)
      if (kept && Date.now() - kept.at < RECAP_EVERY_MS) return kept.view
      return (await countRecapNow(which, at))?.view ?? null
    }
  )
  ipcMain.handle(
    'pacenote:recap:write',
    async (event, period: unknown, key: unknown) => {
      const which = periodOf(period)
      if (!fromMainWindow(event) || !which || typeof key !== 'string')
        return { error: 'Not a recap.' }
      const counted = await countRecapNow(which, key)
      if (!counted) return { error: 'Not a recap.' }
      const { view, commits } = counted
      if (view.areas.length === 0)
        return { error: 'There is nothing to write up yet.' }
      const result = await writeRecap({
        bin: env().CLAUDE_BIN?.trim() || 'claude',
        toolPath: toolPath(),
        cwd: dataDir,
        prompt: recapPrompt(view, periodWords(view), commits),
      })
      // Spent whether it wrote or not, for the Overview's tokens
      if (result.usage)
        keepRecapSpend(dataDir, {
          at: new Date().toISOString(),
          usage: result.usage,
        })
      if ('error' in result) {
        log.warn(`Could not write up the recap of ${key}: ${result.error}`)
        return { error: result.error }
      }
      keepWritten(dataDir, which, key, {
        text: result.text,
        at: new Date().toISOString(),
        by: 'claude',
      })
      return { view: (await countRecapNow(which, key))?.view }
    }
  )
  // The Overview's tasks: what you handled over the last 14 days
  ipcMain.handle('pacenote:tasks:trend', (event) => {
    if (!fromMainWindow(event)) return null
    const current = tasksSettings()
    if (!current.on) return null
    const view = tasksView(dataDir, current.exclude)
    return taskTrend(view.tasks, readWork(dataDir).entries)
  })
  // What AI tools are doing with your tasks now, over MCP
  ipcMain.handle('pacenote:tasks:live', (event) => {
    if (!fromMainWindow(event) || !tasksSettings().on) return null
    return liveTasks(readActivity(dataDir))
  })
  // An AI tool works on your tasks in a process of its own: the screens hear
  // of each change at once rather than at their next refresh.
  stopTasksWatch = watchTasks(dataDir, () =>
    mainWindow?.webContents.send('pacenote:tasks:changed')
  )
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
  // A collection signed out: claude auth login, in your terminal
  ipcMain.handle('pacenote:tasks:sign-in', async (event) => {
    if (!fromMainWindow(event)) return undefined
    try {
      await signInClaude(handoff())
      return {}
    } catch (error) {
      return { error: (error as Error).message }
    }
  })
  // Sessions you started yourself, from Claude Code's and Codex's logs on
  // this Mac (Settings > Todo > Show sessions you start yourself): linked to
  // the task they worked on, or suggested for you to say, at most every 30
  // seconds and never two passes at once (session-links.ts).
  // End-to-end tests look more often (PACENOTE_TASKS_LINK_MS).
  const LINK_EVERY_MS = Number(process.env.PACENOTE_TASKS_LINK_MS) || 30_000
  const sessionIndex = new SessionIndex({ home: homedir() })
  const repoLookup = new RepoLookup()
  const linkingOn = () =>
    env().TASKS === 'on' && env().TASKS_LINK_SESSIONS === 'on'
  let linking: Promise<void> | undefined
  let linkedAt = 0
  let linkAgain = false
  const linkSessionsSoon = (force = false): void => {
    if (!linkingOn()) return
    if (linking) {
      linkAgain ||= force
      return
    }
    if (!force && Date.now() - linkedAt < LINK_EVERY_MS) return
    linking = (async () => {
      await sessionIndex.refresh()
      const sessions = sessionIndex
        .sessions()
        .filter((s) => yourFolder(homedir(), s.cwd, [dataDir]))
      const repos = await repoLookup.all(sessions.map((s) => s.cwd))
      const tasks = allTaskViews(dataDir)
      const open = new Set(
        tasks.filter((t) => t.status === 'open').map((t) => t.id)
      )
      const result = linkSessions({
        tasks,
        work: readWork(dataDir),
        sessions,
        repos,
      })
      changeWork(dataDir, (file) => {
        const known = new Set(
          file.entries.flatMap((e) =>
            e.kind === 'session' && e.session ? [e.session] : []
          )
        )
        const found = result.found.filter((e) => !known.has(e.session!))
        for (const e of found) known.add(e.session!)
        const ids = new Map(result.opened.map((o) => [o.entry, o.session]))
        return {
          ...file,
          entries: [
            ...file.entries.map((e) =>
              e.kind === 'session' && !e.session && ids.has(e.id)
                ? { ...e, session: ids.get(e.id) }
                : e
            ),
            ...found,
          ],
          // Still asked: for an open task, and not linked since
          suggested: [...(file.suggested ?? []), ...result.suggested].filter(
            (s) => open.has(s.task) && !known.has(s.session!)
          ),
        }
      })
      if (result.found.length || result.suggested.length)
        log.info(
          `Sessions: ${result.found.length} linked to tasks, ${result.suggested.length} suggested`
        )
    })()
      .catch((error: Error) =>
        log.warn(`Could not read the sessions' logs: ${error.message}`)
      )
      .finally(() => {
        linking = undefined
        linkedAt = Date.now()
        if (linkAgain) {
          linkAgain = false
          linkSessionsSoon(true)
        }
      })
  }
  /** A session's last activity and the branch it was on last, from its log */
  const sessionNow = (
    entry: Pick<Session, 'session' | 'tool' | 'startedAt'>
  ): { lastActiveAt?: string; branch?: string } => {
    const summary = entry.session
      ? sessionIndex.session(entry.session)
      : undefined
    if (summary)
      return {
        lastActiveAt: summary.lastAt,
        branch:
          summary.branch && isTaskBranch(summary.branch)
            ? summary.branch
            : undefined,
      }
    return {
      lastActiveAt: lastActive(homedir(), entry as Session),
    }
  }
  // A task whose latest session went quiet: whether it looks done
  // (done-watch.ts), a pass at a time, while Todo is open. End-to-end tests
  // wait less (PACENOTE_TASKS_QUIET_MS).
  const QUIET = Number(process.env.PACENOTE_TASKS_QUIET_MS) || QUIET_MS
  let judging: Promise<void> | undefined
  let judgedAt = 0
  const judgeSoon = (): void => {
    if (env().TASKS !== 'on' || env().TASKS_SUGGEST_DONE !== 'on') return
    if (judging || Date.now() - judgedAt < Math.min(LINK_EVERY_MS, QUIET))
      return
    judging = (async () => {
      const due = dueForJudging({
        tasks: allTaskViews(dataDir),
        work: readWork(dataDir),
        activeAt: (entry) => sessionNow(entry).lastActiveAt,
        now: Date.now(),
        quietMs: QUIET,
      })
      for (const { task, entry, activeAt } of due) {
        const file = sessionFile(homedir(), entry)
        const items = file ? readSessionLog(file, entry.tool) : []
        const pr = await pullRequestOf(
          task.repo,
          entry.branch ?? sessionNow(entry).branch,
          toolPath()
        )
        const result = items.length
          ? await judge({
              bin: env().CLAUDE_BIN?.trim() || 'claude',
              toolPath: toolPath(),
              cwd: dataDir,
              prompt: judgePrompt(task, items, pr),
            })
          : { error: 'its session has no log on this Mac' }
        // Kept either way, so the same quiet is not judged again.
        if ('error' in result)
          log.warn(
            `Could not tell whether ${task.id} looks done: ${result.error}`
          )
        else
          log.info(
            `Task ${task.id} ${result.done ? 'looks done' : 'is not done yet'}, from its ${entry.tool} session`
          )
        changeWork(dataDir, (work) => ({
          ...work,
          proposals: [
            ...(work.proposals ?? []).filter(
              (p) => !(p.task === task.id && p.session === entry.session)
            ),
            {
              task: task.id,
              tool: entry.tool,
              session: entry.session,
              activeAt,
              at: new Date().toISOString(),
              ...('error' in result ? { done: false } : result),
              ...(pr ? { pr } : {}),
            },
          ],
        }))
      }
    })()
      .catch((error: Error) =>
        log.warn(`Could not read the quiet sessions: ${error.message}`)
      )
      .finally(() => {
        judging = undefined
        judgedAt = Date.now()
      })
  }
  /** Each open task's latest session, for its row: the tool and when */
  const working = (tasks: { id: string }[]) => {
    const work = readWork(dataDir).entries
    const rows: Record<string, { tool: WorkTool; at: string }> = {}
    for (const task of tasks) {
      const latest = workFor(work, task.id).find(
        (e): e is Session => e.kind === 'session' && !!e.session
      )
      const at = latest && sessionNow(latest).lastActiveAt
      if (latest && at) rows[task.id] = { tool: latest.tool, at }
    }
    return rows
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
    linkSessionsSoon()
    const file = readWork(dataDir)
    const work = file.entries
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
              ...sessionNow(entry),
              resume: resumeCommand(entry),
            }
          : entry
      ),
      suggested: (file.suggested ?? [])
        .filter((s) => s.task === id)
        .map((s) => ({
          ...s,
          lastActiveAt: sessionNow(s).lastActiveAt,
        })),
      folder: task.repo ? repoFolder(dataDir, task.repo) : undefined,
      cli:
        env().TASKS_CLI === 'codex' ? ('codex' as const) : ('claude' as const),
    }
  }
  /** A session in a task's work log, or one suggested for it */
  const sessionEntry = (entryId: unknown): Session | undefined => {
    const file = readWork(dataDir)
    const entry =
      file.entries.find((e) => e.id === entryId) ??
      file.suggested?.find((s) => s.id === entryId)
    return entry?.kind === 'session' ? entry : undefined
  }
  ipcMain.handle('pacenote:tasks:detail', (event, id: unknown) =>
    fromMainWindow(event) && typeof id === 'string' ? taskDetail(id) : null
  )
  // What a task's quiet session looked like: close the task with how it
  // ended, or not yet; or keep a thing left after it as a task
  const proposalOf = (id: string) =>
    openProposals(readWork(dataDir), new Set([id]))[id]
  const answered = (id: string, change: (p: Proposal) => Proposal) =>
    changeWork(dataDir, (work) => ({
      ...work,
      proposals: (work.proposals ?? []).map((p) =>
        p.task === id && !p.answer ? change(p) : p
      ),
    }))
  ipcMain.handle(
    'pacenote:tasks:answer-proposal',
    (event, id: unknown, answer: unknown) => {
      if (!fromMainWindow(event) || typeof id !== 'string') return undefined
      const proposal = proposalOf(id)
      if (!proposal) return { error: 'There is nothing to answer.' }
      if (answer === 'close') {
        // Done in its session; how it ended is the wrap-up, not a note too
        closeTask(dataDir, id, 'resolved', new Date(), {
          by: proposal.tool === 'claude' ? 'claude-code' : 'codex',
          wrapUp: proposal.summary,
        })
        answered(id, (p) => ({ ...p, answer: 'closed' }))
      } else answered(id, (p) => ({ ...p, answer: 'not-yet' }))
      return {}
    }
  )
  ipcMain.handle(
    'pacenote:tasks:keep-left',
    (event, id: unknown, text: unknown) => {
      if (!fromMainWindow(event) || typeof id !== 'string') return undefined
      if (typeof text !== 'string' || !text.trim()) return undefined
      const result = addFollowUp(
        dataDir,
        { title: text, why: 'Left after it, from its session', after: id },
        { addedBy: 'pacenote' }
      )
      if ('error' in result) return result
      answered(id, (p) => ({
        ...p,
        left: (p.left ?? []).filter((item) => item !== text),
      }))
      return { id: result.task.id }
    }
  )
  // A suggested session: yours for the task, or not
  ipcMain.handle(
    'pacenote:tasks:answer-suggestion',
    (event, entryId: unknown, yes: unknown) => {
      if (!fromMainWindow(event) || typeof entryId !== 'string') return
      answerSuggestion(dataDir, entryId, yes === true)
      // A session that is the task's lends it its branch: look again.
      linkSessionsSoon(true)
    }
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
        launch: {
          command,
          args,
          env: { ...launchEnv, PACENOTE_MCP_FROM_APP: '1' },
        },
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
  ipcMain.handle('pacenote:settings:reveal-file', (event) => {
    if (fromMainWindow(event)) shell.showItemInFolder(settingsFile)
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
  ipcMain.handle('pacenote:sandbox:login', (event, cli: unknown) =>
    fromMainWindow(event)
      ? sandboxSignIn.run(cli)
      : { ok: false, error: 'Not allowed.' }
  )
  ipcMain.handle('pacenote:sandbox:login-code', (event, code: unknown) => {
    if (fromMainWindow(event)) sandboxSignIn.submit(code)
  })
  ipcMain.handle('pacenote:sandbox:login-cancel', (event) => {
    if (fromMainWindow(event)) sandboxSignIn.cancel()
  })
  ipcMain.handle('pacenote:sandbox:sign-out', (event, cli: unknown) => {
    if (fromMainWindow(event)) sandboxSignIn.signOut(cli)
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
  // Opened again: usually to show the window, or after an upgrade put a new
  // version in this one's place, which this copy then restarts into.
  app.on('second-instance', () => {
    if (!bundleWatch?.check()) showMainWindow()
  })
  app
    .whenReady()
    .then(async () => {
      registerAppProtocol()
      registerBotIpc()
      // Opened only to be told to quit (see before-quit): no tray, window or
      // Pace for the moment it lasts. Opened from a bundle already replaced:
      // straight on to the new version.
      if (isQuitting || bundleWatch?.check()) return
      bundleWatch?.start()
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
 *
 * Homebrew opens the new version only for an app gone within 10 seconds. One
 * that takes longer (Pace finishing a request) finds the new version on disk
 * once Pace has stopped, and opens it itself (reopenIfReplaced).
 */
app.on('before-quit', (event) => {
  isQuitting = true
  bundleWatch?.stop()
  stopTasksWatch?.()
  taskCollector.cancel()
  void stopClaim()
  supervisor?.dispose()
  // A bot started by the app finishes active requests before it stops. (up to
  // 30 seconds)
  if (supervisor?.managing && !botStopped) {
    event.preventDefault()
    tray?.setToolTip(`${appName} - Pace: Stopping`)
    botStopping ??= supervisor
      .stop()
      .then(reopenIfReplaced)
      .finally(() => {
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
