import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  shell,
} from 'electron'
import { HistoryReader } from '../../../src/history/reader.js'
import { HistoryStore } from '../../../src/history/recorder.js'
import { consoleSink, createLogger, fileSink } from '../../../src/logger.js'
import {
  DESKTOP_LOG_FILE,
  LOG_FILE,
  readBotStatus,
} from '../../../src/runtime/status.js'
import type { BotStatus, LoginItemState } from '../../../src/runtime/types.js'
import { secretValues } from '../../../src/settings/fields.js'
import {
  defaultHome,
  securePrivateDir,
  securePrivateFile,
} from '../../../src/settings/home.js'
import { settingsFilePath, vmRootPath } from '../../../src/settings/paths.js'
import {
  dropClaudeToken,
  moveEnvSettings,
  upgradeSettings,
  readSettingsValues,
} from '../../../src/settings/settings-file.js'
import { BotSupervisor } from './bot.js'
import { isLocale, localized, setLocale } from '../../../src/i18n/locale.js'
import { DESKTOP_PREFS_FILE } from '../../../src/i18n/user.js'
import { setAppMenu } from './app-menu.js'
import { text } from './main.text.js'
import {
  readLanguage,
  readPrefs,
  resolveLanguage,
  writePrefs,
  type LanguageState,
} from './language.js'
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
import {
  collectionRow,
  latestCollection,
} from '../../../src/tasks/collections.js'
import type {
  CollectionRecord,
  TasksCollect,
} from '../../../src/tasks/types.js'
import { KeepAwake } from './keep-awake.js'
import { DeviceAnswers } from './device-answers.js'
import { DeviceAsks } from '../../../src/macs/asks.js'
import { Macs } from '../../../src/macs/macs.js'
import { SetupFromMac } from '../../../src/macs/setup.js'
import { macsKey } from '../../../src/macs/channel.js'
import { SETUP_KEYS, TODO_SETUP_KEYS } from '../../../src/macs/types.js'
import { TodoSync } from '../../../src/macs/todo-sync.js'
import { MacUseWatch, macName } from './macs.js'
import { appMcpLaunch, McpClients, mcpLaunch } from './mcp-clients.js'
import { recordCollection, TaskCollector } from './task-collector.js'
import { codexDefaults, writeOpencodeConfig, type Bins } from './headless.js'
import { OwnAi } from './own-ai.js'
import { isOwnCli, type OwnCli } from '../../../src/tasks/own-ai.js'
import { watchTasks } from './tasks-watch.js'
import { HubPairing } from './hub-pairing.js'
import { HubInstall } from './hub-install.js'
import { OpencodeSessions } from './opencode-sessions.js'
import { hubFromLink } from '../../../src/hub/install.js'
import { SandboxSignIn } from './sandbox-login.js'
import { SettingsStore } from './settings.js'
import { SetupStore } from './setup.js'
import { BundleWatch } from './bundle-watch.js'
import { markQuit, QUIT_MARK_FILE, quitWithin } from './quit-mark.js'
import { createScreenFiles } from './screen.js'
import { TrayMenu, truncateLabel } from './tray.js'
import { MainWindow } from './window.js'
import type { Desktop } from './ipc/context.js'
import { Ipc } from './ipc/gate.js'
import { registerMacsIpc } from './ipc/macs.js'
import { registerSandboxIpc } from './ipc/sandbox.js'
import { registerSettingsIpc } from './ipc/settings.js'
import { registerSetupIpc } from './ipc/setup.js'
import { registerTaskWorkIpc } from './ipc/task-work.js'
import { registerTasksIpc } from './ipc/tasks.js'
import { registerYouIpc } from './ipc/you.js'
import { SetupClaim } from './setup-claim.js'
import { taskSessions } from './task-sessions.js'
import { todoSettings } from './todo-settings.js'
import { setupProblem } from './bot-readiness.js'
import { hostEnv } from '../../../src/sandbox/host.js'
import { signedIn } from '../../../src/sandbox/vm-login.js'

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
// End-to-end tests put a copy of the UI in its place
// (PACENOTE_DESKTOP_WEB_DIST).
const webDistDir = process.env.PACENOTE_DESKTOP_WEB_DIST || paths.webDist
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
 * as Pace reads them now, and those an earlier version left out are filled in
 * as it worked (upgradeSettings). A claude token set by hand goes once Claude
 * is signed in inside the sandbox (dropClaudeToken).
 */
