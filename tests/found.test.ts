import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { FoundHere, repositories } from '../apps/desktop/src/found.js'
import {
  githubOwner,
  hasName,
  parseSshConfig,
  pickName,
  privateRange,
  remoteUrls,
} from '../src/settings/found.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-found-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** Writes files under a folder of its own: { 'a/b': 'text' } */
function tree(name: string, files: Record<string, string>): string {
  const base = path.join(root, name)
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(base, file)), { recursive: true })
    writeFileSync(path.join(base, file), content)
  }
  return base
}

const repo = (url: string) => `[remote "origin"]\n\turl = ${url}\n`

describe('picking a found name', () => {
  it('adds a name to a list and takes it out again, keeping the rest', () => {
    const key = 'OPS_K8S_CONTEXTS'
    expect(pickName(key, '', 'prod')).toBe('prod')
    expect(pickName(key, 'dev, stage', 'prod')).toBe('dev, stage, prod')
    expect(pickName(key, 'dev,prod , stage', 'prod')).toBe('dev, stage')
    expect(hasName(key, 'dev, prod', 'prod')).toBe(true)
    expect(hasName(key, 'dev, Prod', 'prod')).toBe(false)
  })

  it('matches GitHub owners in any case, as the broker does', () => {
    const key = 'OPS_GIT_ALLOWED_OWNERS'
    expect(hasName(key, 'my-org, Ashon', 'ashon')).toBe(true)
    expect(pickName(key, 'my-org, Ashon', 'ashon')).toBe('my-org')
  })

  it('sets a single setting to the name, or clears it when it was it', () => {
    const key = 'OPS_SSH_KEY'
    expect(pickName(key, '', '/k/a')).toBe('/k/a')
    expect(pickName(key, '/k/b', '/k/a')).toBe('/k/a')
    expect(pickName(key, '/k/a', '/k/a')).toBe('')
  })
})

describe('reading names', () => {
  it('reads Host blocks, = and quotes, and follows Include', () => {
    const included: Record<string, string> = {
      'more.conf': 'Host dgx-001\n  Hostname dgx-001.local\n  User ashon\n',
    }
    const hosts = parseSshConfig(
      [
        'User everyone',
        '# a comment',
        'Include more.conf missing.conf',
        'Host web-01 web',
        '  HostName=192.168.10.11',
        '  IdentityFile "~/.ssh/my key"',
        'Host *.corp !skip',
        '  User corp',
      ].join('\n'),
      (file) => (file in included ? [included[file]!] : [])
    )
    expect(hosts).toEqual([
      { patterns: [], user: 'everyone', identityFiles: [] },
      {
        patterns: ['dgx-001'],
        hostName: 'dgx-001.local',
        user: 'ashon',
        identityFiles: [],
      },
      {
        patterns: ['web-01', 'web'],
        hostName: '192.168.10.11',
        identityFiles: ['~/.ssh/my key'],
      },
      { patterns: ['*.corp', '!skip'], user: 'corp', identityFiles: [] },
    ])
  })

  it('stops an Include that includes itself', () => {
    const loop = 'Include self\nHost a\n'
    const hosts = parseSshConfig(loop, () => [loop])
    expect(hosts.length).toBe(6)
  })

  it('gives the /24 of a private address only', () => {
    expect(privateRange('192.168.10.11')).toBe('192.168.10.0/24')
    expect(privateRange('10.1.2.3')).toBe('10.1.2.0/24')
    expect(privateRange('172.20.0.9')).toBe('172.20.0.0/24')
    expect(privateRange('100.101.102.103')).toBe('100.101.102.0/24')
    expect(privateRange('127.0.0.1')).toBeUndefined()
    expect(privateRange('140.82.112.3')).toBeUndefined()
    expect(privateRange('172.32.0.1')).toBeUndefined()
    expect(privateRange('300.1.1.1')).toBeUndefined()
  })

  it("finds a remote's GitHub owner, with no credentials kept", () => {
    expect(githubOwner('git@github.com:Ashon/pacenote.git')).toBe('Ashon')
    expect(githubOwner('https://github.com/my-org/repo')).toBe('my-org')
    expect(githubOwner('https://x-token:secret@github.com/my-org/repo')).toBe(
      'my-org'
    )
    expect(githubOwner('ssh://git@github.com/my-org/repo.git')).toBe('my-org')
    expect(githubOwner('git@gitlab.com:my-org/repo.git')).toBeUndefined()
    expect(
      remoteUrls(
        '[core]\n\tbare = false\n' + repo('git@github.com:a/b.git') + repo('x')
      )
    ).toEqual(['git@github.com:a/b.git', 'x'])
  })
})

