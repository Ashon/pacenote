import { readEnvFile, readEnvValues } from './env-file.js'
import { envFilePath } from './paths.js'

/**
 * Prepares the environment of a process started from the terminal (the bot, the
 * prep commands): reads the settings file under the existing environment, as
 * node --env-file does.
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const [key, value] of Object.entries(
    readEnvValues(readEnvFile(envFilePath(env)))
  )) {
    if (env[key] === undefined) env[key] = value
  }
}