const moved = (() => {
  try {
    return {
      notes: [
        ...moveEnvSettings(settingsFile),
        ...upgradeSettings(settingsFile),
        ...dropClaudeToken(
          settingsFile,
          signedIn(vmRootPath(process.env), 'claude')
        ),
      ],
    }
  } catch (err) {
    return { notes: [], error: (err as Error).message }
  }
})()
const dataDir = resolveDataDir()
securePrivateDir(dataDir)
securePrivateFile(settingsFile)
/** The app's own preferences: whether Pace starts with it, its language */
const prefsFile = path.join(dataDir, DESKTOP_PREFS_FILE)
/**
 * The app's language: the one chosen in Settings, or macOS's. Its tray, menus,
 * notifications and window follow it, and Pace is told it when it starts.
 */
let language: LanguageState = resolveLanguage(
  readLanguage(prefsFile),
  app.getPreferredSystemLanguages()
)
setLocale(language.locale)
// Kept for the processes the app does not start, such as Pacenote's MCP
// server in Claude Code, so what their AI writes is in it too
// (src/i18n/user.ts)
writePrefs(prefsFile, { locale: language.locale })
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
/** Opens the app again once this copy is gone, once however asked */
function relaunch(why: string): void {
  if (restarting) return
  restarting = true
  log.info(why)
  if (process.env.PACENOTE_DESKTOP_NO_RELAUNCH !== '1') app.relaunch()
}
/** Opens the version on disk once this copy is gone */
function restartInto(version: string): void {
  relaunch(`The app on disk is ${version} now; restarting into it`)
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
/** The screen's files and the /api beside them, answered on pacenote://app */
const screenFiles = createScreenFiles({ webDistDir, webDevUrl, reader, log })
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
/** The window and the screen it loads (window.ts) */
const mainWindow = new MainWindow({
  appName,
  icon: appIcon,
  preload: path.join(distDir, 'preload.cjs'),
  dev: !app.isPackaged,
  webDevUrl,
  probe: () => screenFiles.probe(),
  quitting: () => isQuitting,
  restarting: () => restarting || (bundleWatch?.check() ?? false),
  passing: () => bundleWatch?.swapping() ?? false,
  reopen: () => relaunch('Opened while quitting; opening again once gone'),
  capture: captureFile
    ? {
        width: Number(process.env.PACENOTE_DESKTOP_CAPTURE_WIDTH),
        height: Number(process.env.PACENOTE_DESKTOP_CAPTURE_HEIGHT),
        save: (window) => capture(window, captureFile),
      }
    : undefined,
  log,
})
let trayMenu: TrayMenu | undefined
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
const settings = new SettingsStore({ settingsFile, dataDir, env: process.env })
const hubPairing = new HubPairing(settings)
/**
 * A team hub installed from Settings: Pace switches to it as soon as it
 * answers (docs/team-hub.md)
 */
const hubInstall = new HubInstall({
  settings,
  version: app.getVersion(),
  apply: () => applySettings(),
  onChange: (state) => {
    log.info(
      `Hub install: ${state.step}${'url' in state ? ` (${state.url})` : ''}`
    )
    mainWindow.send('pacenote:hub:install-changed', state)
  },
})
/** The hub a pacenote:// link opened, until the window takes it */
let linkedHub: string | undefined
/**
 * pacenote://hub/connect?url=... from the hub's installer, or from the join
 * page a teammate's share link opens (src/hub/share.ts): Pacenote opens on
 * that hub, which it switches to if it was waiting for it, and otherwise only
 * offers to connect. A link changes nothing by itself.
 */
function openLink(link: string): void {
  const url = hubFromLink(link)
  if (!url) {
    log.warn(`Not a link Pacenote opens: ${link.slice(0, 120)}`)
    return
  }
  log.info(`Opened from a link to the hub at ${url}`)
  linkedHub = url
  void hubInstall.check(url)
  if (!app.isReady()) return
  // Settings takes it, or setup where it is
  mainWindow.show(setup.view().open ? undefined : '#/settings/messengers')
  mainWindow.send('pacenote:hub:linked')
}
// Before ready: a link that opened the app comes before it is
app.on('open-url', (event, link) => {
  event.preventDefault()
  openLink(link)
})
/**
 * The first-run wizard's progress. A Pacenote that could already start Pace,
 * or has answered, was set up before the wizard and never opens on it.
 */
const setup = new SetupStore(dataDir, () => ({
  configured: setupProblem(settings.effectiveEnv()) === undefined,
  answered: reader.list({ kind: 'mention', limit: 1 }).length > 0,
}))
/**
 * A Pacenote nothing was set up in yet, Pace or Todo: it opens on Todo's
 * first run (#/start), with Pace off until it is set up from Settings. One
 * part way through Pace's setup (a Slack step saved) goes on with that.
 */
const firstRun = (): boolean => {
  const { open, record } = setup.view()
  return (
    open &&
    record.step === 'ai' &&
    !record.slack &&
    !record.me &&
    !record.fromMac
  )
}
/**
 * The screen the window opens on: Todo when it is on, unless you chose
 * Overview (desktop.json's landing), else Overview as before
 */
const landing = (): string =>
  settings.effectiveEnv().TASKS === 'on' &&
  readPrefs(prefsFile).landing !== 'overview'
    ? '#/tasks'
    : ''
/**
 * Settings > Sandbox "Sign in to Claude" or "Codex": the CLI signs in inside a
 * VM itself; its link and code go to the screen as they come
 */
const sandboxSignIn = new SandboxSignIn({
  env: process.env,
  onPrompt: (prompt) =>
    mainWindow.send('pacenote:sandbox:login-prompt', prompt),
})

/** Adds the MCP server to Claude Code and Codex, and checks they reach it */
const mcpClients = new McpClients({
  launch: () => mcpLaunch(paths.historyMcp),
  toolPath,
})

/**
 * Pacenote's own work (Collect now, Looks done, Write it up, reply drafts):
 * the CLI chosen in Settings > Todo, and the other one when it cannot
 */
const ownAi = new OwnAi({
  dataDir,
  chosen: () => {
    const chosen = settings.effectiveEnv().TASKS_AI
    return isOwnCli(chosen) ? chosen : 'claude'
  },
  fallback: () => settings.effectiveEnv().TASKS_AI_FALLBACK !== 'off',
  onChange: () => mainWindow.send('pacenote:tasks:changed'),
})
/**
 * opencode's run for Pacenote's own work: Pacenote's config (written once, in
 * the data folder) and the model chosen in Settings > Todo
 */
let opencodeConfigFile: string | undefined
const opencodeRun = () => {
  opencodeConfigFile ??= writeOpencodeConfig(dataDir)
  const model = settings.effectiveEnv().TASKS_AI_OPENCODE_MODEL?.trim()
  return { config: opencodeConfigFile, ...(model ? { model } : {}) }
}
/** The CLIs' commands on this Mac */
const cliBins = (): Bins => {
  const env = settings.effectiveEnv()
  return {
    claude: env.CLAUDE_BIN?.trim() || 'claude',
    codex: env.CODEX_BIN?.trim() || 'codex',
    opencode: env.OPENCODE_BIN?.trim() || 'opencode',
  }
}
/**
 * opencode's sessions for the tasks continued in it, asked of its CLI in the
 * background while Todo is open
 */
const opencodeSessions = new OpencodeSessions({
  bin: () => cliBins().opencode,
  env: () => ({ ...hostEnv(process.env), PATH: toolPath() }),
})
/** How Pacenote's own work runs a CLI on this Mac */
const ownWork = (cli: OwnCli) => ({
  cli,
  bin: cliBins()[cli],
  codex: codexDefaults(process.env),
  toolPath: toolPath(),
  cwd: dataDir,
})

/** Collect now on the Todo screen: the AI reads Slack, read only */
const taskCollector = new TaskCollector({
  launch: () => appMcpLaunch(paths.historyMcp),
  toolPath,
  cwd: dataDir,
  ai: ownAi,
  bins: cliBins,
  codex: () => codexDefaults(process.env),
  recorder: (startedAt, cli) => recordCollection(history, startedAt, cli),
  last: latestCollection(dataDir, collectionRuns(90)),
})

/**
 * Collect now as Todo shows it: this Mac's, or one another of your Macs ran
 * since, or runs now. collections: the last days', newest first
 */
function collectState(collections: CollectionRecord[]): TasksCollect {
  const state = taskCollector.state
  if (state.running) return state
  const elsewhere = macs?.view().macs.find((mac) => !mac.here && mac.collecting)
  const latest = collections[0]
  const last =
    latest?.mac &&
    (!state.last || Date.parse(latest.at) > Date.parse(state.last.at))
      ? latest
      : state.last
  return {
    ...state,
    ...(last ? { last } : {}),
    ...(elsewhere?.collecting
      ? { elsewhere: { name: elsewhere.name, since: elsewhere.collecting } }
      : {}),
  }
}

/** Sandbox status, allowed domains, apply jobs */
const sandbox = new SandboxService({
  sandboxDir: paths.sandboxDir,
  jobRunner: paths.jobRunner,
  settingsFile,
  dataDir,
  env: process.env,
  toolPath,
})

/** Your Macs: whether Pace answers here or on another of them (macs.ts) */
let macs: Macs | undefined
/** How this Mac is used, once the app is ready (powerMonitor) */
let macUse: MacUseWatch | undefined
/** Your Todo, the same on your other Macs */
let todoSync: TodoSync | undefined
/** What your devices ask this Mac: its screens' own answers (asks.ts) */
let deviceAsks: DeviceAsks | undefined
/**
 * The screens' bridge, by channel: what each answers the window, which a
 * device of yours is answered by too (device-answers.ts, DEVICE_ASKS)
 */
const deviceAnswers = new DeviceAnswers({
  reader,
  peerName: (peer) =>
    macs?.view().devices.find((device) => device.id === peer)?.name ?? peer,
  log: (message) => log.info(message),
})
/** Setup's Connect to your other Mac: this Mac set up from another */
let fromMac: SetupFromMac | undefined

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
      standby: () => macs?.answers === false,
    })
  : undefined