describe('what this Mac has for Tools', () => {
  const home = tree('home', {
    'git/github/ashon/verda/.git/config': repo('git@github.com:Ashon/verda'),
    'git/github/ashon/pacenote-mobile/.git/config': repo(
      'https://github.com/ashon/pacenote-mobile.git'
    ),
    'git/github/team/api/.git/config': repo('git@github.com:team726/api.git'),
    'git/github/team/api/node_modules/dep/.git/config': repo(
      'git@github.com:someone/dep.git'
    ),
    'src/one/.git/HEAD': 'ref: refs/heads/main\n',
    'Developer/empty/readme.md': '',
    '.ssh/config': [
      'Include config.d/*',
      'Host web-01',
      '  HostName 192.168.10.11',
      '  User ops',
      '  IdentityFile ~/.ssh/ops_key',
      'Host github.com',
      '  User git',
      '  IdentityFile ~/.ssh/ops_key',
      '  IdentityFile ~/.ssh/github_key',
      'Host orb',
      '  HostName 127.0.0.1',
      '  User default',
      '  IdentityFile ~/.ssh/gone_key',
    ].join('\n'),
    '.ssh/config.d/dgx': [
      'Host dgx-001',
      '  Hostname dgx-001.local',
      '  User ops',
      '  IdentityFile ~/.ssh/ops_key',
      'Host dgx-002',
      '  Hostname dgx-002.local',
      '  IdentityFile ~/.ssh/gone_key',
    ].join('\n'),
    '.ssh/ops_key': 'never read',
    '.ssh/id_ed25519': 'never read',
    '.ssh/id_ed25519.pub': 'ssh-ed25519 AAAA',
    '.ssh/github_key': 'never read',
    '.ssh/github_key.pub': 'ssh-ed25519 AAAA',
    '.ssh/known_hosts': '',
  })
  const addresses: Record<string, string> = {
    'dgx-001.local': '192.168.10.21',
    'dgx-002.local': '10.0.5.7',
    'github.com': '140.82.112.3',
  }
  const calls: string[] = []
  const found = (gh: 'in' | 'out' | 'missing', kubectl = true) =>
    new FoundHere({
      toolPath: () => '',
      home,
      resolve: async (name) => addresses[name],
      run: async (command, args) => {
        calls.push(`${command} ${args.join(' ')}`)
        if (command === 'gh') {
          if (gh === 'missing')
            return { code: 1, stdout: '', stderr: '', missing: true }
          if (gh === 'out')
            return {
              code: 4,
              stdout: '',
              stderr:
                'To get started with GitHub CLI, please run:  gh auth login',
            }
          return args[1] === 'user'
            ? { code: 0, stdout: 'Ashon\n', stderr: '' }
            : { code: 0, stdout: 'team726\nk8s-study\n', stderr: '' }
        }
        if (!kubectl) return { code: 1, stdout: '', stderr: '', missing: true }
        return { code: 0, stdout: 'dev\nprod\n', stderr: '' }
      },
    })

  it('finds names for each setting', async () => {
    const { names, gaps } = await found('in').find(path.join(home, 'git'))
    expect(gaps).toEqual([])
    expect(names.OPS_FS_ROOT).toEqual([
      { value: path.join(home, 'git'), from: 'home', count: 3 },
      { value: path.join(home, 'src'), from: 'home', count: 1 },
    ])
    // gh knows your orgs, so the work folder's owners are not needed
    expect(names.OPS_GIT_ALLOWED_OWNERS).toEqual([
      { value: 'Ashon', from: 'gh' },
      { value: 'team726', from: 'gh' },
      { value: 'k8s-study', from: 'gh' },
    ])
    expect(names.OPS_K8S_CONTEXTS?.map((each) => each.value)).toEqual([
      'dev',
      'prod',
    ])
    // GitHub and a VM on this Mac (orb) are no hosts to check.
    expect(names.OPS_SSH_USER).toEqual([
      { value: 'ops', from: 'sshConfig', count: 2 },
    ])
    // A key that is gone is left out; a key with a .pub is found too, unless
    // only GitHub uses it.
    expect(names.OPS_SSH_KEY).toEqual([
      { value: path.join(home, '.ssh/ops_key'), from: 'sshConfig', count: 2 },
      { value: path.join(home, '.ssh/id_ed25519'), from: 'sshFolder' },
    ])
    // Public addresses (github.com) are no range to allow.
    expect(names.OPS_SSH_ALLOWED_CIDR).toEqual([
      {
        value: '192.168.10.0/24',
        from: 'sshConfig',
        count: 2,
        hosts: ['dgx-001', 'web-01'],
      },
      { value: '10.0.5.0/24', from: 'sshConfig', count: 1, hosts: ['dgx-002'] },
    ])
  })

  it("offers the owners of the work folder's repositories, gh or not", async () => {
    const { names, gaps } = await found('out').find(path.join(home, 'git'))
    expect(gaps).toEqual(['ghSignedOut'])
    expect(names.OPS_GIT_ALLOWED_OWNERS).toEqual([
      { value: 'ashon', from: 'repositories', count: 2 },
      { value: 'team726', from: 'repositories', count: 1 },
    ])
  })

  it('says which tools are missing', async () => {
    const { names, gaps } = await found('missing', false).find()
    expect(gaps).toEqual(['noGh', 'noKubectl'])
    expect(names.OPS_GIT_ALLOWED_OWNERS).toEqual([])
    expect(names.OPS_K8S_CONTEXTS).toEqual([])
  })

  it('asks the tools again only after a minute, or when told to', async () => {
    let now = 0
    const here = new FoundHere({
      toolPath: () => '',
      home,
      now: () => now,
      resolve: async () => undefined,
      run: async (command) => {
        calls.push(command)
        return { code: 0, stdout: '', stderr: '' }
      },
    })
    calls.length = 0
    await here.find()
    await here.find()
    expect(calls.filter((call) => call === 'kubectl')).toHaveLength(1)
    await here.find(undefined, true)
    now = 61_000
    await here.find()
    expect(calls.filter((call) => call === 'kubectl')).toHaveLength(3)
  })

  it('looks three folders deep for repositories, never into them', () => {
    expect(repositories(path.join(home, 'git')).sort()).toEqual(
      [
        'git/github/ashon/pacenote-mobile',
        'git/github/ashon/verda',
        'git/github/team/api',
      ].map((file) => path.join(home, file))
    )
  })
})
