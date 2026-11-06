import {
  SETTING_FIELDS,
  type SettingField,
  type SettingsView,
} from '@src/settings/fields'
import { describe, expect, it } from 'vitest'
import {
  draftChanges,
  draftValue,
  fieldShown,
  inSection,
  issuesPlaced,
  restartsPace,
  typedValue,
  type SettingsDraft,
} from './settings-draft'

const view = (extra: Partial<SettingsView> = {}): SettingsView => ({
  file: '/Users/you/.pacenote/settings.json',
  exists: true,
  dataDir: '/Users/you/.pacenote',
  values: {},
  secrets: {},
  overridden: [],
  ...extra,
})

const draft = (
  values: Record<string, string>,
  editing: string[] = []
): SettingsDraft => ({ values, editing: new Set(editing) })

const field = (key: string): SettingField =>
  SETTING_FIELDS.find((each) => each.key === key)!

describe('what a save sends', () => {
  const saved = view({
    values: { TIMEZONE: 'Asia/Seoul', REASONER_MODEL: 'opus' },
    secrets: { SLACK_BOT_TOKEN: { set: true, hint: 'abcd' } },
  })

  it('sends only the values that changed, trimmed', () => {
    expect(
      draftChanges(
        draft({
          TIMEZONE: ' Europe/Berlin ',
          REASONER_MODEL: 'opus',
          LOG_LEVEL: 'debug',
        }),
        saved
      )
    ).toEqual({ TIMEZONE: 'Europe/Berlin', LOG_LEVEL: 'debug' })
  })

  it('sends null for a value emptied, back to its default', () => {
    expect(draftChanges(draft({ REASONER_MODEL: '  ' }), saved)).toEqual({
      REASONER_MODEL: null,
    })
    // Not in the file either: nothing changed
    expect(draftChanges(draft({ OPS_FS_ROOT: '' }), saved)).toEqual({})
  })

  it('sends a secret only when newly entered in its open input', () => {
    expect(
      draftChanges(
        draft({ SLACK_BOT_TOKEN: ' xoxb-1 ' }, ['SLACK_BOT_TOKEN']),
        saved
      )
    ).toEqual({ SLACK_BOT_TOKEN: 'xoxb-1' })
    // Typed, then its input closed; or opened and left empty
    expect(draftChanges(draft({ SLACK_BOT_TOKEN: 'xoxb-1' }), saved)).toEqual(
      {}
    )
    expect(
      draftChanges(draft({ SLACK_BOT_TOKEN: ' ' }, ['SLACK_BOT_TOKEN']), saved)
    ).toEqual({})
  })

  it('leaves out what is not a setting', () => {
    expect(draftChanges(draft({ NOT_A_SETTING: 'x' }), saved)).toEqual({})
  })

  it('counts every value typed before the file is read', () => {
    expect(
      draftChanges(draft({ SLACK_CONNECTION: 'hub', HUB_URL: '' }), undefined)
    ).toEqual({ SLACK_CONNECTION: 'hub' })
  })
})

