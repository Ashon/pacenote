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
      owner: 'U0ME',
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

  it('normalizes and validates your member ID', () => {
    expect(
      loadConfig({ ...env, MENTION_ALLOWED_USERS: ' u0boss ' }).mention.owner
    ).toBe('U0BOSS')
    // The same ID twice is still one person.
    expect(
      loadConfig({ ...env, MENTION_ALLOWED_USERS: 'U0BOSS,u0boss' }).mention
        .owner
    ).toBe('U0BOSS')
    expect(() => loadConfig({ ...env, MENTION_ALLOWED_USERS: '@bob' })).toThrow(
      /slack\.memberId: Must be a Slack user ID/
    )
  })

  it('answers only you: no one until you say who you are, never a list or a whole workspace', () => {
    const nobody = { ...env, MENTION_ALLOWED_USERS: '' }
    expect(() => loadConfig(nobody)).toThrow(/Say who you are/)
    expect(checkConfig(nobody)).toEqual([
      expect.objectContaining({ key: 'MENTION_ALLOWED_USERS', missing: true }),
    ])
    // More than one person is refused outright, not narrowed to one.
    const two = { ...env, MENTION_ALLOWED_USERS: 'U0ME,U0BOB' }
    expect(() => loadConfig(two)).toThrow(/one Slack member ID, your own/)
    // Not merely missing, so Settings will not save it.
    expect(checkConfig(two)).toEqual([
      {
        key: 'MENTION_ALLOWED_USERS',
        message: expect.stringMatching(/your own: Pace answers only you/),
      },
    ])
    // Answering anyone in the workspace is gone, with or without a list, and
    // says so instead of quietly answering only you.
    for (const anyone of [
      { ...env, MENTION_ANYONE: 'on' },
      { ...nobody, MENTION_ANYONE: 'ON' },
    ]) {
      expect(() => loadConfig(anyone)).toThrow(/MENTION_ANYONE is gone/)
      expect(checkConfig(anyone)).toEqual([
        expect.objectContaining({ key: 'MENTION_ALLOWED_USERS' }),
      ])
    }
    expect(loadConfig({ ...env, MENTION_ANYONE: 'off' }).mention.owner).toBe(
      'U0ME'
    )
    // A hub desktop answers the member it is paired as, which the hub names
    // once connected; a list left from your own app has no say.
    const hub = {
      HUB_URL: 'https://hub.example.com',
      HUB_TOKEN: 'a'.repeat(64),
      SLACK_CONNECTION: 'hub',
    }
    expect(loadConfig(hub).mention.owner).toBeUndefined()
    expect(
      loadConfig({ ...hub, MENTION_ALLOWED_USERS: 'U0ME,U0BOB' }).mention.owner
    ).toBeUndefined()
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
      /reference directory must be an absolute path/
    )
    expect(() =>
      loadConfig({ ...env, MENTION_WORKSPACE: `${dir}/missing` })
    ).toThrow(/reference directory must be an absolute path/)
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
    // The same in the sandbox
    expect(
      loadConfig({ ...codex, REASONER_SANDBOX: 'vm' }).reasoner
    ).toMatchObject({ model: 'gpt-x', reasoningEffort: 'high' })
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
      /Ops tools need the built-in sandbox/
    )
    expect(() =>
      loadConfig({ ...base, REASONER_SANDBOX: 'vm', MENTION_ANYONE: 'on' })
    ).toThrow(/MENTION_ANYONE is gone/)
    const config = loadConfig({
      ...base,
      REASONER_SANDBOX: 'vm',
      MENTION_ALLOWED_USERS: 'U1',
    })
    // The broker is relayed into each VM at this address, and Pace's own
    // tools come through the same door.
    expect(config.reasoner.mcpServers).toEqual([
      { name: 'ops', url: 'http://127.0.0.1:8080/mcp' },
      { name: 'pacenote', url: 'http://127.0.0.1:8080/pace/mcp' },
    ])
    expect(config.reasoner.vm?.broker).toBeDefined()
    // Without ops tools, the VM still gets Pace's own; on this Mac, neither.
    expect(
      loadConfig({ ...base, OPS_TOOLS: 'off', REASONER_SANDBOX: 'vm' }).reasoner
        .mcpServers
    ).toEqual([{ name: 'pacenote', url: 'http://127.0.0.1:8080/pace/mcp' }])
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
    expect(() => loadConfig({ ...env, TIMEZONE: 'Seoul' })).toThrow(
      /answers\.timeZone: Must be a time zone name/
    )
  })

  it('reports which value is wrong when a token format is invalid', () => {
    expect(() => loadConfig({ ...env, SLACK_BOT_TOKEN: 'xoxp-1' })).toThrow(
      /Some settings are invalid\.\n- slack\.botToken: /
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
      { key: 'MENTION_ALLOWED_USERS', missing: undefined },
    ])
    // The sandbox's sign-in is not a setting: Pace starts without it and says
    // so (src/index.ts)
    expect(checkConfig({ ...env, REASONER_SANDBOX: 'vm' })).toEqual([])
  })

  it('does not mark a wrong value as missing', () => {
    expect(checkConfig({ ...env, SLACK_BOT_TOKEN: 'xoxp-1' })).toEqual([
      expect.not.objectContaining({ missing: true }),
    ])
  })
})
