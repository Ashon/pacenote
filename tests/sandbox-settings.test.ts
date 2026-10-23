import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { configFingerprint } from '../src/config.js'
import {
  checkAllowlist,
  domainProblem,
  parseAllowlist,
  updateAllowlist,
} from '../src/sandbox/allowlist.js'
import { brokerExpected, checkBrokerEnv } from '../src/sandbox/env.js'
import {
  brokerRuntimeDir,
  pacenoteHome,
  settingsFilePath,
} from '../src/settings/paths.js'
import { collectSandboxStatus, computePending } from '../src/sandbox/status.js'

const ALLOWLIST = `# Domains the built-in sandbox can reach

# claude CLI (Anthropic API)
api.anthropic.com

# codex CLI
chatgpt.com
auth.openai.com
api.openai.com
`

describe('allowed domains', () => {
  it('accepts only exact host names', () => {
    expect(domainProblem('api.github.com')).toBeUndefined()
    expect(domainProblem('*.github.com')).toMatch(/Wildcard/)
    expect(domainProblem('https://github.com')).toMatch(/only a host name/)
    expect(domainProblem('github.com:22')).toMatch(/port/)
    expect(domainProblem('10.0.0.1')).toMatch(/IP/)
    expect(domainProblem('localhost')).toMatch(/valid host name/)
  })

  it('keeps comments, removes dropped domains, and appends new domains at the end', () => {
    expect(parseAllowlist(ALLOWLIST)).toEqual([
      'api.anthropic.com',
      'chatgpt.com',
      'auth.openai.com',
      'api.openai.com',
    ])
    const next = updateAllowlist(ALLOWLIST, [
      'chatgpt.com',
      'auth.openai.com',
      'api.openai.com',
      'API.Example.com',
    ])
    expect(next).toBe(`# Domains the built-in sandbox can reach

# claude CLI (Anthropic API)

# codex CLI
chatgpt.com
auth.openai.com
api.openai.com

# Added from the Pacenote app settings screen
api.example.com
`)
  })

  it('does not allow removing domains the current CLI needs', () => {
    expect(
      checkAllowlist(
        ['chatgpt.com', 'auth.openai.com', 'api.openai.com'],
        'codex'
      )
    ).toEqual([])
    expect(checkAllowlist(['chatgpt.com'], 'codex')).toEqual([
      { domain: 'auth.openai.com', message: 'Required for codex to work.' },
      { domain: 'api.openai.com', message: 'Required for codex to work.' },
    ])
    expect(
      checkAllowlist(['api.anthropic.com', '*.x.com'], 'claude')[0]?.domain
    ).toBe('*.x.com')
  })
})

describe('broker settings', () => {
  it('requires absolute paths for compose and validates ranges and orgs', () => {
    expect(
      checkBrokerEnv({
        OPS_FS_ROOT: '/Users/me/git',
        OPS_SSH_ALLOWED_CIDR: '192.168.10.0/24',
      })
    ).toEqual([])
    expect(checkBrokerEnv({ OPS_FS_ROOT: '~/git' })).toEqual([
      { key: 'OPS_FS_ROOT', message: expect.stringContaining('absolute path') },
    ])
    expect(
      checkBrokerEnv({ OPS_SSH_ALLOWED_CIDR: '192.168.10.0' })[0]?.key
    ).toBe('OPS_SSH_ALLOWED_CIDR')
    expect(checkBrokerEnv({ OPS_GIT_ALLOWED_OWNERS: 'a b' })[0]?.key).toBe(
      'OPS_GIT_ALLOWED_OWNERS'
    )
    expect(checkBrokerEnv({ OPS_SSH_INVENTORY: '../x' })[0]?.key).toBe(
      'OPS_SSH_INVENTORY'
    )
    expect(checkBrokerEnv({ OPS_K8S_CONTEXTS: 'main, staging' })).toEqual([])
    expect(
      checkBrokerEnv({
        OPS_JIRA_URL: 'https://your-site.atlassian.net',
        OPS_JIRA_EMAIL: 'me@example.com',
        OPS_JIRA_PROJECTS: 'PROJ, ops_2',
      })
    ).toEqual([])
    expect(checkBrokerEnv({ OPS_JIRA_URL: 'http://jira.local' })[0]?.key).toBe(
      'OPS_JIRA_URL'
    )
    expect(checkBrokerEnv({ OPS_JIRA_PROJECTS: 'PROJ OPS' })[0]?.key).toBe(
      'OPS_JIRA_PROJECTS'
    )
    expect(checkBrokerEnv({ OPS_K8S_CONTEXTS: 'main staging' })[0]?.key).toBe(
      'OPS_K8S_CONTEXTS'
    )
  })

  it('keeps the settings file and broker generated files outside the repository (PACENOTE_HOME, default ~/.pacenote)', () => {
    expect(pacenoteHome({}, '/home/me')).toBe('/home/me/.pacenote')
    expect(settingsFilePath({}, '/home/me')).toBe(
      '/home/me/.pacenote/settings.json'
    )
    expect(brokerRuntimeDir({}, '/home/me')).toBe(
      '/home/me/.pacenote/ops-broker'
    )
    expect(
      settingsFilePath({ PACENOTE_HOME: '~/work/pacenote' }, '/home/me')
    ).toBe('/home/me/work/pacenote/settings.json')
    expect(
      brokerRuntimeDir({ PACENOTE_HOME: '/srv/pacenote ' }, '/home/me')
    ).toBe('/srv/pacenote/ops-broker')
  })

  it('turns off empty features without defaults and points mounts at empty placeholders', () => {
    const runtime = '/home/me/.pacenote/ops-broker'
    expect(brokerExpected({}, runtime)).toEqual({
      sshUser: '',
      allowedCidr: '',
      allowedOwners: '',
      jiraUrl: '',
      jiraEmail: '',
      jiraProjects: '',
      tools: [],
      configured: { fsRoot: false, ssh: false },
      fsRoot: `${runtime}/unset/workspace`,
      sshKey: `${runtime}/unset/ssh-key`,
      knownHosts: `${runtime}/unset/known_hosts`,
    })
    expect(
      brokerExpected(
        {
          OPS_SSH_USER: 'ops',
          OPS_SSH_ALLOWED_CIDR: '192.168.10.0/24',
          OPS_SSH_KEY: '/home/me/.ssh/id_ed25519',
          OPS_FS_ROOT: '/home/me/workspaces',
        },
        runtime
      )
    ).toMatchObject({
      tools: ['files', 'ssh'],
      configured: { fsRoot: true, ssh: true },
      fsRoot: '/home/me/workspaces',
      sshKey: '/home/me/.ssh/id_ed25519',
      knownHosts: `${runtime}/unset/known_hosts`,
    })
  })
})