describe("a field's values", () => {
  const saved = view({
    values: { TIMEZONE: 'Asia/Seoul', REASONER_MODEL: '' },
    secrets: { SLACK_BOT_TOKEN: { set: true } },
  })

  it('shows in its control what you typed, else what the file has', () => {
    expect(
      typedValue(draft({ TIMEZONE: 'UTC ' }), saved, field('TIMEZONE'))
    ).toBe('UTC ')
    expect(typedValue(draft({}), saved, field('TIMEZONE'))).toBe('Asia/Seoul')
    expect(typedValue(draft({}), saved, field('OPS_FS_ROOT'))).toBe('')
    // A secret's input starts empty
    expect(typedValue(draft({}), saved, field('SLACK_BOT_TOKEN'))).toBe('')
  })

  it('takes effect as the draft, else the file, else the default', () => {
    expect(draftValue(draft({ TIMEZONE: ' UTC ' }), saved, 'TIMEZONE')).toBe(
      'UTC'
    )
    expect(draftValue(draft({}), saved, 'TIMEZONE')).toBe('Asia/Seoul')
    // Emptied, it is the default: this machine's time zone
    expect(draftValue(draft({ TIMEZONE: '' }), saved, 'TIMEZONE')).toBe(
      field('TIMEZONE').default
    )
    expect(draftValue(draft({}), saved, 'REASONER_TIMEOUT_SEC')).toBe('900')
    expect(draftValue(draft({}), saved, 'REASONER_MODEL')).toBe('')
    expect(draftValue(draft({}), saved, 'NOT_A_SETTING')).toBe('')
  })

  it('reads a secret as set once saved, or entered in its open input', () => {
    expect(draftValue(draft({}), saved, 'SLACK_BOT_TOKEN')).toBe('set')
    expect(draftValue(draft({}), saved, 'SLACK_APP_TOKEN')).toBe('')
    expect(
      draftValue(
        draft({ SLACK_APP_TOKEN: 'xapp-1' }, ['SLACK_APP_TOKEN']),
        saved,
        'SLACK_APP_TOKEN'
      )
    ).toBe('set')
    expect(
      draftValue(draft({ SLACK_APP_TOKEN: 'xapp-1' }), saved, 'SLACK_APP_TOKEN')
    ).toBe('')
  })
})

describe('which fields have a row', () => {
  const shown = (key: string, typed: SettingsDraft, saved: SettingsView) =>
    fieldShown(field(key), saved, (other) => draftValue(typed, saved, other))

  it('follows the value a field is shown for, as it is in the draft', () => {
    expect(shown('HUB_URL', draft({}), view())).toBe(false)
    expect(shown('HUB_URL', draft({ SLACK_CONNECTION: 'hub' }), view())).toBe(
      true
    )
    expect(shown('SLACK_BOT_TOKEN', draft({}), view())).toBe(true)
  })

  it('leaves out the fields the screen sets some other way', () => {
    expect(shown('HUB_TOKEN', draft({ SLACK_CONNECTION: 'hub' }), view())).toBe(
      false
    )
  })

  it('shows a field going away only while the file still has it', () => {
    expect(shown('SANDBOX_CLAUDE_OAUTH_TOKEN', draft({}), view())).toBe(false)
    expect(
      shown(
        'SANDBOX_CLAUDE_OAUTH_TOKEN',
        draft({}),
        view({ secrets: { SANDBOX_CLAUDE_OAUTH_TOKEN: { set: true } } })
      )
    ).toBe(true)
  })
})

describe('changes Pace picks up on a restart', () => {
  it('are those not read where they are used', () => {
    expect(restartsPace({ LOG_LEVEL: 'debug' })).toBe(true)
    expect(restartsPace({ TASKS: 'on', TASKS_DMS: null })).toBe(false)
    expect(restartsPace({})).toBe(false)
  })
})

describe('where the issues are', () => {
  it('spells out those with no field on screen, and finds their section', () => {
    const typed = draft({})
    const saved = view()
    const shown = (each: SettingField) =>
      fieldShown(each, saved, (key) => draftValue(typed, saved, key))
    const general = { message: 'The file could not be written' }
    const hidden = { key: 'HUB_URL', message: 'Not a URL' }
    const onScreen = { key: 'TIMEZONE', message: 'Not a time zone' }
    expect(issuesPlaced([general, hidden, onScreen], shown)).toEqual({
      offscreen: [general, hidden],
      section: 'messengers',
    })
    expect(issuesPlaced([general], shown)).toEqual({
      offscreen: [general],
      section: undefined,
    })
    expect(issuesPlaced([onScreen], shown)).toEqual({
      offscreen: [],
      section: 'answers',
    })
  })

  it("counts a section's changes and issues", () => {
    const keys = ['SLACK_BOT_TOKEN', 'TASKS', 'TASKS_DMS', undefined, 'NOPE']
    expect(inSection(keys, 'tasks')).toBe(2)
    expect(inSection(keys, 'messengers')).toBe(1)
    expect(inSection(keys, 'general')).toBe(0)
  })
})
