import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkConfig, EnvSchema } from '../src/config.js'
import { BrokerEnvSchema } from '../src/sandbox/env.js'
import {
  migrateEnvValues,
  readEnvFile,
  readEnvValues,
} from '../src/settings/env-file.js'
import {
  moveEnvSettings,
  parseSettings,
  readSettingsValues,
  SETTING_PLACES,
  settingName,
  settingsText,
  settingsValues,
  updateSettingsText,
  upgradeSettings,
  writeSettingsFile,
} from '../src/settings/settings-file.js'
import {
  brokerTools,
  connectionStates,
  lookupIn,
} from '../src/settings/tools.js'
import { MESSENGER_IDS } from '../src/messengers/ids.js'
import {
  maskSecret,
  SETTING_FIELDS,
  SETTING_GROUPS,
  setupSettingsRoute,
} from '../src/settings/fields.js'
import {
  checkSlackTokens,
  REQUIRED_BOT_SCOPES,
} from '../src/messengers/slack/check.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-settings-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('settings file', () => {
  it('keeps each setting at its place, as true/false, numbers and lists', () => {
    const text = settingsText({
      SLACK_BOT_TOKEN: 'xoxb-1',
      MENTION_ALLOWED_USERS: 'U1',
      TASKS: 'on',
      TASKS_PLAN_FIRST: 'off',
      TASKS_EXCLUDE_CHANNELS: '#random, C9',
      REASONER_TIMEOUT_SEC: '600',
      LLM_API_URL: 'https://llm.example.com',
    })
    expect(JSON.parse(text)).toEqual({
      slack: { botToken: 'xoxb-1', memberId: 'U1' },
      answers: { timeoutSec: 600 },
      tasks: {
        enabled: true,
        leaveOutChannels: ['#random', 'C9'],
        planFirst: false,
      },
      env: { LLM_API_URL: 'https://llm.example.com' },
    })
    expect(settingsValues(JSON.parse(text))).toEqual({
      SLACK_BOT_TOKEN: 'xoxb-1',
      MENTION_ALLOWED_USERS: 'U1',
      TASKS: 'on',
      TASKS_PLAN_FIRST: 'off',
      TASKS_EXCLUDE_CHANNELS: '#random, C9',
      REASONER_TIMEOUT_SEC: '600',
      LLM_API_URL: 'https://llm.example.com',
    })
  })

  it('changes only what changed, and keeps what the app does not know', () => {
    const text = `{
  "slack": { "botToken": "xoxb-old", "note": "mine" },
  "answers": { "reasoner": "codex" },
  "logs": { "level": "debug" },
  "env": { "LLM_API_KEY": "secret-value", "SLACK_APP_TOKEN": "xapp-old" }
}
`
    const next = JSON.parse(
      updateSettingsText(text, {
        SLACK_BOT_TOKEN: 'xoxb-new',
        SLACK_APP_TOKEN: 'xapp-new',
        LOG_LEVEL: null,
        REASONER: '',
        CLAUDE_BIN: '/opt/claude',
      })
    )
    expect(next).toEqual({
      slack: { botToken: 'xoxb-new', note: 'mine', appToken: 'xapp-new' },
      env: { LLM_API_KEY: 'secret-value', CLAUDE_BIN: '/opt/claude' },
    })
  })

  it('reads values written by hand, and a name under env, the way Pace reads them', () => {
    expect(
      settingsValues({
        slack: { memberId: ['U1'], clientPingTimeoutMs: '7000' },
        ops: { enabled: false, github: { owners: 'acme, tools' } },
        history: { retentionDays: null },
        env: { TASKS: true, SANDBOX_CPUS: 4 },
        tasks: { enabled: false },
      })
    ).toEqual({
      MENTION_ALLOWED_USERS: 'U1',
      SOCKET_CLIENT_PING_TIMEOUT_MS: '7000',
      OPS_TOOLS: 'off',
      OPS_GIT_ALLOWED_OWNERS: 'acme, tools',
      TASKS: 'off',
      SANDBOX_CPUS: '4',
    })
  })

  it('says what is wrong with a file that is not an object', () => {
    expect(parseSettings('')).toEqual({})
    expect(() => parseSettings('{ "slack": ')).toThrow(/not valid JSON/)
    expect(() => parseSettings('[]')).toThrow(/one object/)
    expect(() => updateSettingsText('nope', { TASKS: 'on' })).toThrow(
      /not valid JSON/
    )
  })

  it('gives every setting a place of its own, none inside another', () => {
    const paths = [...SETTING_PLACES.values()].map((place) =>
      place.path.join('.')
    )
    expect(new Set(paths).size).toBe(paths.length)
    for (const a of paths)
      for (const b of paths) expect(b.startsWith(`${a}.`)).toBe(false)
    expect(paths.some((path) => path.startsWith('env.'))).toBe(false)
    expect(settingName('SLACK_BOT_TOKEN')).toBe('slack.botToken')
    expect(settingName('CLAUDE_BIN')).toBe('CLAUDE_BIN')
  })

  it('writes the file for this account alone, whole or not at all', () => {
    const file = path.join(root, 'settings.json')
    writeSettingsFile(file, '{}\n')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    writeFileSync(file, '{}\n', { mode: 0o640 })
    writeSettingsFile(file, '{ "tasks": { "enabled": true } }\n')
    expect(readSettingsValues(file)).toEqual({ TASKS: 'on' })
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it("moves an earlier version's .env into settings.json once, keeping the old file", () => {
    const home = mkdtempSync(path.join(root, 'home-'))
    const file = path.join(home, 'settings.json')
    const legacy = path.join(home, '.env')
    writeFileSync(
      legacy,
      `# mine
SLACK_BOT_TOKEN=xoxb-1
MENTION_ALLOWED_USERS=U1
MENTION_ANYONE=off
REASONER_SANDBOX=docker
LOG_LEVEL=
TASKS=on
FAKE_CLAUDE_DIR='/tmp/a b'
`,
      { mode: 0o644 }
    )
    // Read where it is until it moves
    expect(readSettingsValues(file)).toMatchObject({ TASKS: 'on' })
    expect(moveEnvSettings(file)).toEqual([
      'REASONER_SANDBOX=docker is now vm (the built-in sandbox)',
      'MENTION_ANYONE is removed: Pace answers only you',
      'moved from .env to settings.json (the old file is .env.bak)',
    ])
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      slack: { botToken: 'xoxb-1', memberId: 'U1' },
      sandbox: { runIn: 'vm' },
      tasks: { enabled: true },
      env: { FAKE_CLAUDE_DIR: '/tmp/a b' },
    })
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(existsSync(legacy)).toBe(false)
    expect(readFileSync(`${legacy}.bak`, 'utf8')).toMatch(/^# mine/)
    expect(statSync(`${legacy}.bak`).mode & 0o777).toBe(0o600)
    // Once: a .env written again later is left alone, and the file wins.
    writeFileSync(legacy, 'TASKS=off\n')
    expect(moveEnvSettings(file)).toEqual([])
    expect(readSettingsValues(file).TASKS).toBe('on')
    expect(moveEnvSettings(path.join(root, 'none', 'settings.json'))).toEqual(
      []
    )
  })

  it('keeps a connection set up before Write had a switch writing, once', () => {
    const file = path.join(root, 'upgrade', 'settings.json')
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(
      file,
      settingsText({
        OPS_TOOLS: 'on',
        OPS_GIT_ALLOWED_OWNERS: 'acme',
        OPS_JIRA_URL: 'https://acme.atlassian.net',
        OPS_JIRA_EMAIL: 'me@acme.dev',
      })
    )
    // GitHub was set up and kept opening draft PRs; Jira was only half set up.
    expect(upgradeSettings(file)).toEqual([
      'ops.write.github: on (set up before Write had a switch)',
      'ops.write.jira: off',
    ])
    expect(JSON.parse(readFileSync(file, 'utf8')).ops).toMatchObject({
      enabled: true,
      github: { owners: ['acme'] },
      write: { github: true, jira: false },
    })
    expect(statSync(file).mode & 0o777).toBe(0o600)
    // Once: Jira finished later starts with Write off, as a new one does.
    writeFileSync(
      file,
      updateSettingsText(readFileSync(file, 'utf8'), {
        OPS_JIRA_TOKEN: 'secret',
        OPS_JIRA_PROJECTS: 'OPS',
      })
    )
    expect(upgradeSettings(file)).toEqual([])
    expect(readSettingsValues(file).OPS_JIRA_WRITE).toBe('off')
    // Nothing to bring up to date where there is no file, or no JSON
    expect(upgradeSettings(path.join(root, 'none', 'settings.json'))).toEqual(
      []
    )
    writeFileSync(file, '{ not json')
    expect(upgradeSettings(file)).toEqual([])
  })

  it('reads values from a .env with the same rules as node', () => {
    expect(readEnvValues('A=\'x "y"\'\nB=1 # note\n')).toEqual({
      A: 'x "y"',
      B: '1',
    })
    expect(readEnvFile(path.join(root, 'missing'))).toBe('')
    expect(migrateEnvValues({ REASONER_SANDBOX: 'vm', A: '1' })).toEqual({
      values: { REASONER_SANDBOX: 'vm', A: '1' },
      notes: [],
    })
  })
})