/**
 * New settings take effect only after Pace restarts: it restarts, or a
 * stopped one starts fresh. False when Pace is not this app's to start.
 */
async function applySettings(): Promise<boolean> {
  if (!supervisor) return false
  const phase = supervisor.current.phase
  if (phase === 'running' || phase === 'starting') await supervisor.restart()
  else if (['idle', 'setup', 'failed', 'crashed'].includes(phase))
    await supervisor.start()
  else return false
  return true
}

/** Setup listening for "@Pace it's me" on your own Slack app */
const setupClaim = new SetupClaim({
  settings,
  setup,
  supervisor,
  window: mainWindow,
  log,
})

if (supervisor) {
  macs = new Macs({
    dataDir,
    // Your own Slack app's token, which your Macs know each other by; none
    // with the team hub
    appToken: () => {
      const values = settings.fileValues()
      return values.HUB_URL ? undefined : values.SLACK_APP_TOKEN || undefined
    },
    // End-to-end tests name their two Macs
    name: process.env.PACENOTE_MACS_NAME || macName(),
    version: app.getVersion(),
    use: () => macUse?.current() ?? { idle: 0, locked: false, asleep: false },
    pace: () => {
      const view = readBotStatus(dataDir)
      const status = view.alive ? view.status : undefined
      return {
        ready: status?.state === 'running',
        answering:
          status?.state === 'running' &&
          !status.standby &&
          status.socket.state === 'connected',
        ...(status?.reasoner ? { reasoner: status.reasoner } : {}),
      }
    },
    onAnswer: (here) => supervisor.answer(here),
    // When Collect now started here, while it runs
    collecting: () => taskCollector.state.running?.startedAt,
    // Add a device: your Slack app, who Pace answers and how Todo collects
    setupPayload: () => {
      const env = settings.effectiveEnv()
      const values: Record<string, string> = {}
      for (const key of SETUP_KEYS) {
        const value = env[key]?.trim()
        if (value) values[key] = value
      }
      const me = setup.view().record.me
      return { values, ...(me ? { me } : {}) }
    },
    log: (message) => log.info(message),
    bonjour: process.env.PACENOTE_MACS_BONJOUR !== 'off',
    ...(process.env.PACENOTE_MACS_PORT
      ? { port: Number(process.env.PACENOTE_MACS_PORT) }
      : {}),
  })
  macs.on('change', () => {
    mainWindow.send('pacenote:macs:changed', macs?.view())
    // Todo says when another Mac collects
    mainWindow.send('pacenote:tasks:changed')
  })
  const thisMac = macs
  fromMac = new SetupFromMac({
    me: () => ({
      id: thisMac.id,
      name: process.env.PACENOTE_MACS_NAME || macName(),
    }),
    // What your other Mac sent, as this Mac's setup takes it (FromMacMode):
    // Pace's its Slack app, who Pace answers and how Todo collects; Todo's
    // first run how Todo collects; a Mac set up already the key alone. This
    // Mac's own choices stay as they are.
    apply: async (payload, from, mode) => {
      if (mode !== 'pace') {
        // The key your Macs know each other by; from Pacenote before 0.6.13,
        // the one its Slack app's token makes
        const token = payload.values.SLACK_APP_TOKEN
        const group =
          payload.group ?? (token ? macsKey(token).toString('base64') : '')
        if (!(await thisMac.joinGroup(group)))
          throw new Error(localized(text).noKeyToShare(from.name))
        if (mode === 'todo') {
          const values: Record<string, string> = {}
          for (const key of TODO_SETUP_KEYS) {
            const value = payload.values[key]
            if (typeof value === 'string') values[key] = value
          }
          const issues = settings.save({ ...values, TASKS: 'on' })
          if (issues.length > 0)
            throw new Error(issues.map((issue) => issue.message).join(' '))
        }
        await thisMac.setFollow(true)
        if (from.address) thisMac.addAddress(from.address)
        return
      }
      const values: Record<string, string> = {}
      for (const key of SETUP_KEYS) {
        const value = payload.values[key]
        if (typeof value === 'string') values[key] = value
      }
      if (!values.SLACK_APP_TOKEN || !values.SLACK_BOT_TOKEN)
        throw new Error(localized(text).noSlackAppToShare(from.name))
      const issues = settings.save(values)
      if (issues.length > 0)
        throw new Error(issues.map((issue) => issue.message).join(' '))
      // The key your Macs know each other by, kept only when it is not your
      // Slack app's own (saved just now): Add a device made it on a Mac with no
      // Slack app of its own
      if (payload.group) await thisMac.joinGroup(payload.group)
      const owner = (values.MENTION_ALLOWED_USERS ?? '').split(/[\s,]+/)[0]
      const me = payload.me ?? (owner ? { id: owner, name: owner } : undefined)
      setup.save({
        slack: 'app',
        step: 'review',
        fromMac: from.name,
        ...(me ? { me } : {}),
      })
      await thisMac.setFollow(true)
      if (from.address) thisMac.addAddress(from.address)
      // This is the Mac in use: Pace moves here once it runs
      thisMac.claimWhenReady()
    },
    log: (message) => log.info(message),
    bonjour: process.env.PACENOTE_MACS_BONJOUR !== 'off',
  })
  fromMac.on('change', (state) =>
    mainWindow.send('pacenote:setup:mac-changed', state)
  )
  todoSync = new TodoSync({
    dataDir,
    macs,
    // This Mac's own collections lately, from its runs
    collections: () =>
      collectionRuns(7).flatMap((run) => collectionRow(run) ?? []),
    log: (message) => log.info(message),
    changed: () => mainWindow.send('pacenote:tasks:changed'),
  })
  deviceAsks = new DeviceAsks({
    macs,
    answer: (what, args, peer) => deviceAnswers.answer(what, args, peer),
    log: (message) => log.info(message),
  })
  // Pace started or stopped here: the others hear of it at once.
  let phase = supervisor.current.phase
  supervisor.on('change', (state) => {
    if (state.phase === phase) return
    phase = state.phase
    macs?.refresh()
  })
}

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

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

