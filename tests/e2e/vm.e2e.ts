import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ProcessExitError } from '../../src/sandbox/process.js'
import { createLogger } from '../../src/logger.js'
import { VmSandbox } from '../../src/sandbox/vm.js'
import { BIN, prepare, ROOT, skip } from './support/vm.js'
import { REPO } from './support/processes.js'
import { World } from './support/world.js'

/**
 * The built-in VM sandbox for real (support/vm.ts): runs in Linux VMs on this
 * Mac, the way out, cutting a run off, and a mention answered from a VM.
 */
/** The broker's bundle (pnpm bundle), which its VM runs */
const BROKER_BUNDLE = path.join(REPO, 'sandbox/ops-broker/dist/server.mjs')

describe.skipIf(skip !== undefined)('built-in VM sandbox', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'pacenote-e2e-vm-run-'))
  const allowlistFile = path.join(work, 'allowed-domains.txt')
  /** This computer on its network, which the way out may reach */
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address
  const sandbox = new VmSandbox({
    bin: BIN,
    root: ROOT,
    image: 'reasoner',
    memoryMiB: 512,
    cpus: 1,
    allowlistFile,
    // web.test is this computer by its LAN address; localhost is loopback.
    resolve: async (host) =>
      host === 'web.test' && lan
        ? [lan]
        : host === 'localhost'
          ? ['127.0.0.1']
          : ['192.0.2.1'],
  })
  let world: World | undefined

  beforeAll(prepare, 600_000)
  afterEach(async () => {
    await world?.stop()
    world = undefined
  })
  afterAll(async () => {
    await sandbox.close()
    rmSync(work, { recursive: true, force: true })
  })

  it('runs a process in Linux, without network devices, seeing only what it is given', async () => {
    const workspace = path.join(work, 'workspace')
    const out = path.join(work, 'out')
    const secrets = path.join(work, 'codex-home')
    for (const dir of [workspace, out, secrets])
      mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(workspace, 'note.txt'), 'from the host')
    // codex's login, beside files the run must not see
    writeFileSync(path.join(secrets, 'auth.json'), '{"token":"e2e"}')
    writeFileSync(path.join(secrets, 'history.jsonl'), 'past sessions')

    const run = sandbox.run({
      command: '/opt/fake/check.sh',
      args: [],
      input: 'the prompt',
      env: { PACENOTE_E2E_SECRET: 's3cret-value' },
      mounts: [
        {
          host: path.join(secrets, 'auth.json'),
          at: '/run/secrets/codex-auth.json',
        },
        { host: out, at: '/out', writable: true },
      ],
      cwd: { host: workspace, at: '/workspace' },
      timeoutMs: 60_000,
    })
    const err = await run.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProcessExitError)
    expect((err as ProcessExitError).code).toBe(3)
    expect((err as ProcessExitError).stdout.trim().split('\n')).toEqual([
      'stdin: the prompt',
      'kernel: Linux aarch64',
      'user: 1000:1000',
      'devices: lo',
      'workdir: /workspace',
      'secret: s3cret-value',
      'workspace: from the host',
      'workspace write: no',
      'root write: no',
      'out write: yes',
      'home write: yes',
      'auth: {"token":"e2e"}',
      'auth folder: codex-auth.json',
    ])
    expect(readFileSync(path.join(out, 'result.txt'), 'utf8')).toBe('answer\n')
  })

  it('lets the VM out only to the allowed domains, never to this Mac, as the list says now', async () => {
    const web = http
      .createServer((_req, res) => res.end('hello from the host'))
      .listen(0, '0.0.0.0')
    await new Promise((resolve) => web.once('listening', resolve))
    const port = (web.address() as AddressInfo).port
    const url = (host: string) => `http://${host}:${port}/`
    const reach = async (...args: string[]) =>
      (
        await sandbox.run({
          command: 'node',
          args: ['/opt/fake/reach.mjs', ...args],
          input: '',
          timeoutMs: 60_000,
        })
      ).stdout
    try {
      writeFileSync(allowlistFile, '# for the test\nweb.test\nlocalhost\n')
      expect(await reach('CONNECT', 'example.com:443')).toBe('403')
      // Allowed, but this Mac's own services stay out of reach.
      expect(await reach('GET', url('localhost'))).toBe('403 ')
      if (!lan) return
      expect(await reach('GET', url('web.test'))).toBe(
        '200 hello from the host'
      )
      // An edit applies to the next run, with no restart.
      writeFileSync(allowlistFile, 'api.anthropic.com\n')
      const later = new Date(Date.now() + 5_000)
      utimesSync(allowlistFile, later, later)
      expect(await reach('GET', url('web.test'))).toBe('403 ')
    } finally {
      web.close()
    }
  })

  it('stops the VM when its run is cut off', async () => {
    const stop = new AbortController()
    const started = Date.now()
    const run = sandbox.run({
      command: 'sleep',
      args: ['60'],
      input: '',
      timeoutMs: 120_000,
      signal: stop.signal,
    })
    setTimeout(() => stop.abort(), 1_500)
    await expect(run).rejects.toThrow(/aborted/)
    expect(Date.now() - started).toBeLessThan(10_000)
    const left = execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.includes(`pacenote-vm run --root ${ROOT}`))
    expect(left).toEqual([])
  })

  it.skipIf(!existsSync(BROKER_BUNDLE))(
    'reaches the ops broker in a VM of its own, which keeps its files',
    async () => {
      const home = path.join(work, 'broker-home')
      const files = path.join(work, 'ops-files')
      mkdirSync(path.join(files, 'notes'), { recursive: true })
      writeFileSync(path.join(files, 'notes/runbook.md'), 'Restart with care.')
      writeFileSync(allowlistFile, 'api.anthropic.com\n')
      // What the broker logs, through Pace's logger
      const logged: string[] = []
      const log = createLogger('info', 'pace', [
        (_level, line) => logged.push(line),
      ])
      const withBroker = new VmSandbox(
        {
          bin: BIN,
          root: ROOT,
          image: 'reasoner',
          memoryMiB: 512,
          cpus: 1,
          allowlistFile,
          broker: {
            image: 'broker',
            bundleDir: path.dirname(BROKER_BUNDLE),
            workDir: path.join(home, 'vm/broker-work'),
            env: {
              PATH: process.env.PATH,
              PACENOTE_HOME: home,
              OPS_FS_ROOT: files,
            },
          },
        },
        log
      )
      const mcp = async (tool: string, args: object) =>
        (
          await withBroker.run({
            command: 'node',
            args: ['/opt/fake/mcp.mjs', tool, JSON.stringify(args)],
            input: '',
            timeoutMs: 60_000,
            requester: {
              user: 'U0ALICE',
              conversation: 'C0OPS',
              label: '#ops',
              thread: '1791443475.275049',
              run: 'run-1',
            },
          })
        ).stdout
      try {
        // Starting the sandbox starts the broker's VM.
        expect(await withBroker.verify()).toEqual([])
        expect(await mcp('fs_read', { path: 'notes/runbook.md' })).toContain(
          'Restart with care.'
        )
        // The broker's audit line says who asked, as Pace's door told it.
        const call = logged
          .map((line) => /\{"ts".*\}$/.exec(line)?.[0])
          .filter((json): json is string => Boolean(json))
          .map((json) => JSON.parse(json) as Record<string, unknown>)
          .find((entry) => entry.tool === 'fs_read')
        expect(call).toMatchObject({
          path: 'notes/runbook.md',
          by: {
            user: 'U0ALICE',
            conversation: 'C0OPS',
            label: '#ops',
            thread: '1791443475.275049',
            run: 'run-1',
          },
        })
        // The files stay in the broker's VM: the reasoner's has none of them.
        const own = await withBroker
          .run({
            command: 'ls',
            args: ['/workspace', '/run/secrets', '/etc/ops'],
            input: '',
            timeoutMs: 60_000,
          })
          .catch((err: ProcessExitError) => err)
        expect((own as ProcessExitError).stderr).toMatch(/No such file/)
      } finally {
        await withBroker.close()
      }
      // Its socket goes with it.
      expect(
        await mcp('fs_read', { path: 'notes/runbook.md' }).catch(
          (err: Error) => err.message
        )
      ).toMatch(/error|ECONNREFUSED|ENOENT/)
    },
    120_000
  )

  it('answers a mention from a VM of its own', async () => {
    world = await World.create()
    mkdirSync(path.join(world.home, 'sandbox'), { recursive: true })
    writeFileSync(
      path.join(world.home, 'sandbox/allowed-domains.txt'),
      'api.anthropic.com\n'
    )
    const { slack, ops, alice } = world
    await world.startBot({
      REASONER_SANDBOX: 'vm',
      SANDBOX_CLAUDE_OAUTH_TOKEN: 'sk-ant-oat01-e2e',
      SANDBOX_MEMORY: '1g',
      PACENOTE_VM_BIN: BIN,
      PACENOTE_VM_ROOT: ROOT,
      // The startup check of the login asks nothing outside this computer.
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
    })
    expect(world.status()?.reasoner).toBe('claude@vm')
    expect(world.status()?.problems).toEqual([])

    const ts = await slack.mention({
      channel: ops.id,
      user: alice.id,
      text: `<@${slack.botUserId}> where do you run?`,
    })
    const [reply] = await world.answered(ops.id, ts)
    expect(reply!.text).toBe(
      'From the VM: Linux aarch64, uid 1000, network devices: lo, login set, example.com 403'
    )
    // Not the host's fake: it was never asked.
    expect(world.claudeCalls()).toEqual([])
    expect(world.runs()).toMatchObject([
      { status: 'succeeded', backend: { reasoner: 'claude', sandbox: 'vm' } },
    ])
  })
})

if (skip) console.log(`[vm] built-in VM sandbox e2e skipped: ${skip}`)
