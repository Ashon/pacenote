import { readEnvFile, readEnvValues } from '../settings/env-file.js'

export interface TasksSettings {
  /** AI tools may add tasks through Pacenote's MCP server (TASKS) */
  on: boolean
  /** DMs and group DMs count (TASKS_DMS) */
  dms: boolean
  /** Channels left out, by name (#random) or ID (TASKS_EXCLUDE_CHANNELS) */
  exclude: string[]
}

/**
 * The tasks settings, read from the settings file each time so a change in
 * Settings applies at once. The file wins over the environment, which may hold
 * the same file's values from when the process started; the environment counts
 * when the file leaves a value out.
 */
export function readTasksSettings(
  env: NodeJS.ProcessEnv,
  envFile: string
): TasksSettings {
  const file = readEnvValues(readEnvFile(envFile))
  const value = (key: string) => file[key]?.trim() || env[key]?.trim()
  return {
    on: value('TASKS') === 'on',
    dms: value('TASKS_DMS') === 'on',
    exclude: (value('TASKS_EXCLUDE_CHANNELS') ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  }
}
