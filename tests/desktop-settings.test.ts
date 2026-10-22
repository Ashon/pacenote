import {
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { SettingsStore } from '../apps/desktop/src/settings.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-desktop-settings-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const SETTINGS = `{
  "slack": {
    "botToken": "xoxb-1111-2222-abcd",
    "appToken": "xapp-1-A0APP-3333-wxyz"
  },
  "answers": { "reasoner": "claude" },
  "env": {
    "LLM_API_URL": "https://llm.example.com",
    "LLM_API_KEY": "keep-me"
  }
}
`

function store(env: NodeJS.ProcessEnv = {}, text = SETTINGS) {
  const settingsFile = path.join(
    root,
    `${Math.random().toString(36).slice(2)}.json`
  )
  writeFileSync(settingsFile, text, { mode: 0o600 })
  return {
    settingsFile,
    store: new SettingsStore({ settingsFile, dataDir: '/tmp/pacenote', env }),
  }
}

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))

describe('settings store', () => {
  it('masks secrets and reports environment overrides', () => {
    const { store: s } = store({ LOG_LEVEL: 'debug' })
    const view = s.view()
    expect(view.secrets.SLACK_BOT_TOKEN).toEqual({
      set: true,
      hint: 'xoxb-...abcd',
    })
    expect(view.secrets.SANDBOX_CLAUDE_OAUTH_TOKEN).toEqual({ set: false })
    expect(JSON.stringify(view)).not.toContain('xoxb-1111')
    expect(view.values.REASONER).toBe('claude')
    expect(view.values.LOG_LEVEL).toBe('')
    expect(view.overridden).toEqual(['LOG_LEVEL'])
    expect(view.problem).toBeUndefined()
  })

  it('says why a file it cannot read is empty, and saves nothing over it', () => {
    const broken = '{ "slack": { "botToken": "xoxb-1" }\n'
    const { settingsFile, store: s } = store({}, broken)
    const view = s.view()
    expect(view.problem).toMatch(/not valid JSON/)
    expect(view.secrets.SLACK_BOT_TOKEN).toEqual({ set: false })
    expect(s.save({ TIMEZONE: 'UTC' })).toEqual([
      { message: expect.stringMatching(/not valid JSON/) },
    ])
    expect(readFileSync(settingsFile, 'utf8')).toBe(broken)
  })

  it('validates with the bot rules and rejects unknown entries and required empty values', () => {
    const { store: s } = store()
    expect(s.validate({ MENTION_CONCURRENCY: '3' })).toEqual([])
    expect(s.validate({ MENTION_CONCURRENCY: '0' })).toEqual([
      expect.objectContaining({ key: 'MENTION_CONCURRENCY' }),
    ])
    expect(s.validate({ OPS_TOOLS: 'on' })).toEqual([
      expect.objectContaining({ key: 'OPS_TOOLS' }),
    ])
    expect(s.validate({ LLM_API_KEY: 'x' })).toEqual([
      {
        key: 'LLM_API_KEY',
        message: 'This entry cannot be changed from the Settings screen.',
      },
    ])
    // A token not entered yet does not block saving the rest (the bot shows
    // "Setup needed"), but a wrong one does.
    expect(s.validate({ SLACK_BOT_TOKEN: ' ' })).toEqual([])
    expect(s.validate({ SLACK_BOT_TOKEN: 'xapp-1-wrong-kind' })).toEqual([
      expect.objectContaining({ key: 'SLACK_BOT_TOKEN' }),
    ])
    expect(s.validate('bad')).toEqual([
      { message: 'The changes format is invalid.' },
    ])
  })

  it('saves only changed values and keeps the rest; writes nothing when validation fails', () => {
    const { settingsFile, store: s } = store()
    expect(
      s.save({
        SLACK_BOT_TOKEN: 'xoxb-9999-new',
        REASONER: null,
        TIMEZONE: 'UTC',
      })
    ).toEqual([])
    expect(read(settingsFile)).toEqual({
      slack: {
        botToken: 'xoxb-9999-new',
        appToken: 'xapp-1-A0APP-3333-wxyz',
      },
      answers: { timeZone: 'UTC' },
      env: {
        LLM_API_URL: 'https://llm.example.com',
        LLM_API_KEY: 'keep-me',
      },
    })
    const before = readFileSync(settingsFile, 'utf8')
    expect(s.save({ MENTION_CONCURRENCY: '-1' })).not.toEqual([])
    expect(readFileSync(settingsFile, 'utf8')).toBe(before)
  })

  it('saves you as the one Pace answers, and nothing that would answer more', () => {
    const { store: s, settingsFile } = store()
    expect(s.save({ MENTION_ALLOWED_USERS: 'u0me' })).toEqual([])
    expect(read(settingsFile).slack.memberId).toBe('u0me')
    const before = readFileSync(settingsFile, 'utf8')
    expect(s.save({ MENTION_ALLOWED_USERS: 'U0ME, U0BOB' })).toEqual([
      expect.objectContaining({ key: 'MENTION_ALLOWED_USERS' }),
    ])
    // Answering the whole workspace is not a setting any more.
    expect(s.save({ MENTION_ANYONE: 'on' })).toEqual([
      {
        key: 'MENTION_ANYONE',
        message: 'This entry cannot be changed from the Settings screen.',
      },
    ])
    expect(readFileSync(settingsFile, 'utf8')).toBe(before)
  })

  it('reads the file again once it changes, and keeps what callers change to themselves', () => {
    const { settingsFile, store: s } = store({ LOG_LEVEL: 'debug' })
    const env = s.effectiveEnv()
    expect(env).toMatchObject({ REASONER: 'claude', LOG_LEVEL: 'debug' })
    env.REASONER = 'changed'
    s.fileValues().REASONER = 'changed'
    expect(s.effectiveEnv().REASONER).toBe('claude')
    expect(s.fileValues().REASONER).toBe('claude')

    // The same size, written in place: its time tells it apart.
    const edited = SETTINGS.replace(
      'xoxb-1111-2222-abcd',
      'xoxb-1111-2222-wxyz'
    )
    expect(edited.length).toBe(SETTINGS.length)
    writeFileSync(settingsFile, edited)
    const later = new Date(Date.now() + 5_000)
    utimesSync(settingsFile, later, later)
    expect(s.effectiveEnv().SLACK_BOT_TOKEN).toBe('xoxb-1111-2222-wxyz')
    expect(s.fileValues().SLACK_BOT_TOKEN).toBe('xoxb-1111-2222-wxyz')
    expect(s.view().secrets.SLACK_BOT_TOKEN).toEqual({
      set: true,
      hint: 'xoxb-...wxyz',
    })

    // Saved through the store
    expect(s.save({ TIMEZONE: 'UTC' })).toEqual([])
    expect(s.effectiveEnv().TIMEZONE).toBe('UTC')

    // Gone: none, and the view says there is no file
    rmSync(settingsFile)
    expect(s.effectiveEnv()).toEqual({ LOG_LEVEL: 'debug' })
    expect(s.view().exists).toBe(false)
  })

  it('validates with app environment variables taking precedence over the file', () => {
    const { store: s } = store({
      REASONER_SANDBOX: 'vm',
      MENTION_ALLOWED_USERS: 'U1',
    })
    // claude in the built-in sandbox needs a sandbox token, which can be saved
    // later.
    expect(s.validate({})).toEqual([])
    expect(
      s.validate({ SANDBOX_CLAUDE_OAUTH_TOKEN: 'sk-ant-oat01-xxxx' })
    ).toEqual([])
  })
})
