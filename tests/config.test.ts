import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkConfig, loadConfig } from '../src/config.js'
import { defaultHome } from '../src/settings/home.js'

const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-ws-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const env = {
  SLACK_BOT_TOKEN: 'xoxb-1',
  SLACK_APP_TOKEN: 'xapp-1',
  MENTION_ALLOWED_USERS: 'U0ME',
}

describe('loadConfig', () => {
  it('fills in defaults', () => {
    const config = loadConfig(env)
    expect(config.reasoner).toMatchObject({
      backend: 'claude',
      model: 'claude-opus-5-5',
    })
    expect(config.reasoner.vm).toBeUndefined()
    expect(config.mention).toEqual({
      allowedUserIds: ['U0ME'],
      workspace: undefined,
      concurrency: 2,
    })
    expect(config.render).toMatchObject({ enabled: true, generatedMaxPx: 512 })
    // The default home: ~/.pacenote (tests/home.test.ts)
    expect(config.dataDir).toBe(defaultHome())
    expect(config.history).toEqual({ retentionDays: 30 })
    expect(loadConfig({ ...env, HISTORY: 'off' }).history).toBeUndefined()
    expect(
      loadConfig({ ...env, GENERATED_IMAGE_MAX_PX: '0' }).render.generatedMaxPx
    ).toBe(0)
  })

  it('treats empty values as unset', () => {
    const config = loadConfig({
      ...env,
      MENTION_WORKSPACE: '',
      REASONER_MODEL: ' ',
    })
    expect(config.mention.workspace).toBeUndefined()
    expect(config.reasoner.model).toBe('claude-opus-5-5')
  })

  it('normalizes and validates the allowed user ID list', () => {
    const config = loadConfig({
      ...env,
      MENTION_ALLOWED_USERS: 'u0boss, W0TEAM,U0BOSS',
    })
    expect(config.mention.allowedUserIds).toEqual(['U0BOSS', 'W0TEAM'])
    expect(() => loadConfig({ ...env, MENTION_ALLOWED_USERS: '@bob' })).toThrow(
      /MENTION_ALLOWED_USERS/
    )
  })

  it('answers no one through your own Slack app until you say who may ask', () => {
    const noList = { ...env, MENTION_ALLOWED_USERS: '' }
    expect(() => loadConfig(noList)).toThrow(/Choose who may ask Pace/)
    expect(checkConfig(noList)).toEqual([
      expect.objectContaining({ key: 'MENTION_ALLOWED_USERS', missing: true }),
    ])
    // Anyone in the workspace, said outright; the list then has no say.
    expect(
      loadConfig({ ...noList, MENTION_ANYONE: 'on' }).mention.allowedUserIds
    ).toEqual([])
    expect(
      loadConfig({ ...env, MENTION_ANYONE: 'on' }).mention.allowedUserIds
    ).toEqual([])
    // A hub desktop gets only its own member's mentions.
    expect(
      loadConfig({
        HUB_URL: 'https://hub.example.com',
        HUB_TOKEN: 'a'.repeat(64),
        SLACK_CONNECTION: 'hub',
      }).mention.allowedUserIds
    ).toEqual([])
  })

  it("never lets the reasoner read Pacenote's folders or credentials on this Mac", () => {
    const config = loadConfig({ ...env, PACENOTE_DATA_DIR: dir })
    expect(config.reasoner.deniedReads).toEqual(
      expect.arrayContaining([
        dir,
        defaultHome(),
        path.join(homedir(), '.ssh'),
        path.join(homedir(), '.codex'),
      ])
    )
  })

  it('requires the reference directory to be an existing absolute path', () => {
    expect(
      loadConfig({ ...env, MENTION_WORKSPACE: dir }).mention.workspace
    ).toBe(dir)
    expect(() => loadConfig({ ...env, MENTION_WORKSPACE: './x' })).toThrow(
      /MENTION_WORKSPACE/
    )
    expect(() =>
      loadConfig({ ...env, MENTION_WORKSPACE: `${dir}/missing` })
    ).toThrow(/MENTION_WORKSPACE/)
  })

  it("passes codex's own model along when no model is set, since its config is not loaded", () => {
    const codexHome = mkdtempSync(path.join(dir, 'codex-'))
    const codex = { ...env, REASONER: 'codex', CODEX_HOME: codexHome }
    expect(loadConfig(codex).reasoner).toMatchObject({ backend: 'codex' })
    expect(loadConfig(codex).reasoner.model).toBeUndefined()
    writeFileSync(
      path.join(codexHome, 'config.toml'),
      'model = "gpt-x"\nmodel_reasoning_effort = "high"\n'
    )
    expect(loadConfig(codex).reasoner).toMatchObject({
      model: 'gpt-x',
      reasoningEffort: 'high',
    })
    expect(loadConfig({ ...codex, REASONER_MODEL: 'm' }).reasoner.model).toBe(
      'm'
    )
  })

  it('enables ops tools only in a sandbox and with an allowed user list', () => {
    const codexAuth = path.join(dir, 'auth.json')
    writeFileSync(codexAuth, '{}')
    const base = {
      ...env,
      REASONER: 'codex',
      REASONER_MODEL: 'm',
      SANDBOX_CODEX_AUTH_FILE: codexAuth,
      OPS_TOOLS: 'on',
    }
    expect(() => loadConfig({ ...base, MENTION_ALLOWED_USERS: 'U1' })).toThrow(
      /requires the built-in sandbox: REASONER_SANDBOX=vm/
    )
    expect(() =>
      loadConfig({ ...base, REASONER_SANDBOX: 'vm', MENTION_ANYONE: 'on' })
    ).toThrow(/MENTION_ALLOWED_USERS/)
    const config = loadConfig({
      ...base,
      REASONER_SANDBOX: 'vm',
      MENTION_ALLOWED_USERS: 'U1',
    })
    // The broker is relayed into each VM at this address.
    expect(config.reasoner.mcpServers).toEqual([
      { name: 'ops', url: 'http://127.0.0.1:8080/mcp' },
    ])
    expect(config.reasoner.vm?.broker).toBeDefined()
    expect(loadConfig(env).reasoner.mcpServers).toEqual([])
  })

  it('reads the Docker sandbox, which is gone, as the built-in one', () => {
    const config = loadConfig({
      ...env,
      REASONER_SANDBOX: 'docker',
      SANDBOX_CLAUDE_OAUTH_TOKEN: 'sk-ant-oat01-x',
    })
    expect(config.reasoner.vm).toMatchObject({ image: 'reasoner' })
  })

  it("shows times in this Mac's time zone unless one is set, and checks its name", () => {
    expect(loadConfig(env).timezone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    )
    expect(loadConfig({ ...env, TIMEZONE: '' }).timezone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    )
    expect(loadConfig({ ...env, TIMEZONE: 'America/New_York' }).timezone).toBe(
      'America/New_York'
    )
    expect(() => loadConfig({ ...env, TIMEZONE: 'Seoul' })).toThrow(/TIMEZONE/)
  })

  it('reports which value is wrong when a token format is invalid', () => {
    expect(() => loadConfig({ ...env, SLACK_BOT_TOKEN: 'xoxp-1' })).toThrow(
      /SLACK_BOT_TOKEN/
    )
  })
})

