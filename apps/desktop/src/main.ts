import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
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
import {
  getLocale,
  isLocale,
  localized,
  setLocale,
  type Locale,
} from '../../../src/i18n/locale.js'
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
import { isMcpClientId } from '../../../src/history/mcp-clients.js'
import {
  collectionRow,
  latestCollection,
  recentCollections,
} from '../../../src/tasks/collections.js'
import {
  outcomeOf,
  taskContext,
  threadOf,
  TOOL_LABEL,
} from '../../../src/tasks/context.js'
import {
  allTaskViews,
  buildView,
  decide,
  readDecisions,
  readStages,
  readTasks,
  setStage,
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
  CollectionRecord,
  Proposal,
  TaskDecision,
  TasksCollect,
  WorkEntry,
  WorkTool,
} from '../../../src/tasks/types.js'
import {
  checkFolder,
  readRepos,
  recentFolders,
  repoFolder,
  repoFolderRows,
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
  UNSENT_MS,
  updateWork,
  workFor,
} from '../../../src/tasks/work.js'
import { addFollowUp, closeTask } from '../../../src/tasks/write.js'
import { ADDED_BY_YOU } from '../../../src/tasks/sources.js'
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
  findClaudeSession,
  findCodexSession,
  lastActive,
  openSession,
  readSessionLog,
  resumeCommand,
  resumeSession,
  sessionFile,
  signInCli,
  terminalOf,
  type HandoffOptions,
  type OpenIn,
  type Session,
} from './handoff.js'
import { KeepAwake } from './keep-awake.js'
import { DeviceAnswers } from './device-answers.js'
import { DeviceAsks } from '../../../src/macs/asks.js'
import { Macs } from '../../../src/macs/macs.js'
import { SetupFromMac } from '../../../src/macs/setup.js'
import { macsKey } from '../../../src/macs/channel.js'
import {
  SETUP_KEYS,
  TODO_SETUP_KEYS,
  type FromMacMode,
} from '../../../src/macs/types.js'
import { TodoSync } from '../../../src/macs/todo-sync.js'
import { MacUseWatch, macName } from './macs.js'
import { appMcpLaunch, McpClients, mcpLaunch } from './mcp-clients.js'
import { recordCollection, TaskCollector } from './task-collector.js'
import { codexDefaults, writeOpencodeConfig, type Bins } from './headless.js'
import { OwnAi, refusalOf } from './own-ai.js'
import {
  cliReadiness,
  isOwnCli,
  type OwnAiView,
  type OwnCli,
} from '../../../src/tasks/own-ai.js'
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
import { ScreenLoader, unavailablePage, createScreenFiles } from './screen.js'
import { TrayMenu, truncateLabel } from './tray.js'
import { setupProblem } from './bot-readiness.js'
import {
  listenForClaim,
  type ClaimListener,
} from '../../../src/messengers/slack/claim.js'
import {
  checkCli,
  checkOpencode,
  type CliRunner,
} from '../../../src/reasoners/host-check.js'
import { hostEnv } from '../../../src/sandbox/host.js'
import { runProcess } from '../../../src/sandbox/process.js'
import { vmUnsupported } from '../../../src/sandbox/vm.js'
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
let mainWindow: BrowserWindow | undefined
/** Loads the window's screen, and again while it fails (screen.ts) */
let mainScreen: ScreenLoader | undefined
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
/** Restarts or starts Pace on saved settings, once the IPC is set up */
let applyAfterSave: () => Promise<boolean> = () => Promise.resolve(false)
/**
 * A team hub installed from Settings: Pace switches to it as soon as it
 * answers (docs/team-hub.md)
 */