function botSummary(): {
  label: string
  active: number
  status: BotStatus | undefined
} {
  const t = localized(text)
  const view = readBotStatus(dataDir)
  const status = view.alive ? view.status : undefined
  const phase = supervisor?.current.phase
  let label = t.phase[phase ?? (status ? 'running' : 'idle')]
  if (supervisor?.current.off && phase === 'idle') label = t.off
  if (supervisor?.current.retryAt !== undefined) label = t.retrying(label)
  const running = status?.state === 'running'
  if (running && status.standby) label = t.standingBy
  else if (running && status.socket.state !== 'connected')
    label = t.socket(status.socket.state === 'reconnecting')
  else if (running && (phase === 'running' || phase === 'external'))
    label = t.connected(phase === 'external', status.reasoner ?? '?')
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
  if (fresh.length === 0 || mainWindow.isFocused()) return
  if (!Notification.isSupported()) return
  for (const trouble of fresh) {
    log.info(`Notifying: ${trouble.title}: ${trouble.body}`)
    const notice = new Notification({
      title: trouble.title,
      body: trouble.body,
    })
    notice.on('click', () => mainWindow.show(trouble.route))
    // macOS shows notifications only for a signed app (an unsigned
    // development build gets this) and only once notifications are allowed
    notice.on('failed', (_event, error) =>
      log.warn(`Could not show a notification: ${error}`)
    )
    notice.show()
  }
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

/** Every 2 seconds: the menu bar item, and keeping the Mac awake */
function updateTray(): void {
  const summary = botSummary()
  keepAwake.set(summary.active > 0)
  // Pace's Slack connection as your Macs decided, told again until it is
  if (
    macs &&
    supervisor?.managing &&
    summary.status?.state === 'running' &&
    Boolean(summary.status.standby) === macs.answers
  )
    supervisor.answer(macs.answers)
  const troubles = supervisor
    ? currentTroubles(supervisor.current, summary.status)
    : []
  tellTroubles(troubles, summary.status !== undefined)
  if (!trayMenu) return
  // What the status line does not say already
  const notes = troubles
    .filter((trouble) => trouble.key !== 'exit' && trouble.key !== 'setup')
    .map((trouble) =>
      trouble.key === 'socket' ? trouble.title : truncateLabel(trouble.body)
    )
  trayMenu.refresh(summary, notes, troubles.length)
}

function createTray(): void {
  // If tray@2x.png is in the same directory, Retina displays use it
  // automatically.
  trayMenu = new TrayMenu({
    appName,
    iconPath: path.join(distDir, 'tray.png'),
    dev: !app.isPackaged,
    words: () => localized(text),
    bot: () => supervisor?.current,
    setupOpen: () => setup.view().open,
    update: () =>
      updates?.current.available ? updates.current.latest?.version : undefined,
    openWindow: (route) => mainWindow.show(route),
    startBot: () => void supervisor?.start(),
    restartBot: () => void supervisor?.restart(),
    openSettings: (route) => mainWindow.show(route),
    quit: () => app.quit(),
  })
  trayMenu.create()
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
      os: `${process.platform === 'darwin' ? 'macOS' : process.platform} ${process.getSystemVersion()}`,
      arch: process.arch,
    },
    supervisor: supervisor?.current,
    bot: readBotStatus(dataDir),
    settings: settings.fileValues(),
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

/**
 * The app's IPC: the main window's asks, and your devices' (DeviceAnswers),
 * each area's in ipc/; what stays here runs Pace, the app and its window.
 */
function registerIpc(): void {
  const ipc = new Ipc({
    window: mainWindow,
    devices: deviceAnswers,
    notAllowed: () => localized(text).notAllowed,
  })
  const desktop: Desktop = {
    dataDir,
    log,
    settings,
    window: mainWindow,
    reader,
    toolPath,
    cliBins,
    ownAi,
    ownWork,
    opencodeRun,
  }
  const handle = ipc.handle.bind(ipc)
  handle('pacenote:bot:state', null, () => supervisor?.current ?? null)
  handle('pacenote:bot:start', undefined, () => supervisor?.start())
  handle('pacenote:bot:stop', undefined, () => supervisor?.stop())
  handle('pacenote:bot:restart', undefined, (rebuild) =>
    supervisor?.restart({ rebuild: rebuild === true })
  )
  handle('pacenote:bot:auto-start', undefined, (value) => {
    if (typeof value === 'boolean') supervisor?.setAutoStart(value)
  })
  // Settings > General's Set up Pace, with Pace off: on again, and its setup
  // open where it got to (the window goes to #/setup)
  handle('pacenote:pace:set-up', undefined, () => {
    supervisor?.setOff(false)
    setup.save({ finished: false })
    // As at a start: it says what it needs until its setup is done
    if (supervisor?.current.autoStart && supervisor.current.phase === 'idle')
      void supervisor.start()
  })
  // The screen the window opens on, and whether you were told it is Todo now
  handle('pacenote:app:landing', null, () => {
    const prefs = readPrefs(prefsFile)
    return {
      landing: prefs.landing === 'overview' ? 'overview' : 'tasks',
      told: prefs.todoFirstTold === true,
    }
  })
  handle('pacenote:app:set-landing', undefined, (patch) => {
    const { landing: where, told } = (patch ?? {}) as Record<string, unknown>
    writePrefs(prefsFile, {
      ...(where === 'overview' || where === 'tasks'
        ? { landing: where === 'overview' ? 'overview' : undefined }
        : {}),
      ...(told === true ? { todoFirstTold: true } : {}),
    })
  })
  // The language, for the window's first paint (asked before it renders)
  ipcMain.on('pacenote:app:language', (event) => {
    event.returnValue = language
  })
  // Settings > General: the app's language, applied at once to the window,
  // the tray and the menus, and to Pace when it next starts
  ipcMain.handle('pacenote:app:set-language', (event, value: unknown) => {
    if (!ipc.fromWindow(event) || (value !== 'system' && !isLocale(value)))
      return language
    language = resolveLanguage(value, app.getPreferredSystemLanguages())
    writePrefs(prefsFile, {
      language: value === 'system' ? undefined : value,
      locale: language.locale,
    })
    setLocale(language.locale)
    setAppMenu(appName)
    trayMenu?.reset()
    updateTray()
    // The window takes it wherever it was set, as the end-to-end tests do
    mainWindow.send('pacenote:app:language-changed', language)
    return language
  })
  registerMacsIpc(ipc, () => macs)
  // The window's error screen reports what broke, for the log.
  handle('pacenote:app:report-error', undefined, (report) => {
    const { message, stack } = (report ?? {}) as {
      message?: unknown
      stack?: unknown
    }
    log.error(
      `The window hit an error: ${String(message).slice(0, 2_000)}${typeof stack === 'string' ? `\n${stack.slice(0, 8_000)}` : ''}`
    )
  })
  handle('pacenote:app:login-item', null, () => loginItem())
  handle('pacenote:app:set-login-item', null, (value) => {
    if (app.isPackaged && typeof value === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: value })
      log.info(`Open at login ${value ? 'on' : 'off'}`)
    }
    return loginItem()
  })
  handle('pacenote:app:open-login-items', undefined, () => {
    void shell.openExternal(
      'x-apple.systempreferences:com.apple.LoginItems-Settings.extension'
    )
  })
  handle('pacenote:app:diagnostics', null, () => diagnostics())
  handle('pacenote:bot:open-logs', undefined, () => {
    void shell.openPath(path.join(dataDir, 'logs'))
  })

  // Todo, a task's work, and You and Recap (ipc/)
  const todo = todoSettings(desktop)
  const sessions = taskSessions(desktop, opencodeSessions)
  registerTasksIpc(ipc, desktop, {
    todo,
    sessions,
    taskCollector,
    opencodeSessions,
    collectionRuns,
    collectState,
  })
  registerTaskWorkIpc(ipc, desktop, {
    todo,
    sessions,
    opencodeSessions,
    macs: () => macs,
    historyMcp: paths.historyMcp,
  })
  registerYouIpc(ipc, desktop)
  // An AI tool works on your tasks in a process of its own: the screens hear
  // of each change at once rather than at their next refresh.
  stopTasksWatch = watchTasks(dataDir, () =>
    mainWindow.send('pacenote:tasks:changed')
  )
  registerSettingsIpc(ipc, desktop, {
    settingsFile,
    applySettings,
    hubPairing,
    hubInstall,
    takeLinkedHub: () => {
      const url = linkedHub
      linkedHub = undefined
      return url
    },
    mcpClients,
    historyMcp: paths.historyMcp,
  })
  registerSetupIpc(ipc, desktop, { setup, setupClaim, fromMac: () => fromMac })
  registerSandboxIpc(ipc, desktop, {
    sandbox,
    sandboxSignIn,
    supervisor,
    settingsFile,
  })
  // The tray shows none of Pace's output, so a line it prints leaves the tray
  // be; the tray's timer still follows bot.json.
  const TRAY_FIELDS = [
    'phase',
    'message',
    'restarts',
    'retryAt',
    'issues',
  ] as const
  let last = supervisor?.current
  supervisor?.on('change', (state) => {
    mainWindow.send('pacenote:bot:changed', state)
    if (TRAY_FIELDS.some((key) => state[key] !== last?.[key])) updateTray()
    last = state
    // Pace takes the mentions from here on: setup stops listening for them.
    if (state.phase === 'starting' || state.phase === 'external')
      setupClaim.paceStarted(state.phase === 'external')
  })
  handle('pacenote:window:full-screen', false, () => mainWindow.isFullScreen())
  handle('pacenote:app:update', null, () => updates?.current ?? null)
  updates?.on('change', (state) => {
    mainWindow.send('pacenote:app:update-changed', state)
    updateTray()
  })
}

