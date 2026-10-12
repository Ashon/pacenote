import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BRANCH_PREFIX, isAgentBranch } from '../src/broker/git.js'
import { HistoryReader } from '../src/history/reader.js'
import { handleLocalApi } from '../src/local-api.js'
import {
  BotAlreadyRunningError,
  BotStatusFile,
  readRunningBot,
  STATUS_FILE,
} from '../src/runtime/status.js'
import { loadBrokerEnv } from '../src/sandbox/env.js'
import { writeEnvFile } from '../src/settings/env-file.js'
import {
  botLockDirs,
  defaultHome,
  securePrivateDir,
  securePrivateFile,
} from '../src/settings/home.js'
import { pacenoteHome } from '../src/settings/paths.js'
import { jobEnv } from '../src/tools/sandbox-job.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-home-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('where Pacenote keeps settings and data', () => {
  it('uses ~/.pacenote, or PACENOTE_HOME', () => {
    expect(defaultHome('/home/me')).toBe('/home/me/.pacenote')
    expect(pacenoteHome({}, '/home/me')).toBe('/home/me/.pacenote')
    expect(pacenoteHome({ PACENOTE_HOME: '~/p' }, '/home/me')).toBe(
      '/home/me/p'
    )
    expect(pacenoteHome({ PACENOTE_HOME: '/srv/pacenote' }, '/home/me')).toBe(
      '/srv/pacenote'
    )
  })

  it('passes compose the resolved home', () => {
    const envFile = path.join(root, 'job.env')
    writeFileSync(envFile, 'OPS_SSH_USER=from-file\n')
    expect(jobEnv({ HOME: '/home/me' }, envFile)).toMatchObject({
      OPS_SSH_USER: 'from-file',
      PACENOTE_HOME: '/home/me/.pacenote',
    })
  })

  it('sees a bot running from the default home when its own data folder is elsewhere', async () => {
    const home = mkdtempSync(path.join(root, 'home-'))
    const fresh = path.join(home, '.pacenote')
    mkdirSync(fresh)
    expect(botLockDirs(fresh, home)).toEqual([fresh])
    expect(botLockDirs('/data/custom', home)).toEqual(['/data/custom', fresh])

    // The parent process stands in for a bot that is still running there.
    const status = path.join(fresh, STATUS_FILE)
    writeFileSync(
      status,
      JSON.stringify({ version: 1, pid: process.ppid, managedBy: 'desktop' })
    )
    const custom = path.join(home, 'custom')
    mkdirSync(custom)
    expect(readRunningBot(botLockDirs(custom, home))).toMatchObject({
      alive: true,
      status: { pid: process.ppid },
    })
    await expect(
      BotStatusFile.acquire(custom, 'terminal', 0, [fresh])
    ).rejects.toBeInstanceOf(BotAlreadyRunningError)
    rmSync(status)
  })

  it('shows run records in the first format (version 1, a slack field)', async () => {
    const dataDir = path.join(root, 'v1')
    const runDir = path.join(
      dataDir,
      'runs',
      '2026-10-09',
      '20261009-084701-54e64d'
    )
    mkdirSync(runDir, { recursive: true })
    // A record in the first format, before messengers existed
    writeFileSync(
      path.join(runDir, 'run.json'),
      JSON.stringify({
        version: 1,
        id: '20261009-084701-54e64d',
        status: 'succeeded',
        attempts: 1,
        startedAt: '2026-10-08T23:47:01.716Z',
        updatedAt: '2026-10-08T23:47:31.716Z',
        slack: {
          channel: 'C03',
          channelLabel: '#ops',
          threadTs: '1',
          eventTs: '1',
          placeholderTs: '1',
          userId: 'U03',
          userName: 'alice',
        },
        request: 'Why did the nightly backup job fail?',
        backend: {
          reasoner: 'claude',
          sandbox: 'docker',
          model: 'claude-opus-5-5',
        },
        context: { messages: 0 },
        attachments: [],
        events: [
          {
            kind: 'message',
            at: '2026-10-08T23:47:01.716Z',
            text: 'Checked it.',
          },
        ],
        outputs: [],
        answer: 'The backup volume was full.',
        finishedAt: '2026-10-08T23:47:31.716Z',
        durationMs: 30_000,
      })
    )
    const reader = new HistoryReader(dataDir)
    const get = async (pathname: string) =>
      (
        await handleLocalApi(reader, 'GET', new URL(pathname, 'pacenote://app'))
      ).json()
    expect(await get('/api/runs')).toMatchObject([
      {
        id: '20261009-084701-54e64d',
        status: 'succeeded',
        reasoner: 'claude@docker',
      },
    ])
    expect(await get('/api/runs/20261009-084701-54e64d')).toMatchObject({
      request: 'Why did the nightly backup job fail?',
      answer: 'The backup volume was full.',
    })
  })
})

describe('the sandbox', () => {
  it("creates pacenote/* branches and treats only those as the agent's", () => {
    expect(BRANCH_PREFIX).toBe('pacenote/')
    expect(isAgentBranch('pacenote/20261009-1a2b3c4d')).toBe(true)
    expect(isAgentBranch('main')).toBe(false)
    expect(isAgentBranch('feature/pacenote/x')).toBe(false)
  })

  it('defaults to the pacenote-ro account, and takes the one that is set', () => {
    expect(loadBrokerEnv({})).toMatchObject({
      OPS_K8S_SA: 'pacenote-ro',
      OPS_K8S_SA_NAMESPACE: 'pacenote',
    })
    expect(
      loadBrokerEnv({ OPS_K8S_SA: 'ops-ro', OPS_K8S_SA_NAMESPACE: 'ops' })
    ).toMatchObject({ OPS_K8S_SA: 'ops-ro', OPS_K8S_SA_NAMESPACE: 'ops' })
  })
})

describe('private folders', () => {
  it('creates them for this account alone, and tightens ones open to all', () => {
    const fresh = path.join(root, 'private', 'new')
    securePrivateDir(fresh)
    expect(statSync(fresh).mode & 0o777).toBe(0o700)

    const open = path.join(root, 'private', 'open')
    mkdirSync(open, { mode: 0o755 })
    chmodSync(open, 0o755)
    securePrivateDir(open)
    expect(statSync(open).mode & 0o777).toBe(0o700)

    const env = path.join(open, '.env')
    writeFileSync(env, 'SLACK_BOT_TOKEN=xoxb-1\n', { mode: 0o644 })
    chmodSync(env, 0o644)
    securePrivateFile(env)
    expect(statSync(env).mode & 0o777).toBe(0o600)
    securePrivateFile(path.join(open, 'missing'))
  })

  it('writes the settings file for this account alone, whatever it was', () => {
    const env = path.join(root, 'private', 'settings.env')
    writeFileSync(env, 'A=1\n', { mode: 0o644 })
    chmodSync(env, 0o644)
    writeEnvFile(env, 'A=2\n')
    expect(statSync(env).mode & 0o777).toBe(0o600)
  })
})
