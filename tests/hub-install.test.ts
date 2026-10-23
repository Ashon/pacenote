import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
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
import { HubInstall } from '../apps/desktop/src/hub-install.js'
import type { SettingsStore } from '../apps/desktop/src/settings.js'
import { loadHubConfig } from '../src/hub/config.js'
import {
  hubFromLink,
  hubInstallCommand,
  hubLink,
  hubScriptUrl,
} from '../src/hub/install.js'
import type { HubInstallState } from '../src/hub/protocol.js'
import { Pairings } from '../src/hub/pairing.js'
import { HubServer, type SlackGateway } from '../src/hub/server.js'
import { DesktopStore } from '../src/hub/store.js'
import { createLogger } from '../src/logger.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-hub-install-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const REPO = path.join(import.meta.dirname, '..')
const SCRIPT = path.join(REPO, 'deploy/hub/install.sh')
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

describe('the install command', () => {
  it('runs the release’s own installer with what was chosen, and no secret', () => {
    const tokenHash = 'a'.repeat(64)
    const command = hubInstallCommand({
      version: '0.6.6',
      url: 'http://10.0.0.5:8790',
      allow: ['U0ALICE', 'U0BOB'],
      lang: 'ko',
      pair: { user: 'U0ALICE', tokenHash },
    })
    expect(command).toBe(
      'curl -fsSL https://raw.githubusercontent.com/Ashon/pacenote/v0.6.6/deploy/hub/install.sh' +
        ` | sh -s -- --url http://10.0.0.5:8790 --version 0.6.6 --allow U0ALICE,U0BOB --lang ko --pair U0ALICE:${tokenHash}`
    )
    // A build that is not a release takes main's, and the image's latest.
    expect(hubScriptUrl('0.6.6-dev')).toContain('/main/deploy/hub/install.sh')
    expect(
      hubInstallCommand({
        version: '0.6.6-dev',
        url: 'https://hub.example.com',
        allow: [],
        lang: 'en',
      })
    ).toMatch(/\| sh -s -- --url https:\/\/hub\.example\.com --lang en$/)
  })

  it('opens Pacenote only on a hub link, for an address a hub can have', () => {
    const url = 'http://10.0.0.5:8790'
    expect(hubLink(url)).toBe(
      'pacenote://hub/connect?url=http%3A%2F%2F10.0.0.5%3A8790'
    )
    expect(hubFromLink(hubLink(url))).toBe(url)
    expect(hubFromLink(`${hubLink(url)}%2F`)).toBe(url)
    expect(hubFromLink(hubLink('https://hub.example.com'))).toBe(
      'https://hub.example.com'
    )
    for (const link of [
      // Plain http only on your own network
      hubLink('http://hub.example.com'),
      'pacenote://app/#/settings',
      'pacenote://hub/disconnect?url=http%3A%2F%2F10.0.0.5',
      'https://hub/connect?url=http%3A%2F%2F10.0.0.5',
      'pacenote://hub/connect',
      'not a link',
    ])
      expect(hubFromLink(link)).toBeUndefined()
  })
})