async function capture(window: BrowserWindow, file: string): Promise<void> {
  const hash = process.env.PACENOTE_DESKTOP_CAPTURE_HASH
  if (hash)
    await window.webContents.executeJavaScript(
      `location.hash = ${JSON.stringify(hash)}`
    )
  await sleep(Number(process.env.PACENOTE_DESKTOP_CAPTURE_DELAY) || 2_500)
  const image = await window.webContents.capturePage()
  writeFileSync(file, image.toPNG())
  isQuitting = true
  app.quit()
}

/**
 * Something the app starts with failed. No dialog: one would only end the app,
 * which could do nothing about it then. The log says why, and the app goes on
 * from where it got to, with its window, whose screen tries again while it
 * will not load (ScreenLoader). A copy told to quit as it started, or opened
 * from a bundle an upgrade is replacing, goes quietly, on to the new version
 * once the bundle on disk names one (waited for while it is being swapped).
 */
async function reportStartupError(error: unknown): Promise<void> {
  const message = errorText(error)
  const onDisk = await bundleWatch?.onDisk()
  const upgraded = bundleWatch !== undefined && onDisk !== app.getVersion()
  if (isQuitting || upgraded) {
    log.info(
      upgraded
        ? `An upgrade was replacing the app as it started: ${message}`
        : `Quitting as it started: ${message}`
    )
    if (onDisk && onDisk !== app.getVersion()) restartInto(onDisk)
    app.quit()
    return
  }
  log.error(`Could not start: ${message}`)
  openOnActivate()
  mainWindow.show()
}

