import { readSettingsValues } from '../settings/settings-file.js'
import { splitList } from '../settings/list.js'

export interface TasksSettings {
  /** AI tools may add tasks through Pacenote's MCP server (TASKS) */
  on: boolean
  /** DMs and group DMs count (TASKS_DMS) */
  dms: boolean
  /** Channels left out, by name (#random) or ID (TASKS_EXCLUDE_CHANNELS) */
  exclude: string[]
  /** Other names people call you, besides your Slack names (TASKS_NAMES) */
  names?: string[]
  /** User groups whose mention asks you, as written (TASKS_GROUPS) */
  groups?: string[]
}

/**
 * The tasks settings, read from the settings file each time so a change in
 * Settings applies at once. The file wins over the environment, which may hold
 * the same file's values from when the process started; the environment counts
 * when the file leaves a value out.
 */
export function readTasksSettings(
  env: NodeJS.ProcessEnv,
  settingsFile: string
): TasksSettings {
  const file = readSettingsValues(settingsFile)
  const value = (key: string) => file[key]?.trim() || env[key]?.trim()
  return {
    on: value('TASKS') === 'on',
    dms: value('TASKS_DMS') === 'on',
    exclude: splitList(value('TASKS_EXCLUDE_CHANNELS')),
    names: splitList(value('TASKS_NAMES')),
    groups: splitList(value('TASKS_GROUPS')),
  }
}
