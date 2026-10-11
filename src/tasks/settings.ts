import { readEnvFile, readEnvValues } from '../settings/env-file.js'

/**
 * What the desktop app and the MCP server need from tasks without loading the
 * Slack client: the message that asks the bot to collect, and the settings.
 */

/** The desktop app's message to the bot: collect your tasks now */
export const COLLECT_TASKS = 'collect-tasks'

export interface TasksSettings {
  on: boolean
  userToken?: string
  dms: boolean
  exclude: string[]
}

/**
 * The tasks settings, read from the settings file each time so a change in
 * Settings applies without restarting Pace. The file wins over the environment,
 * which the desktop app fills from the same file at launch; the environment
 * counts when the file leaves a value out (a terminal run).
 */
export function readTasksSettings(
  env: NodeJS.ProcessEnv,
  envFile: string
): TasksSettings {
  const file = readEnvValues(readEnvFile(envFile))
  const value = (key: string) => file[key]?.trim() || env[key]?.trim()
  return {
    on: value('TASKS') === 'on',
    userToken: value('SLACK_USER_TOKEN') || undefined,
    dms: value('TASKS_DMS') === 'on',
    exclude: (value('TASKS_EXCLUDE_CHANNELS') ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  }
}
