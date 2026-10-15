import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { parseCodexDefaults } from '../src/reasoners/codex.js'
import { hostEnv } from '../src/sandbox/host.js'
import { VmSandbox } from '../src/sandbox/vm.js'

describe('VmSandbox.pathIn', () => {
  it('maps a host file under a mount to its path in the VM', () => {
    const box = new VmSandbox({
      bin: '/bin/pacenote-vm',
      root: '/vm',
      image: 'reasoner',
      memoryMiB: 2048,
      cpus: 2,
      allowlistFile: '/allowed-domains.txt',
    })
    const mount = { host: path.join(tmpdir(), 'files'), at: '/attachments' }
    expect(box.pathIn(mount, path.join(mount.host, 'a b.png'))).toBe(
      '/attachments/a b.png'
    )
  })
})

describe('parseCodexDefaults', () => {
  it('reads only top-level keys and ignores values inside tables', () => {
    const toml = [
      'model = "gpt-x"',
      'model_reasoning_effort = "medium"',
      '',
      '[profiles.fast]',
      'model = "gpt-mini"',
    ].join('\n')
    expect(parseCodexDefaults(toml)).toEqual({
      model: 'gpt-x',
      reasoningEffort: 'medium',
    })
    expect(parseCodexDefaults('[a]\nmodel = "b"')).toEqual({
      model: undefined,
      reasoningEffort: undefined,
    })
  })
})

describe('loadConfig sandbox', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-codex-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const env = {
    SLACK_BOT_TOKEN: 'xoxb-1',
    SLACK_APP_TOKEN: 'xapp-1',
    MENTION_ALLOWED_USERS: 'U1',
  }

  it('does not start the claude sandbox without its own credentials', () => {
    expect(() => loadConfig({ ...env, REASONER_SANDBOX: 'vm' })).toThrow(
      /needs a claude token/
    )
    const config = loadConfig({
      ...env,
      REASONER_SANDBOX: 'vm',
      SANDBOX_CLAUDE_OAUTH_TOKEN: 'tok',
    })
    expect(config.reasoner.auth).toEqual({
      env: { CLAUDE_CODE_OAUTH_TOKEN: 'tok' },
    })
    expect(config.reasoner.vm).toBeDefined()
    expect(JSON.stringify(config.reasoner.vm)).not.toContain('tok')
  })

  it('requires an auth file for the codex sandbox and takes the model from the host config.toml', () => {
    const auth = path.join(dir, 'auth.json')
    expect(() =>
      loadConfig({
        ...env,
        REASONER: 'codex',
        REASONER_SANDBOX: 'vm',
        SANDBOX_CODEX_AUTH_FILE: auth,
      })
    ).toThrow(auth)

    writeFileSync(auth, '{}')
    writeFileSync(
      path.join(dir, 'config.toml'),
      'model = "gpt-x"\nmodel_reasoning_effort = "low"\n'
    )
    const config = loadConfig({
      ...env,
      REASONER: 'codex',
      REASONER_SANDBOX: 'vm',
      SANDBOX_CODEX_AUTH_FILE: auth,
    })
    expect(config.reasoner).toMatchObject({
      model: 'gpt-x',
      reasoningEffort: 'low',
      auth: { file: auth },
    })
  })
})

describe('loadConfig commands', () => {
  it("names each CLI's binary for the host sandbox", () => {
    const config = loadConfig({
      SLACK_BOT_TOKEN: 'xoxb-1',
      SLACK_APP_TOKEN: 'xapp-1',
      MENTION_ALLOWED_USERS: 'U1',
      CLAUDE_BIN: '/opt/claude',
    })
    expect(config.reasoner.vm).toBeUndefined()
    expect(config.reasoner.commands.claude).toBe('/opt/claude')
    expect(config.reasoner.commands.codex).toBeTruthy()
  })
})

describe('the host sandbox', () => {
  it("keeps Pacenote's secret settings out of the CLI's environment", () => {
    const env = hostEnv({
      PATH: '/usr/bin',
      HOME: '/Users/me',
      SLACK_BOT_TOKEN: 'xoxb-1',
      SLACK_APP_TOKEN: 'xapp-1',
      HUB_TOKEN: 'a'.repeat(64),
      SANDBOX_CLAUDE_OAUTH_TOKEN: 'sk-ant-oat01-x',
      OPS_JIRA_TOKEN: 'ATATT-x',
      ANTHROPIC_API_KEY: 'sk-ant-api-own',
    })
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/me',
      // The CLI's own login stays.
      ANTHROPIC_API_KEY: 'sk-ant-api-own',
    })
  })
})
