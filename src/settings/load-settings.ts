import { settingsFilePath } from './paths.js'
import { readSettingsValues } from './settings-file.js'

/**
 * Prepares the environment of a process started from the terminal (the bot, the
 * prep commands): reads the settings file under the existing environment, so a
 * variable already set wins.
 */
export function loadSettings(env: NodeJS.ProcessEnv = process.env): void {
  for (const [key, value] of Object.entries(
    readSettingsValues(settingsFilePath(env))
  )) {
    if (env[key] === undefined) env[key] = value
  }
}