describe('status evaluation', () => {
  it('asks for a restart when the settings changed after Pace started', () => {
    expect(computePending({ configHash: 'aaa', expectedHash: 'bbb' })).toEqual([
      { reason: 'Settings changed after Pace started.' },
    ])
    expect(
      computePending({ configHash: 'same', expectedHash: 'same' })
    ).toEqual([])
    // Pace not running: nothing to restart
    expect(computePending(undefined)).toEqual([])
  })

  it('derives the config fingerprint only from bot settings, not the data location', () => {
    const base = {
      SLACK_BOT_TOKEN: 'xoxb-1',
      SLACK_APP_TOKEN: 'xapp-1',
      PATH: '/bin',
    }
    expect(configFingerprint(base)).toBe(
      configFingerprint({ ...base, PATH: '/usr/bin', PACENOTE_DATA_DIR: '/x' })
    )
    expect(configFingerprint(base)).not.toBe(
      configFingerprint({ ...base, LOG_LEVEL: 'debug' })
    )
    expect(configFingerprint(base)).toBe(
      configFingerprint({ ...base, LOG_LEVEL: ' ' })
    )
  })
})

describe('sandbox status', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pacenote-sandbox-status-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('checks the sign-in, credentials and logins at once, keeping their order', async () => {
    const home = path.join(root, 'home')
    mkdirSync(path.join(home, 'ops-broker'), { recursive: true })
    writeFileSync(path.join(home, 'ops-broker', 'kubeconfig'), 'x')
    let running = 0
    let most = 0
    /** Answers after a while, counting how many are asked at once */
    const later = async <T>(value: T) => {
      most = Math.max(most, ++running)
      await new Promise((resolve) => setTimeout(resolve, 20))
      running -= 1
      return value
    }
    const asked: string[] = []
    const status = await collectSandboxStatus({
      sandboxDir: path.join(root, 'sandbox'),
      settingsFile: path.join(root, 'settings.env'),
      dataDir: path.join(root, 'data'),
      home,
      env: {
        PACENOTE_HOME: home,
        PACENOTE_VM_BIN: path.join(root, 'pacenote-vm'),
        REASONER_SANDBOX: 'vm',
        SANDBOX_ANTHROPIC_API_KEY: 'sk-ant-test',
        OPS_TOOLS: 'on',
        OPS_SSH_USER: 'ops',
        OPS_SSH_ALLOWED_CIDR: '10.0.0.0/8',
        OPS_SSH_KEY: path.join(root, 'id_ed25519'),
        OPS_K8S_CONTEXTS: 'prod',
        OPS_FS_ROOT: root,
        OPS_GIT_ALLOWED_OWNERS: 'acme',
        OPS_GIT_WRITE: 'on',
        // Half set up, so not in use: its row says what is left
        OPS_JIRA_URL: 'https://jira.example.com',
        OPS_JIRA_PROJECTS: 'OPS',
      },
      run: (command, args) => {
        asked.push(`${command} ${args.join(' ')}`)
        if (command === 'gh')
          return later({
            code: 0,
            stdout: '',
            stderr: 'Logged in to github.com account octo (keyring)',
          })
        const value = args[2] === 'user.name' ? 'Pace' : 'pace@example.com'
        return later({ code: 0, stdout: `${value}\n`, stderr: '' })
      },
      checkCredential: () => later('rejected' as const),
    })
    expect(status.checks).toEqual([
      {
        label: 'Sandbox claude login',
        login: true,
        ok: false,
        detail:
          'The Anthropic API key is rejected: sign in to Claude below, or set another key',
      },
      {
        label: 'SSH key',
        ok: false,
        detail: `Missing: ${path.join(root, 'id_ed25519')}`,
      },
      {
        label: 'Host list',
        ok: false,
        detail:
          'None (set Inventory file in Settings, or write hosts.json by hand)',
      },
      { label: 'k8s kubeconfig', ok: true, detail: 'Present' },
      {
        label: 'GitHub login (gh)',
        ok: true,
        detail: 'octo (the token is passed when Pace starts)',
      },
      {
        label: 'PR commit author',
        ok: true,
        detail: 'Pace <pace@example.com> (global git config)',
      },
    ])
    expect(asked).toEqual([
      'gh auth status --active --hostname github.com',
      'git config --global user.name',
      'git config --global user.email',
    ])
    expect(most).toBe(4)
  })
})