describe('Slack API URL', () => {
  it('defaults to slack.com and accepts https or a server on this computer', () => {
    const app = (extra: Record<string, string> = {}) => {
      const slack = loadConfig({ ...env, ...extra }).slack
      return slack.kind === 'app' ? slack.apiUrl : undefined
    }
    expect(app()).toBe('https://slack.com/api/')
    expect(app({ SLACK_API_URL: 'https://slack-gov.com/api' })).toBe(
      'https://slack-gov.com/api/'
    )
    expect(app({ SLACK_API_URL: 'http://127.0.0.1:4100/api/' })).toBe(
      'http://127.0.0.1:4100/api/'
    )
    expect(() =>
      loadConfig({ ...env, SLACK_API_URL: 'http://slack.example/api/' })
    ).toThrow(/SLACK_API_URL/)
  })
})

describe('checkConfig', () => {
  it('marks settings that are only missing, and still checks the rules behind them', () => {
    expect(
      checkConfig({ REASONER_SANDBOX: 'vm', OPS_TOOLS: 'on' }).map(
        ({ key, missing }) => ({
          key,
          missing,
        })
      )
    ).toEqual([
      { key: 'SLACK_BOT_TOKEN', missing: true },
      { key: 'SLACK_APP_TOKEN', missing: true },
      { key: 'MENTION_ALLOWED_USERS', missing: true },
      { key: 'SANDBOX_CLAUDE_OAUTH_TOKEN', missing: true },
    ])
    expect(
      checkConfig({
        REASONER_SANDBOX: 'vm',
        OPS_TOOLS: 'on',
        MENTION_ANYONE: 'on',
      }).map(({ key, missing }) => ({ key, missing }))
    ).toEqual([
      { key: 'SLACK_BOT_TOKEN', missing: true },
      { key: 'SLACK_APP_TOKEN', missing: true },
      { key: 'OPS_TOOLS', missing: undefined },
    ])
    expect(checkConfig({ ...env, REASONER_SANDBOX: 'vm' })).toEqual([
      expect.objectContaining({
        key: 'SANDBOX_CLAUDE_OAUTH_TOKEN',
        missing: true,
      }),
    ])
  })

  it('does not mark a wrong value as missing', () => {
    expect(checkConfig({ ...env, SLACK_BOT_TOKEN: 'xoxp-1' })).toEqual([
      expect.not.objectContaining({ missing: true }),
    ])
  })
})