describe("the installer's desktop on the hub", () => {
  it('reads HUB_PAIR as a member and a token hash', () => {
    const base = {
      SLACK_BOT_TOKEN: 'xoxb-1',
      SLACK_APP_TOKEN: 'xapp-1',
    }
    expect(loadHubConfig(base).pair).toBeUndefined()
    expect(
      loadHubConfig({ ...base, HUB_PAIR: `U0ALICE:${'b'.repeat(64)}` }).pair
    ).toEqual({ user: 'U0ALICE', tokenHash: 'b'.repeat(64) })
    expect(() => loadHubConfig({ ...base, HUB_PAIR: 'U0ALICE:xyz' })).toThrow(
      /HUB_PAIR/
    )
  })

  it('is paired once, and stays as the member leaves it after', async () => {
    const file = path.join(root, 'seed', 'desktops.json')
    const store = new DesktopStore(file)
    const slack = {
      userName: async () => 'alice',
    } as unknown as SlackGateway
    const hub = (allowedUsers: string[] = []) =>
      new HubServer({
        store,
        pairings: new Pairings(),
        slack,
        team: { id: 'T1', name: 'acme' },
        allowedUsers,
        log: createLogger('error', 'hub', []),
      })
    const pair = { user: 'U0ALICE', tokenHash: hash('token-1') }
    // A member the hub does not allow is left out.
    await hub(['U0BOB']).pairInstaller(pair)
    expect(store.list()).toEqual([])

    await hub().pairInstaller(pair)
    expect(store.byTokenHash(pair.tokenHash)?.user).toEqual({
      id: 'U0ALICE',
      name: 'alice',
    })
    // Disconnected later: a restart with the same HUB_PAIR does not bring it
    // back.
    store.remove(store.byTokenHash(pair.tokenHash)!.id)
    await hub().pairInstaller(pair)
    expect(new DesktopStore(file).list()).toEqual([])
    expect(JSON.parse(readFileSync(file, 'utf8')).seeded).toEqual([
      pair.tokenHash,
    ])
  })
})

describe('installing a hub from Pacenote', () => {
  const settings = (values: Record<string, string>) => {
    const saved: Record<string, string>[] = []
    const store = {
      fileValues: () => values,
      save: (changes: Record<string, string>) => {
        saved.push(changes)
        return []
      },
    } as unknown as SettingsStore
    return { store, saved }
  }
  /** A hub at url: up once started, knowing the tokens in known */
  const fakeHub = (known: Set<string>) => {
    const state = { up: false }
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (!state.up) throw new Error('ECONNREFUSED')
      if (url.endsWith('/health')) return Response.json({ ok: true })
      const token = String(
        new Headers(init?.headers).get('authorization')
      ).replace(/^Bearer /, '')
      if (url.endsWith('/me') && known.has(hash(token)))
        return Response.json({
          user: { id: 'U0ALICE', name: 'alice' },
          team: { id: 'T1', name: 'acme' },
          connected: false,
        })
      return Response.json({ error: 'hub_unauthorized' }, { status: 401 })
    }) as typeof fetch
    return { state, fetchImpl }
  }
  const until = async (seen: HubInstallState[], step: string) => {
    for (let i = 0; i < 100 && seen.at(-1)?.step !== step; i++)
      await new Promise((resolve) => setTimeout(resolve, 10))
    return seen.at(-1)
  }

  it('switches Pace to the hub as soon as it answers and knows this Mac', async () => {
    const { store, saved } = settings({ MENTION_ALLOWED_USERS: 'U0ALICE' })
    const known = new Set<string>()
    const { state, fetchImpl } = fakeHub(known)
    const seen: HubInstallState[] = []
    let applied = 0
    const install = new HubInstall({
      settings: store,
      version: '0.6.6',
      apply: async () => (applied++, true),
      onChange: (next) => seen.push(next),
      fetchImpl,
      pollMs: 10,
    })
    const waiting = install.command({
      url: 'http://10.0.0.5:8790/',
      allow: 'U0BOB',
      lang: 'en',
      switchHere: true,
    })
    if (waiting.step !== 'waiting') throw new Error(waiting.step)
    expect(waiting.switches).toBe(true)
    // You are let in, and only your token's hash is in the command.
    const pair = /--pair U0ALICE:([0-9a-f]{64})$/.exec(waiting.command)?.[1]
    expect(waiting.command).toContain('--allow U0ALICE,U0BOB')
    expect(pair).toBeDefined()

    // The server ran it: the hub starts, having paired that hash.
    known.add(pair!)
    state.up = true
    const done = await until(seen, 'switched')
    expect(done).toMatchObject({
      step: 'switched',
      url: 'http://10.0.0.5:8790',
      user: { name: 'alice' },
      started: true,
    })
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      SLACK_CONNECTION: 'hub',
      HUB_URL: 'http://10.0.0.5:8790',
    })
    expect(hash(saved[0]!.HUB_TOKEN!)).toBe(pair)
    expect(applied).toBe(1)
  })

  it('pairs with a code instead when it cannot switch by itself', async () => {
    // In setup, or with no member ID to pair as
    const { store, saved } = settings({})
    const { state, fetchImpl } = fakeHub(new Set())
    const seen: HubInstallState[] = []
    const install = new HubInstall({
      settings: store,
      version: '0.6.6',
      apply: async () => true,
      onChange: (next) => seen.push(next),
      fetchImpl,
      pollMs: 10,
    })
    const waiting = install.command({
      url: 'https://hub.example.com',
      allow: '',
      lang: 'ko',
      switchHere: true,
    })
    expect(waiting).toMatchObject({ step: 'waiting', switches: false })
    if (waiting.step === 'waiting')
      expect(waiting.command).not.toContain('--pair')
    state.up = true
    expect(await until(seen, 'up')).toEqual({
      step: 'up',
      url: 'https://hub.example.com',
    })
    expect(saved).toEqual([])
    // Gives up in time, and waits again for the same command
    const slow = new HubInstall({
      settings: store,
      version: '0.6.6',
      apply: async () => true,
      onChange: (next) => seen.push(next),
      fetchImpl: fakeHub(new Set()).fetchImpl,
      pollMs: 10,
      waitMs: 30,
    })
    const first = slow.command({ url: 'http://10.0.0.5:8790', lang: 'en' })
    const gaveUp = await until(seen, 'gave-up')
    expect(gaveUp).toMatchObject({
      step: 'gave-up',
      command: first.step === 'waiting' ? first.command : '',
    })
    expect(slow.resume()).toMatchObject({ step: 'waiting' })
    slow.cancel()
    expect(() =>
      slow.command({ url: 'http://hub.example.com', lang: 'en' })
    ).toThrow(/https/)
    expect(() =>
      slow.command({ url: 'http://10.0.0.5:8790', allow: 'alice' })
    ).toThrow(/member IDs/)
  })
})