/** When this copy last quit, for the next one to read (quit-mark.ts) */
const quitMark = path.join(dataDir, QUIT_MARK_FILE)
/** How soon after a quit a copy opened may be one opened to be handed a quit */
const OPENED_AGAIN_MS = 5_000
/** How long that copy waits for the quit before it starts */
const QUIT_REQUEST_WAIT_MS = 2_000

let opensOnActivate = false
/** From when the app has started, the Dock icon and opening it again show it */
function openOnActivate(): void {
  if (opensOnActivate) return
  opensOnActivate = true
  app.on('activate', () => mainWindow.show())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Opened again: usually to show the window, or after an upgrade put a new
  // version in this one's place, which this copy then restarts into.
  app.on('second-instance', () => {
    if (!bundleWatch?.check()) mainWindow.show()
  })
  app
    .whenReady()
    .then(async () => {
      screenFiles.registerAppProtocol()
      // pacenote:// links (the hub installer's, a teammate's share link's),
      // for this copy of the app
      if (app.isPackaged) app.setAsDefaultProtocolClient('pacenote')
      registerIpc()
      setAppMenu(appName)
      // Opened only to be told to quit (see before-quit): no tray, window or
      // Pace for the moment it lasts. Opened from a bundle already replaced:
      // straight on to the new version.
      if (isQuitting || bundleWatch?.check()) return
      // Opened moments after a copy quit: maybe to be handed a quit request
      // that found that copy gone, which comes only now that this one has
      // started. It waits a moment for one before it starts anything, so that
      // one ends it at once.
      if (quitWithin(quitMark, OPENED_AGAIN_MS)) {
        log.info(
          'Opened right after quitting; waiting a moment for a quit request'
        )
        await sleep(QUIT_REQUEST_WAIT_MS)
        if (isQuitting || bundleWatch?.check()) return
      }
      bundleWatch?.start()
      if (process.platform === 'darwin' && !app.isPackaged)
        app.dock?.setIcon(nativeImage.createFromPath(appIcon))
      if (!captureFile) createTray()
      // Your Macs first: whether Pace starts answering or standing by
      if (macs) {
        macUse = new MacUseWatch(
          powerMonitor,
          () => macs?.refresh(),
          process.env.PACENOTE_MACS_USE_FILE
        )
        await macs
          .start()
          .catch((err: unknown) =>
            log.warn(`Macs could not start: ${(err as Error).message}`)
          )
        todoSync?.start()
        deviceAsks?.start()
      }
      // A new install starts with Todo, and Pace off until it is set up.
      if (firstRun()) supervisor?.setOff(true)
      // The bot starts independently of the window and does not wait for it.
      if (supervisor?.current.autoStart && supervisor.current.phase === 'idle')
        void supervisor.start()
      // Opened at login, it stays in the menu bar until you open it.
      const atLogin =
        app.isPackaged && app.getLoginItemSettings().wasOpenedAtLogin
      // A test server answers at once; GitHub can wait for the app to settle.
      updates?.start(updateUrl ? 1_000 : 30_000)
      if (atLogin) log.info('Opened at login; the window waits')
      else
        await mainWindow.open(
          setup.view().open
            ? firstRun()
              ? '#/start'
              : '#/setup'
            : // Opened by a link from the hub's installer
              linkedHub
              ? '#/settings/messengers'
              : landing()
        )
      openOnActivate()
    })
    .catch(reportStartupError)
}

