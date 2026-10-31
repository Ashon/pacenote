import type { HistoryReader } from '../../../../src/history/reader.js'
import type { Logger } from '../../../../src/logger.js'
import type { OwnCli } from '../../../../src/tasks/own-ai.js'
import type { Bins, PlainWork } from '../headless.js'
import type { OwnAi } from '../own-ai.js'
import type { SettingsStore } from '../settings.js'
import type { MainWindow } from '../window.js'

/**
 * The app's services as main.ts sets them up once and the ipc/ modules take
 * them: the data folder, the log, the settings, the window, the run history,
 * and how Pacenote's own work runs a CLI on this Mac
 */
export interface Desktop {
  dataDir: string
  log: Logger
  settings: SettingsStore
  window: MainWindow
  reader: HistoryReader
  /** The PATH Pacenote runs the CLIs with: the login shell's */
  toolPath: () => string
  /** The CLIs' commands on this Mac */
  cliBins: () => Bins
  /** Pacenote's own work: the CLI chosen, and the other when it cannot */
  ownAi: OwnAi
  /** How that work runs a CLI here */
  ownWork: (cli: OwnCli) => Omit<PlainWork, 'prompt'>
  /** opencode's run for it: Pacenote's config and the model chosen */
  opencodeRun: () => NonNullable<PlainWork['opencode']>
}
