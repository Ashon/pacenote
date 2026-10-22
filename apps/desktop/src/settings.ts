import { statSync, type Stats } from 'node:fs'
import { checkConfig } from '../../../src/config.js'
import { localized } from '../../../src/i18n/locale.js'
import { checkBrokerEnv } from '../../../src/sandbox/env.js'
import {
  readSettingsText,
  readSettingsValues,
  updateSettingsText,
  writeSettingsFile,
} from '../../../src/settings/settings-file.js'
import {
  maskSecret,
  SETTING_FIELDS,
  type SettingsChanges,
  type SettingsIssue,
  type SettingsView,
} from '../../../src/settings/fields.js'
import { checkHub } from '../../../src/hub/client.js'
import {
  checkSlackTokens,
  type SlackCheckItem,
} from '../../../src/messengers/slack/check.js'
import { text } from './settings.text.js'

const FIELDS = new Map(SETTING_FIELDS.map((field) => [field.key, field]))

/**
 * The file's values. One that cannot be read counts as empty, with why:
 * saving then fails rather than write over it.
 */
interface Read {
  values: Record<string, string>
  problem?: string
  /** The file's size; 0 when there is none */
  size: number
}

/** The file as last read, kept while it stays the same */
interface Kept extends Read {
  /** The file's inode, size and modification time when read */
  stat: string
  /** The values under the app's environment, once asked for */
  env?: NodeJS.ProcessEnv
}

/** The file's stat; none when it cannot be looked at */
function statOf(file: string): Stats | undefined {
  try {
    return statSync(file, { throwIfNoEntry: false })
  } catch {
    return undefined
  }
}

/**
 * Reads and writes the settings file for the Settings screen. The file outside
 * the repository (src/settings/paths.ts, default ~/.pacenote/settings.json) is
 * the single source of settings for the bot (both app and terminal).
 * - Secrets are never sent to the UI. (only whether they are set and the last 4
 *   characters)
 * - Validates with the same rules as the bot and broker (checkConfig,
 *   checkBrokerEnv) before saving. App environment variables also take
 *   precedence over the file the same way.
 * - Entries the Settings screen does not handle are left as is.
 */
export class SettingsStore {
  private kept?: Kept

  constructor(
    private readonly options: {
      settingsFile: string
      dataDir: string
      env: NodeJS.ProcessEnv
    }
  ) {}

  view(): SettingsView {
    const { values, problem, size } = this.load()
    const view: SettingsView = {
      file: this.options.settingsFile,
      exists: size > 0,
      ...(problem ? { problem } : {}),
      dataDir: this.options.dataDir,
      values: {},
      secrets: {},
      overridden: [],
    }
    for (const field of SETTING_FIELDS) {
      const value = values[field.key] ?? ''
      if (field.type === 'secret') {
        view.secrets[field.key] = value
          ? { set: true, hint: maskSecret(value) }
          : { set: false }
      } else {
        view.values[field.key] = value
      }
      if (this.options.env[field.key]?.trim()) view.overridden.push(field.key)
    }
    return view
  }

  validate(raw: unknown): SettingsIssue[] {
    const parsed = this.parseChanges(raw)
    if ('issues' in parsed) return parsed.issues
    return this.check(parsed.changes)
  }

  /**
   * Validates the bot settings and broker settings together. Settings that are
   * only missing (a Slack token not entered yet) do not block saving: a setup
   * can be saved a piece at a time, and the bot shows "Setup needed" until it
   * is done.
   */
  private check(changes: SettingsChanges): SettingsIssue[] {
    const env = { ...this.candidate(changes), ...this.options.env }
    return [
      ...checkConfig(env).filter((issue) => !issue.missing),
      ...checkBrokerEnv(env),
    ]
  }

  save(raw: unknown): SettingsIssue[] {
    const parsed = this.parseChanges(raw)
    if ('issues' in parsed) return parsed.issues
    const issues = this.check(parsed.changes)
    if (issues.length > 0) return issues
    try {
      const file = this.options.settingsFile
      writeSettingsFile(
        file,
        updateSettingsText(readSettingsText(file), parsed.changes)
      )
      return []
    } catch (err) {
      return [{ message: (err as Error).message }]
    }
  }

  /**
   * Checks the connection with the new values (or the current ones if
   * unchanged): the team hub, or the own app's tokens.
   */
  async checkSlack(raw: unknown): Promise<SlackCheckItem[]> {
    const parsed = this.parseChanges(raw)
    const changes = 'issues' in parsed ? {} : parsed.changes
    const env = { ...this.candidate(changes), ...this.options.env }
    if (env.SLACK_CONNECTION === 'hub')
      return checkHub(env.HUB_URL, env.HUB_TOKEN)
    return checkSlackTokens({
      botToken: env.SLACK_BOT_TOKEN,
      appToken: env.SLACK_APP_TOKEN,
      apiUrl: env.SLACK_API_URL,
    })
  }

  /**
   * The settings in effect: the settings file under the app's environment,
   * which does not change once the app has started
   */
  effectiveEnv(): NodeJS.ProcessEnv {
    const read = this.load()
    if (!('stat' in read)) return { ...read.values, ...this.options.env }
    read.env ??= { ...read.values, ...this.options.env }
    return { ...read.env }
  }

  /** The settings file's own values; none when it cannot be read */
  fileValues(): Record<string, string> {
    return { ...this.load().values }
  }

  /**
   * The file's values, read again only once the file changed (its stat), as
   * the app asks for them every few seconds. A missing file, whose values are
   * the earlier .env's, and one that cannot be read are read each time.
   * Callers copy what they change.
   */
  private load(): Read | Kept {
    const file = this.options.settingsFile
    const info = statOf(file)
    const size = info?.size ?? 0
    const stat = info && `${info.ino}:${info.size}:${info.mtimeMs}`
    if (stat && this.kept?.stat === stat) return this.kept
    this.kept = undefined
    try {
      const values = readSettingsValues(file)
      if (!stat) return { values, size }
      this.kept = { stat, values, size }
      return this.kept
    } catch (err) {
      return { values: {}, problem: (err as Error).message, size }
    }
  }

  private candidate(changes: SettingsChanges): Record<string, string> {
    const values = { ...this.load().values }
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) delete values[key]
      else values[key] = value
    }
    return values
  }

  /**
   * Checks the changes sent by the UI. Unknown entries are rejected, and empty
   * values mean revert to default (null).
   */
  private parseChanges(
    raw: unknown
  ): { changes: SettingsChanges } | { issues: SettingsIssue[] } {
    const t = localized(text)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { issues: [{ message: t.badChanges }] }
    }
    const changes: SettingsChanges = {}
    const issues: SettingsIssue[] = []
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const field = FIELDS.get(key)
      if (!field) {
        issues.push({ key, message: t.notOnScreen })
        continue
      }
      if (value !== null && typeof value !== 'string') {
        issues.push({ key, message: t.badValue })
        continue
      }
      const trimmed = value?.trim() ?? ''
      if (trimmed === '' && field.required) {
        issues.push({ key, message: t.empty })
        continue
      }
      if (trimmed.includes('\n')) {
        issues.push({ key, message: t.lineBreaks })
        continue
      }
      changes[key] = trimmed === '' ? null : trimmed
    }
    return issues.length > 0 ? { issues } : { changes }
  }
}
