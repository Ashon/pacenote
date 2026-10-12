/**
 * Bot runtime status. The bot writes it to <PACENOTE_DATA_DIR>/bot.json; the
 * desktop app and UI read it. The same file also acts as a run lock. (A second
 * bot does not start while a live pid is recorded)
 */
export type SocketState =
  'connecting' | 'connected' | 'reconnecting' | 'disconnecting' | 'disconnected'

export interface BotStatus {
  version: 1
  pid: number
  startedAt: string
  updatedAt: string
  /**
   * starting: loading config/checks, running: receiving events, stopping:
   * shutting down (waiting for in-progress requests)
   */
  state: 'starting' | 'running' | 'stopping'
  /** Who launched it. desktop when launched by the desktop app */
  managedBy: 'desktop' | 'terminal'
  socket: { state: SocketState; since: string; reconnects: number }
  bot?: { user: string; userId: string; team: string }
  reasoner?: string
  mcp?: string[]
  diagrams?: boolean
  history?: boolean
  /**
   * What does not work as it should: sandbox checks (repeated while it runs),
   * diagram rendering. The status bar counts them.
   */
  problems: string[]
  /**
   * What works in a reduced way by setup, such as a Slack app without
   * reactions:write. Shown on the Pace screen, not counted as problems.
   */
  limits?: string[]
  requests: { active: number; handled: number; lastAt?: string }
  /**
   * Config fingerprint at startup (config.ts configFingerprint). A change means
   * a restart is needed.
   */
  configHash?: string
}

/** /api/bot response. alive tells whether the pid is actually alive */
export interface BotStatusView {
  status?: BotStatus
  alive: boolean
}

export interface LogLine {
  at?: string
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  scope?: string
  message: string
}

/**
 * Bot process state managed by the desktop app (sent to the UI over IPC)
 * - setup: not launched, because settings are missing or Slack rejected the
 *   tokens
 * - failed: the build failed, or the bot exited right after starting for
 *   another reason
 * - crashed: the bot died after running normally
 *
 * After an exit no one asked for (failed to start or crashed), the app starts
 * the bot again at retryAt, waiting longer each time.
 */
export type BotPhase =
  | 'idle'
  | 'setup'
  | 'building'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'failed'
  | 'crashed'
  | 'external'

export interface SupervisorState {
  phase: BotPhase
  /** pid of the process this app launched, or of an external bot */
  pid?: number
  /** Latest notice to show the user (failure cause etc.) */
  message?: string
  /** Last output when start or build fails */
  output: string[]
  /**
   * In the setup phase: the settings that fail validation (empty when Slack is
   * not set up yet)
   */
  issues?: { key?: string; message: string }[]
  autoStart: boolean
  /** Exits no one asked for in a row, since the bot last ran well */
  restarts: number
  /** When the app starts the bot again (epoch ms), while it waits to */
  retryAt?: number
  /**
   * Whether it can rebuild from source (dev runs only. The packaged app uses
   * its bundle as is)
   */
  canBuild: boolean
}

/** Whether the desktop app opens when you log in (macOS Login Items) */
export interface LoginItemState {
  /** Only the installed app can be one; a dev run would add Electron */
  available: boolean
  on: boolean
  /** macOS 13 and later hold a new login item until you allow it */
  needsApproval: boolean
}

/** What the desktop app knows about a newer Pacenote (updates.ts) */
export interface UpdateState {
  /** This app's version */
  current: string
  /** The latest release, once a check went through */
  latest?: { version: string; url: string }
  /** Whether the latest release is newer than this app */
  available: boolean
  checkedAt?: string
}