describe('setting fields', () => {
  it('puts every field in the bot or broker config with matching defaults', () => {
    // Slack credentials depend on SLACK_CONNECTION, so the schema itself
    // requires none of them.
    const botDefaults = EnvSchema.parse({}) as Record<string, unknown>
    const brokerDefaults = BrokerEnvSchema.parse({}) as Record<string, unknown>
    for (const field of SETTING_FIELDS) {
      const inBot = field.key in EnvSchema.shape
      const inBroker = field.key in BrokerEnvSchema.shape
      expect([field.key, inBot || inBroker]).toEqual([field.key, true])
      if (field.required) continue
      const value = (inBot ? botDefaults : brokerDefaults)[field.key]
      // An empty comma list is read as [].
      const unset =
        value === undefined || (Array.isArray(value) && value.length === 0)
      expect([field.key, unset ? undefined : String(value)]).toEqual([
        field.key,
        field.default,
      ])
    }
  })

  it("keeps every messenger's groups in the Messengers section, which setup opens first", () => {
    const messengerGroups = SETTING_GROUPS.filter((group) => group.messenger)
    expect(messengerGroups.map((group) => group.section)).toEqual(
      messengerGroups.map(() => 'messengers')
    )
    expect(
      MESSENGER_IDS.every((id) =>
        messengerGroups.some((g) => g.messenger === id)
      )
    ).toBe(true)
    expect(setupSettingsRoute()).toBe('#/settings/messengers')
    expect(setupSettingsRoute([{ key: 'MENTION_ALLOWED_USERS' }])).toBe(
      '#/settings/messengers'
    )
    expect(setupSettingsRoute([{ key: 'OPS_TOOLS' }])).toBe('#/settings/ops')
  })

  it('shows only the prefix and last 4 characters of secrets', () => {
    expect(maskSecret('xoxb-1234-5678-abcd')).toBe('xoxb-...abcd')
    expect(maskSecret('xapp-1-A1-zzzz9999')).toBe('xapp-...9999')
  })

  it('returns validation issues per setting, in words without its name', () => {
    const base = {
      SLACK_BOT_TOKEN: 'xoxb-1',
      SLACK_APP_TOKEN: 'xapp-1',
      MENTION_ALLOWED_USERS: 'U1',
    }
    expect(checkConfig(base)).toEqual([])
    expect(
      checkConfig({
        ...base,
        SLACK_BOT_TOKEN: 'xoxp-1',
        MENTION_CONCURRENCY: '0',
      })
    ).toEqual([
      { key: 'SLACK_BOT_TOKEN', message: expect.stringContaining('xoxb-') },
      expect.objectContaining({ key: 'MENTION_CONCURRENCY' }),
    ])
    expect(
      checkConfig({ ...base, OPS_TOOLS: 'on', MENTION_ALLOWED_USERS: 'U1' })
    ).toEqual([
      {
        key: 'OPS_TOOLS',
        message: expect.stringContaining('built-in sandbox'),
      },
    ])
  })
})

