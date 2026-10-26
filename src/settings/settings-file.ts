import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { localized } from '../i18n/locale.js'
import { migrateEnvValues, readEnvFile, readEnvValues } from './env-file.js'
import { SETTING_FIELDS, type SettingField } from './fields.js'
import { text as words } from './settings-file.text.js'
import { connectionStates, lookupIn } from './tools.js'

/**
 * The settings file, settings.json: Pacenote's settings as one object, grouped
 * as the Settings screen groups them.
 *
 *   { "slack": { "botToken": "xoxb-..." }, "tasks": { "enabled": true } }
 *
 * Pace and the tools still read each setting by its name (SLACK_BOT_TOKEN), as
 * they read the environment, and a variable set in the environment wins over
 * the file. Here each name has its place (SettingField.path), with an on/off
 * as true or false, a number as a number and a list as a list. A setting with
 * no place of its own is kept under "env" by its name. Entries the app does not
 * know are kept as they are on save.
 */
interface Place {
  path: string[]
  kind: 'toggle' | 'number' | 'list' | 'text'
}

/** Settings the screen does not show but the file holds by place */
const OTHER_PLACES: Record<string, Place> = {
  PACENOTE_DATA_DIR: { path: ['dataDir'], kind: 'text' },
}

function placeOf(field: SettingField): Place {
  return {
    path: field.path.split('.'),
    kind: field.list
      ? 'list'
      : field.type === 'toggle' || field.type === 'number'
        ? field.type
        : 'text',
  }
}

/** Each setting's place, in the order the screen shows them */
export const SETTING_PLACES: ReadonlyMap<string, Place> = new Map([
  ...SETTING_FIELDS.map((field) => [field.key, placeOf(field)] as const),
  ...Object.entries(OTHER_PLACES),
])

/**
 * Where a setting is in the file, for messages: "slack.botToken", or its name
 * when it has no place of its own
 */
export function settingName(key: string): string {
  return SETTING_PLACES.get(key)?.path.join('.') ?? key
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads the file's text as its object; an empty file is an empty object */
export function parseSettings(text: string): Json {
  if (text.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(localized(words).notJson((err as Error).message), {
      cause: err,
    })
  }
  if (!isObject(parsed)) throw new Error(localized(words).notObject)
  return parsed
}

/** A value as Pace reads it: on/off, a number or a comma-separated list */
function asText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value))
    return value
      .map(asText)
      .filter((item) => item !== undefined)
      .join(', ')
  return JSON.stringify(value)
}

/** A value as the file keeps it at its place */
function asJson(place: Place, value: string): unknown {
  switch (place.kind) {
    case 'toggle':
      return value === 'on' ? true : value === 'off' ? false : value
    case 'number':
      return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value
    case 'list':
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    case 'text':
      return value
  }
}

function at(root: Json, keys: string[]): unknown {
  let node: unknown = root
  for (const key of keys) {
    if (!isObject(node)) return undefined
    node = node[key]
  }
  return node
}

function put(root: Json, keys: string[], value: unknown): void {
  let node = root
  for (const key of keys.slice(0, -1)) {
    if (!isObject(node[key])) node[key] = {}
    node = node[key] as Json
  }
  node[keys.at(-1)!] = value
}

/** Removes a value, and the groups it leaves empty */
function drop(root: Json, keys: string[]): void {
  const [key, ...rest] = keys
  if (key === undefined || !(key in root)) return
  if (rest.length === 0) {
    delete root[key]
    return
  }
  const child = root[key]
  if (!isObject(child)) return
  drop(child, rest)
  if (Object.keys(child).length === 0) delete root[key]
}

/** The file's settings by name, as Pace reads them */
export function settingsValues(root: Json): Record<string, string> {
  const values: Record<string, string> = {}
  const named = root.env
  if (isObject(named)) {
    for (const [key, value] of Object.entries(named)) {
      const text = asText(value)
      if (text !== undefined) values[key] = text
    }
  }
  for (const [key, place] of SETTING_PLACES) {
    const text = asText(at(root, place.path))
    if (text !== undefined) values[key] = text
  }
  return values
}

/**
 * Changes the file's text: each setting at its place, null or an empty value
 * clearing it (the default applies again). Entries not changed stay as they
 * are.
 */
export function updateSettingsText(
  text: string,
  changes: Record<string, string | null>
): string {
  const root = parseSettings(text)
  for (const [key, value] of Object.entries(changes)) {
    const place = SETTING_PLACES.get(key)
    const keys = place?.path ?? ['env', key]
    if (value === null || value === '') drop(root, keys)
    else put(root, keys, place ? asJson(place, value) : value)
    // The value by its name gives way to the one at its place.
    if (place) drop(root, ['env', key])
  }
  return `${JSON.stringify(root, null, 2)}\n`
}

