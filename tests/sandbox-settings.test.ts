import { describe, expect, it } from 'vitest'
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
  envFilePath,
  pacenoteHome,
} from '../src/settings/paths.js'
import { computePending } from '../src/sandbox/status.js'

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

  it('keeps the config file and broker generated files outside the repository (PACENOTE_HOME, default ~/.pacenote)', () => {
    expect(pacenoteHome({}, '/home/me')).toBe('/home/me/.pacenote')
    expect(envFilePath({}, '/home/me')).toBe('/home/me/.pacenote/.env')
    expect(brokerRuntimeDir({}, '/home/me')).toBe(
      '/home/me/.pacenote/ops-broker'
    )
    expect(envFilePath({ PACENOTE_HOME: '~/work/pacenote' }, '/home/me')).toBe(
      '/home/me/work/pacenote/.env'
    )
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
      configured: { fsRoot: true, ssh: true },
      fsRoot: '/home/me/workspaces',
      sshKey: '/home/me/.ssh/id_ed25519',
      knownHosts: `${runtime}/unset/known_hosts`,
    })
  })
})

describe('status evaluation', () => {
  it('asks for a restart when .env changed after Pace started', () => {
    expect(computePending({ configHash: 'aaa', expectedHash: 'bbb' })).toEqual([
      { reason: expect.stringContaining('.env') },
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
