import { afterEach, describe, expect, it } from 'vitest'
import { checkConfig } from '../src/config.js'
import { setLocale } from '../src/i18n/locale.js'
import { checkBrokerEnv } from '../src/sandbox/env.js'
import {
  SETTING_FIELDS,
  SETTING_GROUPS,
  SETTING_SECTIONS,
  settingFields,
  settingLabel,
} from '../src/settings/fields.js'
import { FIELDS_KO, GROUPS_KO, SECTIONS_KO } from '../src/settings/fields.ko.js'

const hangul = /[가-힣]/

describe('the settings screen in Korean', () => {
  it('words every field shown on the screen', () => {
    for (const field of SETTING_FIELDS.filter((field) => !field.internal)) {
      const words = FIELDS_KO[field.key]
      // Some are names alone, such as Jira URL.
      expect(words?.label, field.key).toBeTruthy()
      if (field.help !== undefined) expect(words?.help, field.key).toBeTruthy()
      for (const option of field.options ?? []) {
        if (option.help === undefined) continue
        const said = words?.options?.[option.value]
        expect(said?.label, `${field.key}=${option.value}`).toBeTruthy()
        expect(said?.help, `${field.key}=${option.value}`).toMatch(hangul)
      }
    }
  })

  it('words only fields and options that exist', () => {
    const keys = new Set(SETTING_FIELDS.map((field) => field.key))
    for (const [key, words] of Object.entries(FIELDS_KO)) {
      expect(keys.has(key), key).toBe(true)
      const field = SETTING_FIELDS.find((field) => field.key === key)!
      for (const value of Object.keys(words.options ?? {}))
        expect(
          field.options?.some((option) => option.value === value),
          `${key}=${value}`
        ).toBe(true)
    }
  })

  it('words every section and group', () => {
    for (const section of SETTING_SECTIONS)
      expect(SECTIONS_KO[section.id].label).toMatch(hangul)
    for (const group of SETTING_GROUPS)
      expect(GROUPS_KO[group.id].help).toMatch(hangul)
  })
})

describe('settings in the current language', () => {
  afterEach(() => setLocale('en'))

  it('keeps the English, and puts the Korean in its place', () => {
    expect(settingFields('en')).toBe(SETTING_FIELDS)
    expect(settingLabel('SLACK_BOT_TOKEN')).toBe('Bot token')
    setLocale('ko')
    expect(settingLabel('SLACK_BOT_TOKEN')).toBe('봇 토큰')
    const connection = settingFields().find(
      (field) => field.key === 'SLACK_CONNECTION'
    )!
    // The values stay; only the words change.
    expect(connection.options?.map((option) => option.value)).toEqual([
      'hub',
      'app',
    ])
    expect(connection.options?.[0]?.label).toBe('팀 허브')
  })

  it('words validation issues in the language at the time they are checked', () => {
    const env = {
      SLACK_BOT_TOKEN: 'nope',
      SLACK_APP_TOKEN: 'xapp-1',
      SOCKET_CLIENT_PING_TIMEOUT_MS: '10',
      MENTION_ALLOWED_USERS: 'U1',
    }
    const english = checkConfig(env).map((issue) => issue.message)
    expect(english).toContain('Must be a bot token starting with xoxb-')
    expect(english).toContain('Too small: expected number to be >=1000')
    setLocale('ko')
    const korean = checkConfig(env).map((issue) => issue.message)
    expect(korean).toContain('xoxb-로 시작하는 봇 토큰이어야 해요')
    expect(korean).toContain('1000 이상이어야 해요')
    expect(
      checkConfig({ SLACK_CONNECTION: 'app' }).map((issue) => issue.message)
    ).toContain('내 Slack 앱에는 봇 토큰이 필요해요.')
    expect(
      checkBrokerEnv({ OPS_SSH_KEY: '~/.ssh/id' }).map((issue) => issue.message)
    ).toEqual(['절대 경로여야 해요. (~는 펼쳐지지 않아요)'])
  })
})