describe('setting issues', () => {
  it('name settings as the screen does, never by their variable', () => {
    const issues = [
      {},
      { SLACK_CONNECTION: 'hub' },
      { SLACK_CONNECTION: 'hub', HUB_URL: 'https://hub.example.com' },
      { SLACK_BOT_TOKEN: 'xoxb-1', SLACK_APP_TOKEN: 'xapp-1' },
      {
        SLACK_BOT_TOKEN: 'xoxb-1',
        SLACK_APP_TOKEN: 'xapp-1',
        MENTION_ALLOWED_USERS: 'U1,U2',
      },
      {
        SLACK_BOT_TOKEN: 'xoxb-1',
        SLACK_APP_TOKEN: 'xapp-1',
        MENTION_ALLOWED_USERS: 'U1',
        MENTION_WORKSPACE: '/no/such/folder',
      },
    ].flatMap((env) => checkConfig(env))
    expect(issues.map((issue) => issue.key)).toEqual([
      'SLACK_BOT_TOKEN',
      'SLACK_APP_TOKEN',
      'MENTION_ALLOWED_USERS',
      'HUB_URL',
      'HUB_TOKEN',
      'HUB_TOKEN',
      'MENTION_ALLOWED_USERS',
      'MENTION_ALLOWED_USERS',
      'MENTION_WORKSPACE',
    ])
    for (const { message } of issues)
      expect(message).not.toMatch(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/)
  })
})