let botStopped = false
let botStopping: Promise<void> | undefined
/**
 * Homebrew quits the app before an upgrade by asking again and again until it
 * is gone. A request that finds the app gone makes macOS open it again to
 * hand it the request, which that copy gets only once it has started: opened
 * moments after a quit, it waits for one before it starts anything (whenReady
 * and quit-mark.ts), so it goes at once and Homebrew finds it gone. From the
 * first request on, nothing starts Pace again, and one stop answers them all.
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
  void setupClaim.stop()
  todoSync?.stop()
  deviceAsks?.stop()
  fromMac?.cancel()
  void macs?.stop()
  supervisor?.dispose()
  // A bot started by the app finishes active requests before it stops. (up to
  // 30 seconds)
  if (supervisor?.managing && !botStopped) {
    event.preventDefault()
    const t = localized(text)
    trayMenu?.setToolTip(t.tooltip(appName, t.phase.stopping))
    botStopping ??= supervisor
      .stop()
      .then(reopenIfReplaced)
      .finally(() => {
        botStopped = true
        app.quit()
      })
  }
})
// When this copy went, for one opened right after
app.on('will-quit', () => markQuit(quitMark))
app.on('window-all-closed', () => {
  if (isQuitting) app.quit()
})
process.once('SIGTERM', () => app.quit())