/** A settings file's text holding these values, in the screen's order */
export function settingsText(values: Record<string, string>): string {
  const keys = [
    ...[...SETTING_PLACES.keys()].filter((key) => key in values),
    ...Object.keys(values).filter((key) => !SETTING_PLACES.has(key)),
  ]
  return updateSettingsText(
    '',
    Object.fromEntries(keys.map((key) => [key, values[key]!]))
  )
}

/** The .env an earlier version kept settings in, next to settings.json */
function legacyEnvFile(file: string): string {
  return path.join(path.dirname(file), '.env')
}

/**
 * The settings in the file, by name. Before the file exists, the .env of an
 * earlier version is read instead, so a tool started before the app moved it
 * still finds them. Throws when the file is not valid JSON.
 */
export function readSettingsValues(file: string): Record<string, string> {
  if (existsSync(file))
    return settingsValues(parseSettings(readFileSync(file, 'utf8')))
  return readEnvValues(readEnvFile(legacyEnvFile(file)))
}

export function readSettingsText(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/**
 * Replaces the file so no half-written file is left. Always 600: it holds the
 * Slack tokens and logins.
 */
export function writeSettingsFile(file: string, text: string): void {
  rmSync(`${file}.tmp`, { force: true })
  writeFileSync(`${file}.tmp`, text, { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}

/**
 * Moves an earlier version's .env into settings.json, once: settings whose
 * meaning changed are rewritten as Pace reads them now (migrateEnvValues), and
 * the old file stays as .env.bak. Returns a line for the log per change.
 */
export function moveEnvSettings(file: string): string[] {
  const legacy = legacyEnvFile(file)
  if (existsSync(file) || !existsSync(legacy)) return []
  const migrated = migrateEnvValues(readEnvValues(readEnvFile(legacy)))
  writeSettingsFile(file, settingsText(migrated.values))
  // It still holds the tokens: kept to this account, as the file was.
  renameSync(legacy, `${legacy}.bak`)
  chmodSync(`${legacy}.bak`, 0o600)
  return [
    ...migrated.notes,
    `moved from ${path.basename(legacy)} to ${path.basename(file)} (the old file is ${path.basename(legacy)}.bak)`,
  ]
}

/**
 * Takes a claude token set by hand out of the settings once Claude is signed
 * in inside the sandbox: Pace uses the sign-in first, so the token goes unused,
 * and Pacenote keeps no claude.ai token it does not use. The old .env's backup
 * (moveEnvSettings) loses it too. Returns a line for the log per change.
 */
export function dropClaudeToken(file: string, signedIn: boolean): string[] {
  if (!signedIn) return []
  const key = 'SANDBOX_CLAUDE_OAUTH_TOKEN'
  const notes: string[] = []
  if (existsSync(file)) {
    const text = readFileSync(file, 'utf8')
    let values: Record<string, string> = {}
    try {
      values = settingsValues(parseSettings(text))
    } catch {
      // Not JSON: the app says so where the file is shown
    }
    if (values[key]) {
      writeSettingsFile(file, updateSettingsText(text, { [key]: null }))
      notes.push(
        `${settingName(key)} is removed: Claude is signed in inside the sandbox`
      )
    }
  }
  const backup = `${legacyEnvFile(file)}.bak`
  if (existsSync(backup)) {
    const text = readFileSync(backup, 'utf8')
    const kept = text.replace(
      new RegExp(
        `^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*(?:\\r?\\n|$)`,
        'gm'
      ),
      ''
    )
    if (kept !== text) {
      writeSettingsFile(backup, kept)
      notes.push(`${key} is removed from ${path.basename(backup)}`)
    }
  }
  return notes
}

/**
 * Brings a settings file an earlier version wrote up to date, once. Write
 * switches for the connections came in v0.6.5: a connection already set up
 * keeps writing as it did (draft PRs, Jira issues and comments), and one set
 * up later starts with Write off. Returns a line for the log per change.
 */
export function upgradeSettings(file: string): string[] {
  if (!existsSync(file)) return []
  const text = readFileSync(file, 'utf8')
  let values: Record<string, string>
  try {
    values = settingsValues(parseSettings(text))
  } catch {
    // Not JSON: the app says so where the file is shown
    return []
  }
  if ('OPS_GIT_WRITE' in values || 'OPS_JIRA_WRITE' in values) return []
  const set = new Set(
    connectionStates(lookupIn(values))
      .filter((state) => state.missing.length === 0)
      .map((state) => state.id)
  )
  const changes = {
    OPS_GIT_WRITE: set.has('github') ? 'on' : 'off',
    OPS_JIRA_WRITE: set.has('jira') ? 'on' : 'off',
  }
  writeSettingsFile(file, updateSettingsText(text, changes))
  return Object.entries(changes).map(
    ([key, value]) =>
      `${settingName(key)}: ${value}${value === 'on' ? ' (set up before Write had a switch)' : ''}`
  )
}