describe('connection check', () => {
  it('checks the bot token, scopes, same app, and Socket Mode', async () => {
    const calls: string[] = []
    const fetchImpl = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      const method = String(url).split('/').pop()!
      calls.push(
        `${method} ${(init?.headers as Record<string, string>).Authorization}`
      )
      const bodies: Record<string, object> = {
        'auth.test': {
          ok: true,
          user: 'pace',
          user_id: 'U0V',
          team: 'T',
          bot_id: 'B1',
        },
        'bots.info': { ok: true, bot: { app_id: 'A0APP' } },
        'apps.connections.open': { ok: true, url: 'wss://example/?ticket=t' },
      }
      return new Response(JSON.stringify(bodies[method]), {
        headers: {
          'x-oauth-scopes': 'app_mentions:read,channels:history,chat:write',
        },
      })
    }) as typeof fetch
    const items = await checkSlackTokens(
      { botToken: 'xoxb-1', appToken: 'xapp-1-A0APP-zz' },
      fetchImpl
    )
    expect(items.map((item) => item.ok)).toEqual([true, false, true, true])
    expect(items[0]?.detail).toBe('pace (U0V) @ T')
    expect(items[1]?.detail).toContain(
      'channels:read, files:read, files:write, users:read'
    )
    expect(items[2]?.detail?.match(/A0APP/g)).toHaveLength(2)
    expect(calls).toEqual([
      'auth.test Bearer xoxb-1',
      'bots.info Bearer xoxb-1',
      'apps.connections.open Bearer xapp-1-A0APP-zz',
    ])
    expect(await checkSlackTokens({ botToken: 'xoxb-1' })).toEqual([
      expect.objectContaining({ ok: false }),
    ])
  })

  it('passes without reactions:write, and says what it changes', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ ok: true, user: 'pace', user_id: 'U0V', team: 'T' }),
        { headers: { 'x-oauth-scopes': REQUIRED_BOT_SCOPES.join(',') } }
      )) as typeof fetch
    const items = await checkSlackTokens(
      { botToken: 'xoxb-1', appToken: 'xapp-1-A0APP-zz' },
      fetchImpl
    )
    expect(items[1]).toEqual({
      id: 'botScopes',
      label: 'Bot scopes',
      ok: true,
      detail: expect.stringContaining(
        'Missing reactions:write: only the asker sees that Pace is working or failed'
      ),
    })
  })
})

describe('connections', () => {
  const states = (values: Record<string, string>) =>
    Object.fromEntries(
      connectionStates(lookupIn(values)).map((state) => [state.id, state])
    )

  it('reads once set up, and writes only when Write is on and has what it needs', () => {
    const github = { OPS_GIT_ALLOWED_OWNERS: 'acme' }
    expect(states(github).github).toMatchObject({
      missing: [],
      read: true,
      write: false,
      reads: true,
      writes: false,
    })
    // Draft PRs start from the work folder
    expect(states({ ...github, OPS_GIT_WRITE: 'on' }).github).toMatchObject({
      writes: false,
      writeMissing: ['OPS_FS_ROOT'],
    })
    expect(
      states({ ...github, OPS_GIT_WRITE: 'on', OPS_FS_ROOT: '/work' }).github
    ).toMatchObject({ writes: true, writeMissing: [] })
    // Read off turns the connection off, its writes with it
    expect(
      states({
        ...github,
        OPS_GIT_WRITE: 'on',
        OPS_FS_ROOT: '/work',
        OPS_GIT_READ: 'off',
      }).github
    ).toMatchObject({ reads: false, writes: false })
    // Half set up: what is still missing
    expect(
      states({ OPS_JIRA_URL: 'https://acme.atlassian.net' }).jira
    ).toMatchObject({
      reads: false,
      missing: ['OPS_JIRA_EMAIL', 'OPS_JIRA_TOKEN', 'OPS_JIRA_PROJECTS'],
    })
    // A connection Pace only reads has no Write
    expect(states({ OPS_K8S_CONTEXTS: 'prod' }).k8s).toMatchObject({
      reads: true,
      write: undefined,
    })
  })

  it('tells the broker which tools it may offer', () => {
    expect(brokerTools({})).toEqual([])
    expect(
      brokerTools({
        OPS_FS_ROOT: '/work',
        OPS_GIT_ALLOWED_OWNERS: 'acme',
        OPS_GIT_WRITE: 'on',
        OPS_JIRA_URL: 'https://acme.atlassian.net',
        OPS_JIRA_EMAIL: 'me@acme.dev',
        OPS_JIRA_TOKEN: 'secret',
        OPS_JIRA_PROJECTS: 'OPS',
        OPS_K8S_CONTEXTS: 'prod',
        OPS_K8S_READ: 'off',
      })
    ).toEqual(['files', 'github', 'github-write', 'jira'])
  })
})