/** sh as macOS has it, and dash, which Debian and Ubuntu run as sh */
const SHELLS = ['sh', ...(existsSync('/bin/dash') ? ['/bin/dash'] : [])]

describe.each(SHELLS)('the installer script, in %s', (shell) => {
  /** Stand-ins for docker and curl that note what they were asked */
  const home = path.join(root, path.basename(shell))
  const bins = path.join(home, 'bin')
  const asked = path.join(home, 'asked.log')
  mkdirSync(bins, { recursive: true })
  const stub = (name: string, body: string) => {
    writeFileSync(path.join(bins, name), `#!/bin/sh\n${body}\n`)
    chmodSync(path.join(bins, name), 0o755)
  }
  stub('docker', `echo "docker $*" >> '${asked}'; exit 0`)
  stub(
    'curl',
    `echo "curl $*" >> '${asked}'
case "$*" in
  *auth.test*) case "$*" in *xoxb-bad*) echo '{"ok":false,"error":"invalid_auth"}' ;; *) echo '{"ok":true,"team":"Acme","user":"pace"}' ;; esac ;;
  *apps.connections.open*) echo '{"ok":true,"url":"wss://x"}' ;;
  */health*) echo '{"ok":true}' ;;
esac`
  )
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(shell, [SCRIPT, ...args], {
      encoding: 'utf8',
      // No terminal here, so the tokens come from the environment
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: `${bins}:/usr/bin:/bin`,
        HOME: home,
        ...env,
      },
    })
  const tokens = { SLACK_APP_TOKEN: 'xapp-1-A', SLACK_BOT_TOKEN: 'xoxb-1-B' }

  it('writes the hub, starts it and ends with the link back to Pacenote', () => {
    const dir = path.join(home, 'hub')
    const pair = `U0ALICE:${'c'.repeat(64)}`
    const done = run(
      [
        '--url',
        'http://10.0.0.5:8790',
        '--version',
        '0.6.6',
        '--allow',
        'U0ALICE',
        '--pair',
        pair,
        '--dir',
        dir,
      ],
      tokens
    )
    expect(done.stderr).toBe('')
    expect(done.status).toBe(0)
    const compose = readFileSync(path.join(dir, 'compose.yaml'), 'utf8')
    expect(compose).toContain('image: ghcr.io/ashon/pacenote-hub:0.6.6')
    // http: published on this server's network at the address's port
    expect(compose).toContain('- "8790:8790"')
    const env = readFileSync(path.join(dir, 'hub.env'), 'utf8')
    for (const line of [
      'SLACK_APP_TOKEN=xapp-1-A',
      'SLACK_BOT_TOKEN=xoxb-1-B',
      'HUB_PUBLIC_URL=http://10.0.0.5:8790',
      'HUB_ALLOWED_USERS=U0ALICE',
      `HUB_PAIR=${pair}`,
    ])
      expect(env).toContain(line)
    expect(statSync(path.join(dir, 'hub.env')).mode & 0o777).toBe(0o600)
    expect(done.stdout).toContain('Slack: Acme, @pace')
    expect(done.stdout).toContain(
      'Pacenote on your Mac switches Pace to this hub on its own.'
    )
    const link = /pacenote:\/\/\S+/.exec(done.stdout)?.[0]
    expect(link && hubFromLink(link)).toBe('http://10.0.0.5:8790')
    const log = readFileSync(asked, 'utf8')
    expect(log).toContain('docker compose pull --quiet hub')
    expect(log).toContain('docker compose up -d')
    expect(log).toContain('curl -fsS http://127.0.0.1:8790/health')

    // Again, to update: the tokens stay, the image follows the version.
    const again = run([
      '--url',
      'http://10.0.0.5:8790',
      '--version',
      '0.6.7',
      '--dir',
      dir,
    ])
    expect(again.status).toBe(0)
    expect(readFileSync(path.join(dir, 'compose.yaml'), 'utf8')).toContain(
      'pacenote-hub:0.6.7'
    )
    const kept = readFileSync(path.join(dir, 'hub.env'), 'utf8')
    expect(kept).toContain('SLACK_BOT_TOKEN=xoxb-1-B')
    expect(kept).toContain(`HUB_PAIR=${pair}`)
  })

  it('keeps an https hub on this server, for what serves https in front', () => {
    const dir = path.join(home, 'hub-https')
    const done = run(
      ['--url', 'https://hub.example.com', '--lang', 'ko', '--dir', dir],
      tokens
    )
    expect(done.status).toBe(0)
    expect(readFileSync(path.join(dir, 'compose.yaml'), 'utf8')).toContain(
      '- "127.0.0.1:8790:8790"'
    )
    expect(done.stdout).toContain(
      '허브가 실행 중이에요: https://hub.example.com'
    )
    expect(done.stdout).toContain('reverse_proxy 127.0.0.1:8790')
  })

  it('says what is wrong and starts nothing', () => {
    const dir = path.join(home, 'hub-refused')
    const refused = run(['--url', 'http://10.0.0.5:8790', '--dir', dir], {
      ...tokens,
      SLACK_BOT_TOKEN: 'xoxb-bad',
    })
    expect(refused.status).toBe(1)
    expect(refused.stderr).toContain(
      'Slack turned the bot token down: invalid_auth'
    )
    // No terminal and no tokens: it says how to give them
    const untold = run([
      '--url',
      'http://10.0.0.5:8790',
      '--dir',
      path.join(home, 'hub-untold'),
    ])
    expect(untold.status).toBe(1)
    expect(untold.stderr).toContain('SLACK_APP_TOKEN=...')
    expect(run(['--url', 'hub.example.com']).stderr).toContain('--url')
    expect(
      run(['--url', 'http://10.0.0.5:8790', '--allow', 'alice']).stderr
    ).toContain('--allow')
  })
})
