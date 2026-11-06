import type { DesktopBridge } from '@src/desktop-bridge'
import {
  SETTING_FIELDS,
  settingSectionOf,
  shownFor,
  type SettingField,
  type SettingSection,
  type SettingsChanges,
  type SettingsIssue,
  type SettingsView,
} from '@src/settings/fields'
import { useEffect, useMemo, useState } from 'react'

/**
 * The Settings screen's draft (settings-page.tsx): what you changed there,
 * over the settings file as it was read, kept across sections until it is
 * saved together from the bar at the bottom. The page holds it with
 * useSettingsDraft and draws it; the rest is plain data in and out.
 */

/** What you changed on the screen and have not saved yet */
export interface SettingsDraft {
  /** The values typed or picked, by key; an empty string reverts to default */
  values: Readonly<Record<string, string>>
  /** The secrets whose input is open: only what is typed there is saved */
  editing: ReadonlySet<string>
}

/** The fields as saved and checked (their words are English) */
const FIELD = new Map(SETTING_FIELDS.map((field) => [field.key, field]))

/** A field's value in the file; a secret's never comes to the screen */
const current = (
  field: SettingField,
  view: Pick<SettingsView, 'values'> | undefined
) => (field.type === 'secret' ? '' : (view?.values[field.key] ?? ''))

/**
 * What a save sends: only values that actually changed, null for one put
 * back to its default. Secrets are sent only when newly entered. With the
 * file not read yet, every value typed counts as changed.
 */
export function draftChanges(
  draft: SettingsDraft,
  view: Pick<SettingsView, 'values'> | undefined
): SettingsChanges {
  const result: SettingsChanges = {}
  for (const field of SETTING_FIELDS) {
    if (!(field.key in draft.values)) continue
    const value = draft.values[field.key]!.trim()
    if (field.type === 'secret') {
      if (draft.editing.has(field.key) && value) result[field.key] = value
      continue
    }
    if (value !== current(field, view))
      result[field.key] = value === '' ? null : value
  }
  return result
}

/** What a field's control shows: what you typed, else the file's value */
export const typedValue = (
  draft: SettingsDraft,
  view: Pick<SettingsView, 'values'>,
  field: SettingField
): string => draft.values[field.key] ?? current(field, view)

/**
 * The value in effect once the draft is saved: the draft, else the file,
 * else the default. Secrets read "set" or "".
 */
export function draftValue(
  draft: SettingsDraft,
  view: Pick<SettingsView, 'values' | 'secrets'>,
  key: string
): string {
  const field = FIELD.get(key)
  if (!field) return ''
  if (field.type === 'secret') {
    const entered = draft.editing.has(key) && Boolean(draft.values[key]?.trim())
    return entered || view.secrets[key]?.set ? 'set' : ''
  }
  const value =
    key in draft.values ? draft.values[key]!.trim() : (view.values[key] ?? '')
  return value || field.default || ''
}

/**
 * Whether a field has a row now: not one the screen sets some other way, not
 * one going away unless the file still has it, and only while the value it
 * follows calls for it. valueOf gives the value in effect (draftValue).
 */
export function fieldShown(
  field: SettingField,
  view: Pick<SettingsView, 'values' | 'secrets'>,
  valueOf: (key: string) => string
): boolean {
  /** In the file now, as saved */
  const saved = () =>
    field.type === 'secret'
      ? Boolean(view.secrets[field.key]?.set)
      : Boolean(view.values[field.key])
  return (
    !field.internal &&
    (!field.retiring || saved()) &&
    (!field.shownWhen ||
      shownFor(field.shownWhen, valueOf(field.shownWhen.key)))
  )
}

/**
 * Whether the changes include one Pace picks up only when it restarts (not
 * those read where they are used)
 */
export const restartsPace = (changes: SettingsChanges): boolean =>
  SETTING_FIELDS.some(
    (field) => field.applies !== 'app' && field.key in changes
  )

/**
 * Where the issues found in the draft are: those with no field on screen
 * (general ones, or a field hidden by another value), which the save bar
 * spells out, and the section of the first that has one
 */
export function issuesPlaced(
  issues: readonly SettingsIssue[],
  shown: (field: SettingField) => boolean
): { offscreen: SettingsIssue[]; section?: SettingSection } {
  return {
    offscreen: issues.filter((issue) => {
      const field = issue.key ? FIELD.get(issue.key) : undefined
      return !field || !shown(field)
    }),
    section: issues.map((issue) => settingSectionOf(issue.key)).find(Boolean),
  }
}

/** How many of these settings, changed or with an issue, are in a section */
export const inSection = (
  keys: readonly (string | undefined)[],
  section: string
): number => keys.filter((key) => settingSectionOf(key) === section).length

/**
 * The page's draft: the values changed in the UI and the secrets whose input
 * is open, what a save would send, and the issues the app finds in it,
 * checked a moment after the last change
 */
export function useSettingsDraft(
  view: SettingsView | undefined,
  settings: DesktopBridge['settings'] | undefined
) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set())
  const [issues, setIssues] = useState<SettingsIssue[]>([])
  // Sends only values that actually changed. Secrets are sent only when newly
  // entered.
  const changes = useMemo(
    () => draftChanges({ values, editing }, view),
    [values, editing, view]
  )
  const changeCount = Object.keys(changes).length

  useEffect(() => {
    if (!settings || changeCount === 0) {
      setIssues([])
      return
    }
    const timer = setTimeout(
      () => void settings.validate(changes).then(setIssues),
      300
    )
    return () => clearTimeout(timer)
  }, [settings, changes, changeCount])

  /** Drops what was typed for these settings */
  const drop = (...keys: string[]) =>
    setValues((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([key]) => !keys.includes(key))
      )
    )
  return {
    values,
    editing,
    changes,
    changeCount,
    issues,
    setIssues,
    set: (key: string, value: string) =>
      setValues((d) => ({ ...d, [key]: value })),
    /** Fills in several values at once, over what was typed */
    fill: (more: Record<string, string>) =>
      setValues((d) => ({ ...d, ...more })),
    drop,
    /** Opens a secret's input, or closes it and drops what was typed. */
    edit: (key: string, on: boolean) => {
      setEditing((prev) => {
        const next = new Set(prev)
        if (on) next.add(key)
        else next.delete(key)
        return next
      })
      if (!on) drop(key)
    },
    /** Reverts every change, and the issues found in them */
    reset: () => {
      setValues({})
      setEditing(new Set())
      setIssues([])
    },
  }
}