const hubInstall = new HubInstall({
  settings,
  version: app.getVersion(),
  apply: () => applyAfterSave(),
  onChange: (state) => {
    log.info(
      `Hub install: ${state.step}${'url' in state ? ` (${state.url})` : ''}`
    )
    mainWindow?.webContents.send('pacenote:hub:install-changed', state)
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
  showMainWindow(setup.view().open ? undefined : '#/settings/messengers')
  mainWindow?.webContents.send('pacenote:hub:linked')
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
  onChange: () => mainWindow?.webContents.send('pacenote:tasks:changed'),
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
/** What Connect to your other Mac takes this time (FromMacMode) */
let fromMacMode: FromMacMode = 'pace'

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
    mainWindow?.webContents.send('pacenote:macs:changed', macs?.view())
    // Todo says when another Mac collects
    mainWindow?.webContents.send('pacenote:tasks:changed')
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
    apply: async (payload, from) => {
      const mode = fromMacMode
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
    mainWindow?.webContents.send('pacenote:setup:mac-changed', state)
  )
  todoSync = new TodoSync({
    dataDir,
    macs,
    // This Mac's own collections lately, from its runs
    collections: () =>
      collectionRuns(7).flatMap((run) => collectionRow(run) ?? []),
    log: (message) => log.info(message),
    changed: () => mainWindow?.webContents.send('pacenote:tasks:changed'),
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

/**
 * Shows the window; with a route (e.g. "#/settings") it also switches to that
 * screen.
 */
function showMainWindow(route?: string): void {
  // Asked for while quitting, such as opened again right after Quit while Pace
  // stops: a window now would go with this copy, so the app opens again once
  // it is gone.
  if (isQuitting) {
    relaunch('Opened while quitting; opening again once gone')
    return
  }
  if (!mainWindow) {
    void createWindow(route).catch((error: unknown) =>
      log.error(`The window could not open: ${errorText(error)}`)
    )
    return
  }
  // A screen that would not load is tried again at once.
  mainScreen?.retryNow()
  if (route)
    void mainWindow.webContents.executeJavaScript(
      `location.hash = ${JSON.stringify(route)}`
    )
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

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
    openWindow: (route) => showMainWindow(route),
    startBot: () => void supervisor?.start(),
    restartBot: () => void supervisor?.restart(),
    openSettings: (route) => showMainWindow(route),
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

/** Bot control from the UI. Accepts requests only from the main window. */
function registerBotIpc(): void {
  const fromMainWindow = (event: Electron.IpcMainInvokeEvent) =>
    event.sender === mainWindow?.webContents
  /**
   * A channel only the main window may use: anything else gets denied, the
   * channel's own empty answer. A channel whose denied answer depends on the
   * moment (the language, a view) checks fromMainWindow itself.
   */
  const handle = (
    channel: string,
    denied: unknown,
    run: (...args: unknown[]) => unknown
  ) => {
    deviceAnswers.bridge(channel, run)
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      fromMainWindow(event) ? run(...args) : denied
    )
  }
  /** run's answer, or { error }: a thrown error loses its message over IPC */
  const orError = async <T>(run: () => T | Promise<T>) => {
    try {
      return await run()
    } catch (err) {
      return { error: (err as Error).message }
    }
  }
  /** A channel that answers { error } when it throws, and to other windows */
  const handleOrError = (
    channel: string,
    run: (...args: unknown[]) => Promise<unknown>
  ) => {
    deviceAnswers.bridge(channel, (...args) => orError(() => run(...args)))
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      fromMainWindow(event)
        ? orError(() => run(...args))
        : { error: localized(text).notAllowed }
    )
  }
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
    if (!fromMainWindow(event) || (value !== 'system' && !isLocale(value)))
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
    mainWindow?.webContents.send('pacenote:app:language-changed', language)
    return language
  })
  // Settings > Devices: your Macs, and where Pace answers
  handle('pacenote:macs:view', null, () => macs?.view() ?? null)
  handle('pacenote:macs:answer-here', undefined, () => macs?.answerHere())
  ipcMain.handle('pacenote:macs:follow', async (event, on: unknown) => {
    if (fromMainWindow(event) && typeof on === 'boolean')
      await macs?.setFollow(on)
    return macs?.view() ?? null
  })
  handle('pacenote:macs:add-address', false, (address) =>
    typeof address === 'string' ? (macs?.addAddress(address) ?? false) : false
  )
  handle('pacenote:macs:remove-address', undefined, (address) => {
    if (typeof address === 'string') macs?.removeAddress(address)
  })
  handle('pacenote:macs:ignore', undefined, (id) => {
    if (typeof id === 'string') macs?.ignore(id)
  })
  handle('pacenote:macs:remove-device', undefined, (id) => {
    if (typeof id === 'string') macs?.removeDevice(id)
  })
  // Add a device: a new Mac's setup takes your Slack app from this one
  handle('pacenote:macs:add-start', false, () => macs?.startAdding() ?? false)
  handle('pacenote:macs:add-stop', undefined, () => macs?.stopAdding())
  handle('pacenote:macs:add-allow', undefined, () => macs?.allowAdding())
  handle('pacenote:macs:add-decline', undefined, () => macs?.declineAdding())
  handle('pacenote:macs:add-close', undefined, () => macs?.closeAdding())
  handle('pacenote:macs:open-privacy', undefined, () => {
    void shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork'
    )
  })
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

  // Your tasks: AI tools add them through the MCP server; the app shows them
  // and keeps your decisions (tasks-decisions.json, which only the app writes).
  // The Claude app and the Codex app, when on this Mac: sessions can open in
  // them (Open sessions in); tests list them in PACENOTE_HANDOFF_APPS.
  /** Whether a command is on the PATH Pacenote runs the CLIs with */
  const WORK_TOOLS: WorkTool[] = ['claude', 'codex', 'opencode']
  const onPath = (bin: string) =>
    bin.includes('/')
      ? existsSync(bin)
      : toolPath()
          .split(':')
          .some((dir) => dir && existsSync(path.join(dir, bin)))
  const hasApp = (tool: WorkTool) =>
    process.env.PACENOTE_HANDOFF_APPS === undefined
      ? Boolean(app.getApplicationNameForProtocol(`${tool}://`))
      : listOf(process.env.PACENOTE_HANDOFF_APPS).includes(tool)
  const tasksSettings = () => {
    const env = settings.effectiveEnv()
    const inApp = env.TASKS_OPEN_IN === 'app'
    return {
      on: env.TASKS === 'on',
      dms: env.TASKS_DMS === 'on',
      exclude: listOf(env.TASKS_EXCLUDE_CHANNELS),
      names: listOf(env.TASKS_NAMES),
      groups: listOf(env.TASKS_GROUPS),
      /** Where code tasks continue */
      cli:
        env.TASKS_CLI === 'codex' || env.TASKS_CLI === 'opencode'
          ? env.TASKS_CLI
          : ('claude' as const),
      /** The tools a code task can continue in here */
      tools: WORK_TOOLS.filter(
        (tool) => tool !== 'opencode' || onPath(cliBins().opencode)
      ),
      /** Where each tool's new sessions open: its app, when on this Mac */
      opensIn: {
        claude: inApp && hasApp('claude') ? 'app' : 'terminal',
        codex: inApp && hasApp('codex') ? 'app' : 'terminal',
        // opencode has no app to write the task into
        opencode: 'terminal',
      } satisfies Record<WorkTool, OpenIn>,
    }
  }
  // Asked every few seconds while Todo is open: each file is read once.
  handle('pacenote:tasks:list', null, () => {
    const current = tasksSettings()
    const file = readTasks(dataDir)
    const view = buildView(file, readDecisions(dataDir), {
      excluded: current.exclude,
    })
    linkSessionsSoon()
    judgeSoon()
    // opencode's sessions: found once started, and when each last wrote
    void opencodeSessions.refreshSoon(
      readWork(dataDir).entries.filter(
        (entry): entry is Session => entry.kind === 'session' && !entry.mac
      ),
      (entry, session) =>
        updateWork(dataDir, entry.id, (e) => ({ ...e, session }))
    )
    const open = view.tasks.filter((task) => task.status === 'open')
    const yours = yourGroups(current)
    const areas = readYou(dataDir).areas
    const work = readWork(dataDir)
    const collections = recentCollections(dataDir, collectionRuns(7))
    return {
      settings: current,
      collect: collectState(collections),
      ai: ownAi.now(),
      collections,
      ...view,
      working: working(open, work.entries),
      // What you set for open tasks: started, waiting (src/tasks/stage.ts)
      stages: readStages(dataDir),
      proposals: openProposals(work, new Set(open.map((task) => task.id))),
      // A Maybe from a group neither list has asks whether it means you.
      groups: { yours, notYours: notYourGroups(file, yours) },
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
  handle('pacenote:tasks:you', null, () => readTasks(dataDir).you ?? null)
  // Whether a user group means you: one that does goes into Settings, and its
  // Maybes into the list; one that does not is not asked about again.
  handle('pacenote:tasks:answer-group', {}, (value, yours) => {
    if (typeof value !== 'string') return {}
    const group = answerGroup(dataDir, value, yours === true)
    if (!group) return { error: localized(text).notAGroup(value) }
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
  })
  // You: where you contribute, from your tasks and your sessions on this Mac
  // (src/you). Counted at most every minute, in the background once there is
  // a count to show; a fix applies at once and is counted again with it.
  const YOU_EVERY_MS = 60_000
  // Worded in the app's language, so a count in another one is counted again
  let you: { view: YouView; at: number; locale: Locale } | undefined
  let counting: Promise<YouView> | undefined
  const countYouNow = (): Promise<YouView> => {
    counting ??= (async () => {
      await checkAccounts(dataDir, toolPath()).catch(() => undefined)
      const locale = getLocale()
      const view = await countYou({ dataDir, home: homedir(), keep: true })
      you = { view, at: Date.now(), locale }
      return view
    })().finally(() => {
      counting = undefined
    })
    return counting
  }
  handle('pacenote:you:get', null, () => {
    if (!you || you.locale !== getLocale()) return countYouNow()
    if (Date.now() - you.at > YOU_EVERY_MS) void countYouNow()
    return you.view
  })
  const fixYou = async (change: (file: YouFile) => YouFile) => {
    changeYou(dataDir, change)
    // A count under way may have read the areas before the fix.
    await counting?.catch(() => undefined)
    return countYouNow()
  }
  const short = (value: unknown) =>
    typeof value === 'string' && value.length < 200 ? value : undefined
  /** A fix to an area by one more name: its new name, a part, another area */
  const fixArea =
    (fix: (file: YouFile, area: string, other: string) => YouFile) =>
    (id: unknown, value: unknown) => {
      const area = short(id)
      const other = short(value)
      return area && other ? fixYou((file) => fix(file, area, other)) : null
    }
  handle('pacenote:you:confirm', null, () =>
    fixYou((file) => ({ ...file, confirmedAt: new Date().toISOString() }))
  )
  handle('pacenote:you:rename', null, fixArea(renameArea))
  handle('pacenote:you:take-out', null, fixArea(takeOut))
  handle('pacenote:you:merge', null, fixArea(mergeAreas))
  handle('pacenote:you:leave', null, (id, left) => {
    const area = short(id)
    return area ? fixYou((file) => leaveArea(file, area, left === true)) : null
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
      recaps.set(`${getLocale()}:${period}:${key}`, {
        view: counted.view,
        at: Date.now(),
      })
    return counted
  }
  handle('pacenote:recap:get', null, async (period, key) => {
    const which = periodOf(period)
    if (!which) return null
    const at =
      typeof key === 'string' && periodRange(which, key)
        ? key
        : periodKey(which, new Date())
    const kept = recaps.get(`${getLocale()}:${which}:${at}`)
    if (kept && Date.now() - kept.at < RECAP_EVERY_MS) return kept.view
    return (await countRecapNow(which, at))?.view ?? null
  })
  const writeRecapNow = async (period: unknown, key: unknown) => {
    const t = localized(text)
    const which = periodOf(period)
    if (!which || typeof key !== 'string') return { error: t.notARecap }
    const counted = await countRecapNow(which, key)
    if (!counted) return { error: t.notARecap }
    const { view, commits } = counted
    if (view.areas.length === 0) return { error: t.nothingToWriteUp }
    const prompt = recapPrompt(view, periodWords(view), commits)
    const ran = await ownAi.run(async (cli) => {
      const result = await writeRecap({
        ...ownWork(cli),
        opencode: opencodeRun(),
        prompt,
      })
      // Spent whether it wrote or not, for the Overview's tokens
      if (result.usage)
        keepRecapSpend(dataDir, {
          at: new Date().toISOString(),
          usage: result.usage,
        })
      return result
    }, refusalOf)
    if ('resting' in ran) return { error: localized(text).bothResting }
    const { result } = ran
    if ('error' in result) {
      log.warn(`Could not write up the recap of ${key}: ${result.error}`)
      return { error: result.error }
    }
    keepWritten(dataDir, which, key, {
      text: result.text,
      at: new Date().toISOString(),
      by: ran.by,
      ...(ran.switched ? { switched: ran.switched } : {}),
    })
    return { view: (await countRecapNow(which, key))?.view }
  }
  // Write it up: here, or asked by a device of yours (DeviceAsks)
  deviceAnswers.bridge('pacenote:recap:write', writeRecapNow)
  ipcMain.handle('pacenote:recap:write', (event, period, key) =>
    fromMainWindow(event)
      ? writeRecapNow(period, key)
      : { error: localized(text).notARecap }
  )
  // The Overview's tasks: what you handled over the last 14 days
  handle('pacenote:tasks:trend', null, () => {
    const current = tasksSettings()
    if (!current.on) return null
    const view = tasksView(dataDir, current.exclude)
    return taskTrend(view.tasks, readWork(dataDir).entries)
  })
  // What AI tools are doing with your tasks now, over MCP
  handle('pacenote:tasks:live', null, () =>
    tasksSettings().on ? liveTasks(readActivity(dataDir)) : null
  )
  // An AI tool works on your tasks in a process of its own: the screens hear
  // of each change at once rather than at their next refresh.
  stopTasksWatch = watchTasks(dataDir, () =>
    mainWindow?.webContents.send('pacenote:tasks:changed')
  )
  handle('pacenote:tasks:collect', undefined, () => {
    if (!tasksSettings().on)
      return {
        at: new Date().toISOString(),
        ok: false,
        error: localized(text).tasksOff,
      }
    return taskCollector.run()
  })
  handle('pacenote:tasks:collect-stop', undefined, () => taskCollector.cancel())
  handle('pacenote:tasks:decide', undefined, (id, decision) => {
    if (typeof id !== 'string') return
    decide(dataDir, id, taskDecision(decision))
  })
  // In progress, waiting on someone else, or back to open
  handle('pacenote:tasks:stage', undefined, (id, stage) => {
    if (typeof id !== 'string') return
    if (stage === 'started' || stage === 'waiting' || stage === 'open')
      setStage(dataDir, id, stage)
  })
  // A task you add yourself (Todo's New task), in a project's repository
  handle('pacenote:tasks:add', undefined, (title, repo) => {
    if (typeof title !== 'string' || !title.trim()) return undefined
    const result = addFollowUp(
      dataDir,
      {
        title,
        why: 'Added by you',
        repo: typeof repo === 'string' ? repo : undefined,
      },
      { addedBy: ADDED_BY_YOU }
    )
    if ('error' in result) return result
    return { id: result.task.id }
  })
  handle('pacenote:tasks:leave-out', [], (label) => {
    if (typeof label !== 'string' || !label.trim()) return []
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
    bin: (tool) => cliBins()[tool],
    terminal: () => terminalOf(env().TASKS_TERMINAL),
    planFirst: () => env().TASKS_PLAN_FIRST !== 'off',
    openIn: () => (env().TASKS_OPEN_IN === 'app' ? 'app' : 'terminal'),
    hasApp,
  })
  // Pacenote's own work signed out: claude auth login (or codex login), in
  // your terminal
  handle('pacenote:tasks:sign-in', undefined, (cli) =>
    orError(async () => {
      await signInCli(handoff(), cli === 'codex' ? 'codex' : 'claude')
      return {}
    })
  )
  // Sessions you started yourself, from Claude Code's and Codex's logs on
  // this Mac (Settings > Todo > Show sessions you start yourself): linked to
  // the task they worked on, or suggested for you to say, at most every 30
  // seconds and never two passes at once (session-links.ts).
  // End-to-end tests look more often (PACENOTE_TASKS_LINK_MS).
  const LINK_EVERY_MS = Number(process.env.PACENOTE_TASKS_LINK_MS) || 30_000
  const sessionIndex = new SessionIndex({ home: homedir() })
  const repoLookup = new RepoLookup()
  let linking: Promise<void> | undefined
  let linkedAt = 0
  let linkAgain = false
  const linkSessionsSoon = (force = false): void => {
    if (env().TASKS !== 'on' || env().TASKS_LINK_SESSIONS !== 'on') return
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
    if (entry.tool === 'opencode')
      return {
        lastActiveAt: entry.session
          ? opencodeSessions.activeAt(entry.session)
          : undefined,
      }
    const summary = entry.session && sessionIndex.session(entry.session)
    if (summary)
      return {
        lastActiveAt: summary.lastAt,
        branch:
          summary.branch && isTaskBranch(summary.branch)
            ? summary.branch
            : undefined,
      }
    return { lastActiveAt: lastActive(homedir(), entry as Session) }
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
        const items =
          entry.tool === 'opencode'
            ? ((await opencodeSessions.log(entry)) ?? [])
            : file
              ? readSessionLog(file, entry.tool)
              : []
        const pr = await pullRequestOf(
          task.repo,
          entry.branch ?? sessionNow(entry).branch,
          toolPath()
        )
        const ran = items.length
          ? await ownAi.run(
              (cli) =>
                judge({
                  ...ownWork(cli),
                  opencode: opencodeRun(),
                  prompt: judgePrompt(task, items, pr),
                }),
              refusalOf,
              { background: true }
            )
          : undefined
        // Both at their limits: judged once one of them is back
        if (ran && 'resting' in ran) {
          log.info(
            `Not judging whether ${task.id} looks done until ${ran.resting}: both AIs are resting.`
          )
          break
        }
        const result = ran
          ? ran.result
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
  const working = (tasks: { id: string }[], entries: WorkEntry[]) => {
    // The entries by task, sorted out once rather than for each task
    const byTask = new Map<string, WorkEntry[]>()
    for (const entry of entries) {
      const group = byTask.get(entry.task)
      if (group) group.push(entry)
      else byTask.set(entry.task, [entry])
    }
    const rows: Record<string, { tool: WorkTool; at: string }> = {}
    for (const task of tasks) {
      const latest = workFor(byTask.get(task.id) ?? [], task.id).find(
        (e): e is Session => e.kind === 'session' && !!e.session
      )
      const at = latest && !latest.mac && sessionNow(latest).lastActiveAt
      if (latest && at) rows[task.id] = { tool: latest.tool, at }
    }
    return rows
  }
  /**
   * A task with what came before it, worded in the app's language for the
   * window, or in English for a prompt (a session opened on it, a draft)
   */
  const taskDetail = (id: string, locale: Locale = getLocale()) => {
    const all = allTaskViews(dataDir)
    const task = all.find((t) => t.id === id)
    if (!task) return null
    // Codex sessions Pacenote opened, and those opened in a desktop app, get
    // their id once they have started; one opened in an app is looked for a
    // day, even when opened again since.
    for (const entry of readWork(dataDir).entries)
      if (
        entry.kind === 'session' &&
        entry.task === id &&
        !entry.session &&
        !entry.mac &&
        (!entry.app || Date.now() - Date.parse(entry.startedAt) <= UNSENT_MS)
      ) {
        // opencode's are found in the background (opencodeSessions)
        const session =
          entry.tool === 'codex'
            ? findCodexSession(homedir(), entry)
            : entry.tool === 'claude'
              ? findClaudeSession(homedir(), entry)
              : undefined
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
      reader.inThread(thread.slice(0, at), thread.slice(at + 1)),
      locale
    )
    return {
      task,
      context,
      outcome: outcomeOf(task, work, locale),
      // A session on another of your Macs has its log there
      work: workFor(work, id).map((entry) =>
        entry.kind === 'session' && !entry.mac
          ? { ...entry, ...sessionNow(entry), resume: resumeCommand(entry) }
          : entry
      ),
      suggested: (file.suggested ?? [])
        .filter((s) => s.task === id)
        .map((s) => ({ ...s, lastActiveAt: sessionNow(s).lastActiveAt })),
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
  handle('pacenote:tasks:detail', null, (id) =>
    typeof id === 'string' ? taskDetail(id) : null
  )
  // What a task's quiet session looked like: close the task with how it
  // ended, or not yet; or keep a thing left after it as a task
  const answered = (id: string, change: (p: Proposal) => Proposal) =>
    changeWork(dataDir, (work) => ({
      ...work,
      proposals: (work.proposals ?? []).map((p) =>
        p.task === id && !p.answer ? change(p) : p
      ),
    }))
  handle('pacenote:tasks:answer-proposal', undefined, (id, answer) => {
    if (typeof id !== 'string') return undefined
    const proposal = openProposals(readWork(dataDir), new Set([id]))[id]
    if (!proposal) return { error: localized(text).nothingToAnswer }
    if (answer === 'close') {
      // Done in its session; how it ended is the wrap-up, not a note too
      closeTask(dataDir, id, 'resolved', new Date(), {
        by: proposal.tool === 'claude' ? 'claude-code' : 'codex',
        wrapUp: proposal.summary,
      })
      answered(id, (p) => ({ ...p, answer: 'closed' }))
    } else answered(id, (p) => ({ ...p, answer: 'not-yet' }))
    return {}
  })
  handle('pacenote:tasks:keep-left', undefined, (id, text) => {
    if (typeof id !== 'string') return undefined
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
  })
  // A suggested session: yours for the task, or not
  handle('pacenote:tasks:answer-suggestion', undefined, (entryId, yes) => {
    if (typeof entryId !== 'string') return
    answerSuggestion(dataDir, entryId, yes === true)
    // A session that is the task's lends it its branch: look again.
    linkSessionsSoon(true)
  })
  // Where a task may open: its repository's folder and checkouts, or the
  // folders you worked in lately, likeliest first
  handle('pacenote:tasks:folders', [], (id) => {
    if (typeof id !== 'string') return []
    const task = allTaskViews(dataDir).find((t) => t.id === id)
    return task ? suggestFolders(task, { home: homedir(), dataDir }) : []
  })
  handle('pacenote:tasks:choose-folder', undefined, async (repo) => {
    if (!mainWindow) return undefined
    // Next to the folder you worked in last, where your checkouts are
    const [last] = recentFolders(homedir(), { leaveOut: [dataDir], limit: 1 })
    const t = localized(text)
    const result = await dialog.showOpenDialog(mainWindow, {
      title: typeof repo === 'string' ? t.whereIs(repo) : t.chooseFolder,
      defaultPath: last ? path.dirname(last.path) : homedir(),
      properties: ['openDirectory'],
    })
    const folder = result.filePaths[0]
    if (result.canceled || !folder) return undefined
    return checkFolder(folder, typeof repo === 'string' ? repo : undefined)
  })
  handle('pacenote:tasks:repos', {}, () => readRepos(dataDir))
  // Settings > Todo: the repositories you work in, and where each opens
  handle('pacenote:tasks:repo-rows', [], () =>
    repoFolderRows(
      dataDir,
      homedir(),
      allTaskViews(dataDir)
        .filter((task) => task.status === 'open' && task.repo)
        .map((task) => task.repo!)
    )
  )
  // Settings > Todo: whether the Claude app and the Codex app are on this Mac
  handle('pacenote:tasks:apps', null, () => ({
    claude: hasApp('claude'),
    codex: hasApp('codex'),
    opencode: false,
  }))
  handle('pacenote:tasks:set-repo', {}, (repo, folder) => {
    if (typeof repo !== 'string') return {}
    return saveRepo(
      dataDir,
      repo,
      typeof folder === 'string' && folder ? folder : undefined
    )
  })
  handle('pacenote:tasks:continue', undefined, async (id, how) => {
    if (typeof id !== 'string') return undefined
    const { tool, folder } = (how ?? {}) as { tool?: unknown; folder?: unknown }
    const t = localized(text)
    const detail = taskDetail(id, 'en')
    if (!detail) return { error: t.noSuchTask }
    if (typeof folder !== 'string' || !folder)
      return { error: t.chooseFolderFirst }
    return orError(async () => {
      if (detail.task.repo) saveRepo(dataDir, detail.task.repo, folder)
      const { entry, note } = await openSession(
        handoff(),
        detail.task,
        detail.context,
        tool === 'codex' ? 'codex' : 'claude',
        folder
      )
      addWork(dataDir, entry)
      return { entry, note }
    })
  })
  handle('pacenote:tasks:resume', undefined, async (entryId) => {
    const t = localized(text)
    const entry = sessionEntry(entryId)
    if (!entry) return { error: t.noSuchSession }
    if (entry.mac)
      return {
        error: t.sessionElsewhere(
          macs?.view().macs.find((mac) => mac.id === entry.mac)?.name ??
            t.otherMac
        ),
      }
    return orError(async () => {
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
    })
  })
  const drafting = new Set<string>()
  handle('pacenote:tasks:draft', undefined, async (id) => {
    if (typeof id !== 'string') return undefined
    const t = localized(text)
    const detail = taskDetail(id, 'en')
    if (!detail) return { error: t.noSuchTask }
    if (drafting.has(id)) return { error: t.drafting }
    drafting.add(id)
    try {
      const launch = appMcpLaunch(paths.historyMcp)
      const ran = await ownAi.run(
        (cli) =>
          draftReply({
            ...ownWork(cli),
            launch,
            task: detail.task,
            context: detail.context,
          }),
        refusalOf
      )
      if ('resting' in ran) return { error: t.bothResting }
      const draft = ran.result
      if ('error' in draft) return { error: draft.error }
      const entry: WorkEntry = {
        kind: 'draft',
        id: randomUUID(),
        task: id,
        at: new Date().toISOString(),
        text: draft.text,
        by: ran.by,
        ...(ran.switched ? { switched: ran.switched } : {}),
      }
      addWork(dataDir, entry)
      return { entry }
    } finally {
      drafting.delete(id)
    }
  })
  handle('pacenote:tasks:copy-reply', undefined, (id, reply) => {
    if (typeof id !== 'string') return undefined
    const t = localized(text)
    if (typeof reply !== 'string' || !reply.trim())
      return { error: t.emptyReply }
    const task = allTaskViews(dataDir).find((view) => view.id === id)
    if (!task) return { error: t.noSuchTask }
    clipboard.writeText(reply)
    const at = new Date().toISOString()
    const latest = workFor(readWork(dataDir).entries, id).find(
      (entry) => entry.kind === 'draft'
    )
    if (latest)
      updateWork(dataDir, latest.id, (e) =>
        e.kind === 'draft' ? { ...e, text: reply, copiedAt: at } : e
      )
    else
      addWork(dataDir, {
        kind: 'draft',
        id: randomUUID(),
        task: id,
        at,
        text: reply,
        copiedAt: at,
      })
    const link = task.source.permalink
    if (link && /^https:\/\//.test(link)) void shell.openExternal(link)
    return {}
  })
  handle('pacenote:tasks:session-log', undefined, (entryId) => {
    const t = localized(text)
    const entry = sessionEntry(entryId)
    if (!entry) return { error: t.noSuchSession }
    if (entry.tool === 'opencode')
      return opencodeSessions
        .log(entry)
        .then((items) =>
          items ? { items } : { error: t.noSessionLog(TOOL_LABEL.opencode) }
        )
    const file = sessionFile(homedir(), entry)
    if (!file) return { error: t.noSessionLog(TOOL_LABEL[entry.tool]) }
    return orError(() => ({ items: readSessionLog(file, entry.tool) }))
  })
  handle('pacenote:settings:get', null, () => settings.view())
  handle('pacenote:settings:validate', [], (changes) =>
    settings.validate(changes)
  )
  handle('pacenote:settings:check-slack', [], (changes) =>
    settings.checkSlack(changes)
  )
  // New settings take effect only after the bot restarts. A stopped bot is
  // started fresh.
  applyAfterSave = () => applySettings()
  const applySettings = async (): Promise<boolean> => {
    if (!supervisor) return false
    const phase = supervisor.current.phase
    if (phase === 'running' || phase === 'starting') await supervisor.restart()
    else if (['idle', 'setup', 'failed', 'crashed'].includes(phase))
      await supervisor.start()
    else return false
    return true
  }
  handle(
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
  handleOrError('pacenote:hub:pair-start', (url) => hubPairing.start(url))
  handleOrError('pacenote:hub:pair-status', () => hubPairing.status())
  // Settings starts Pace once paired; setup starts it after its review.
  handleOrError('pacenote:hub:pair-confirm', async (options) => {
    const confirmed = await hubPairing.confirm()
    const start = (options as { start?: unknown } | undefined)?.start !== false
    const started =
      start && confirmed.issues.length === 0 && (await applySettings())
    return { ...confirmed, started }
  })
  // The first-run wizard: where it got to, what this Mac has, and "@Pace
  // it's me" on your own Slack app.
  handle('pacenote:setup:state', null, () => setup.view())
  handle('pacenote:setup:save', null, (patch) => setup.save(patch))
  /** Runs a CLI as you would: your PATH, outside any project */
  const hostRunner =
    (command: string): CliRunner =>
    (args) =>
      runProcess(command, args, {
        cwd: tmpdir(),
        input: '',
        timeoutMs: 20_000,
        env: { ...hostEnv(process.env), PATH: toolPath() },
      })
  // Each check starts the CLI a few times: asks that overlap share the one
  // under way.
  const checking = new Map<string, Promise<unknown>>()
  const shareCheck = <T>(key: string, check: () => Promise<T>): Promise<T> => {
    const running = checking.get(key) as Promise<T> | undefined
    if (running) return running
    const started = check().finally(() => {
      if (checking.get(key) === started) checking.delete(key)
    })
    checking.set(key, started)
    return started
  }
  /** Whether each CLI is on this Mac and signed in, as you would run it */
  const detectClis = async () => {
    const bins = cliBins()
    // What a check says is worded in the app's language
    const check = (cli: 'claude' | 'codex') =>
      shareCheck(`${getLocale()} ${cli} ${bins[cli]}`, () =>
        checkCli(cli, bins[cli], hostRunner(bins[cli]))
      )
    const [claude, codex] = await Promise.all([check('claude'), check('codex')])
    return { claude, codex }
  }
  /** opencode, for Pacenote's own work only */
  const detectOpencode = () => {
    const command = cliBins().opencode
    return shareCheck(`opencode ${command}`, () =>
      checkOpencode(hostRunner(command))
    )
  }
  // Connect to your other Mac: setup takes your Slack app from it
  handle('pacenote:setup:mac-state', null, () => fromMac?.current ?? null)
  handle('pacenote:setup:mac-look', undefined, (mode) => {
    // What it takes this time: Pace's setup, Todo's first run, or Settings
    fromMacMode = mode === 'todo' || mode === 'join' ? mode : 'pace'
    fromMac?.look()
  })
  handle('pacenote:setup:mac-connect', undefined, (raw) => {
    const target = (raw ?? {}) as { instance?: unknown; address?: unknown }
    if (typeof target.instance === 'string')
      void fromMac?.connect({ instance: target.instance })
    else if (typeof target.address === 'string')
      void fromMac?.connect({ address: target.address })
  })
  handle('pacenote:setup:mac-cancel', undefined, () => fromMac?.cancel())
  handle('pacenote:setup:detect', null, async () => ({
    cli: await detectClis(),
    sandbox: { unsupported: vmUnsupported() },
  }))
  // Which CLI does Pacenote's own work now, without checking them
  handle('pacenote:ai:now', null, () => ownAi.now())
  // Settings > Todo: the CLIs that do Pacenote's own work, each with whether
  // it is here and signed in, and what it last did
  handle('pacenote:ai:state', null, async (): Promise<OwnAiView> => {
    const [clis, opencode] = await Promise.all([detectClis(), detectOpencode()])
    return {
      ...ownAi.now(),
      clis: {
        claude: cliReadiness(clis.claude),
        codex: cliReadiness(clis.codex),
        opencode: cliReadiness(opencode),
      },
    }
  })
  handleOrError('pacenote:setup:claim-start', () =>
    claimStep(async () => {
      await stopClaim()
      const env = settings.effectiveEnv()
      const appToken = env.SLACK_APP_TOKEN?.trim()
      const botToken = env.SLACK_BOT_TOKEN?.trim()
      if (!appToken || !botToken)
        throw new Error(localized(text).bothTokensFirst)
      if (supervisor?.current.phase === 'external')
        throw new Error(localized(text).runningElsewhere)
      // Pace on the same app would take some of the mentions meanwhile.
      if (supervisor?.managing) {
        claimPaused = true
        await supervisor.stop()
      }
      claim = await listenForClaim({
        appToken,
        botToken,
        apiUrl: env.SLACK_API_URL,
        // The reply is for you: in Pace's notes language once chosen, the
        // app's until then
        notesLocale: isLocale(env.NOTES_LANGUAGE)
          ? env.NOTES_LANGUAGE
          : getLocale(),
        log: log.child('setup'),
        onMention: (user) =>
          mainWindow?.webContents.send('pacenote:setup:claimed', user),
      })
      return { ok: true as const }
    })
  )
  handleOrError('pacenote:setup:claim-confirm', (raw) =>
    claimStep(async () => {
      const user = (raw ?? {}) as { id?: unknown; name?: unknown }
      if (
        typeof user.id !== 'string' ||
        !/^[UW][A-Z0-9]+$/.test(user.id) ||
        typeof user.name !== 'string'
      )
        throw new Error(localized(text).notAMember)
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
  // Left without confirming: Pace runs again if listening stopped it.
  handle('pacenote:setup:claim-stop', undefined, () =>
    claimStep(async () => {
      await stopClaim()
      if (claimPaused) {
        claimPaused = false
        await supervisor?.start()
      }
    })
  )
  handle('pacenote:hub:pair-cancel', undefined, () => hubPairing.cancel())
  // Installing a hub from Settings or setup (deploy/hub/install.sh)
  handleOrError('pacenote:hub:install-command', async (input) =>
    hubInstall.command(input)
  )
  handle('pacenote:hub:install-state', { step: 'idle' }, () =>
    hubInstall.current()
  )
  handle('pacenote:hub:install-wait', { step: 'idle' }, () =>
    hubInstall.resume()
  )
  handle('pacenote:hub:install-cancel', undefined, () => hubInstall.cancel())
  // The hub a pacenote:// link opened, once
  handle('pacenote:hub:take-link', null, () => {
    const url = linkedHub
    linkedHub = undefined
    return url ?? null
  })
  handleOrError('pacenote:hub:disconnect', async () => {
    const issues = await hubPairing.disconnect(settings.effectiveEnv())
    if (issues.length === 0) await applySettings()
    return { issues }
  })
  handle('pacenote:settings:open-data-dir', undefined, () => {
    void shell.openPath(dataDir)
  })
  handle('pacenote:settings:reveal-file', undefined, () => {
    shell.showItemInFolder(settingsFile)
  })
  // The settings screen turns the launch into commands to add it by hand.
  handle('pacenote:settings:history-mcp', undefined, () =>
    mcpLaunch(paths.historyMcp)
  )
  handle('pacenote:mcp:status', [], () => mcpClients.status())
  handle('pacenote:mcp:connect', undefined, (id) =>
    isMcpClientId(id) ? mcpClients.connect(id) : undefined
  )
  handle('pacenote:mcp:disconnect', undefined, (id) =>
    isMcpClientId(id) ? mcpClients.disconnect(id) : undefined
  )
  handle('pacenote:sandbox:status', null, () => sandbox.status())
  handle('pacenote:sandbox:job', null, () => sandbox.job ?? null)
  ipcMain.handle('pacenote:sandbox:run', (event, kind: unknown) =>
    fromMainWindow(event)
      ? sandbox.run(kind)
      : { error: localized(text).denied }
  )
  handle('pacenote:sandbox:save-allowlist', [], (domains) =>
    sandbox.saveAllowlist(domains)
  )
  ipcMain.handle('pacenote:sandbox:login', async (event, cli: unknown) => {
    if (!fromMainWindow(event))
      return { ok: false, error: localized(text).notAllowed }
    const result = await sandboxSignIn.run(cli)
    // Signed in to Claude: a claude token set by hand goes unused, so it goes.
    if (result.ok && cli === 'claude')
      for (const note of dropClaudeToken(
        settingsFile,
        signedIn(vmRootPath(process.env), 'claude')
      ))
        log.info(`Settings: ${note}`)
    return result
  })
  handle('pacenote:sandbox:login-code', undefined, (code) => {
    sandboxSignIn.submit(code)
  })
  handle('pacenote:sandbox:login-cancel', undefined, () => {
    sandboxSignIn.cancel()
  })
  handle('pacenote:sandbox:sign-out', undefined, (cli) => {
    sandboxSignIn.signOut(cli)
  })
  sandbox.on('job', (job) => {
    mainWindow?.webContents.send('pacenote:sandbox:job-changed', job)
    // A finished job may have started or stopped the proxy or the broker; the
    // bot checks the sandbox again.
    if (job.state !== 'running') supervisor?.recheckSandbox()
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
    mainWindow?.webContents.send('pacenote:bot:changed', state)
    if (TRAY_FIELDS.some((key) => state[key] !== last?.[key])) updateTray()
    last = state
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
            ? localized(text).startedElsewhere
            : localized(text).startedHere
        )
      })
  })
  handle(
    'pacenote:window:full-screen',
    false,
    () => mainWindow?.isFullScreen() ?? false
  )
  handle('pacenote:app:update', null, () => updates?.current ?? null)
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
  const fullScreen = (on: boolean) => () =>
    window.webContents.send('pacenote:window:full-screen-changed', on)
  window.on('enter-full-screen', fullScreen(true))
  window.on('leave-full-screen', fullScreen(false))
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
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
  const screenUrl = webDevUrl ?? 'pacenote://app/'
  const screen = new ScreenLoader({
    load: () => window.loadURL(`${screenUrl}${route}`),
    probe: () => screenFiles.probe(),
    showUnavailable: (reason) =>
      window.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          unavailablePage({ app: appName, reason, retryUrl: screenUrl })
        )}`
      ),
    // An upgrade put a new version in place: that one opens instead.
    gone: () =>
      window.isDestroyed() ||
      isQuitting ||
      restarting ||
      (bundleWatch?.check() ?? false),
    passing: () => bundleWatch?.swapping() ?? false,
    log,
  })
  mainScreen = screen
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
    if (mainScreen === screen) mainScreen = undefined
  })
  window.webContents.on('will-navigate', (event, url) => {
    // "Try again" on the page that says why the screen is not there
    if (screen.unavailable) {
      event.preventDefault()
      screen.retryNow()
      return
    }
    if (
      !url.startsWith('pacenote://app/') &&
      !(webDevUrl && url.startsWith(webDevUrl))
    )
      event.preventDefault()
  })
  // The screen failing later, such as reloaded while an upgrade swaps its
  // files, is loaded again the same way, on the screen it was on. One
  // navigation cut short by the next (-3) is no failure.
  window.webContents.on(
    'did-fail-load',
    (_event, code, _description, url, isMainFrame) => {
      if (!isMainFrame || code === -3 || url.startsWith('data:')) return
      route = URL.canParse(url) ? new URL(url).hash : route
      void screen.load()
    }
  )
  if (webDevUrl) await waitForUrl(webDevUrl)
  // Not waited for: the screen may take its time, and the app goes on.
  const loaded = screen.load()
  if (captureFile) await loaded.then(() => capture(window, captureFile))
}

/**
 * Waits until the dev server is up. (pnpm desktop:dev starts the UI and the app
 * together) One that stays down is the screen's to try again for.
 */
async function waitForUrl(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok) return
    } catch {
      // Still starting.
    }
    await sleep(250)
  }
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
  showMainWindow()
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
  app.on('activate', () => showMainWindow())
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
      screenFiles.registerAppProtocol()
      // pacenote:// links (the hub installer's, a teammate's share link's),
      // for this copy of the app
      if (app.isPackaged) app.setAsDefaultProtocolClient('pacenote')
      registerBotIpc()
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
        await createWindow(
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
  void stopClaim()
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
