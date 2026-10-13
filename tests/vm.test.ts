import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { EgressProxy, isLocalAddress } from '../src/sandbox/egress.js'
import {
  memoryMiB,
  vmProblems,
  vmRunArgs,
  vmUnsupported,
} from '../src/sandbox/vm.js'
import {
  fetchKernel,
  kernelPath,
  kubectlVersion,
  reasonerVersions,
} from '../src/sandbox/vm-setup.js'
import { brokerDestinations, openBrokerDoor } from '../src/sandbox/vm-broker.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-vm-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** This computer's address on its network, if it has one */
function lanAddress(): string | undefined {
  return Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address
}

/** Sends raw HTTP through the proxy's socket and reads the status line */
function ask(socket: string, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = net.connect(socket, () => client.write(request))
    client.once('data', (data) => {
      resolve(data.toString().split('\r\n')[0]!)
      client.destroy()
    })
    client.on('error', reject)
  })
}

describe('egress proxy', () => {
  it('lets through only the allowed host names: CONNECT to 443, and plain HTTP', async () => {
    const web = http
      .createServer((req, res) => res.end(`got ${req.headers.host}${req.url}`))
      .listen(0, '0.0.0.0')
    await new Promise((resolve) => web.once('listening', resolve))
    const webPort = (web.address() as net.AddressInfo).port
    const lan = lanAddress()
    let allowed = ['api.anthropic.com', 'web.test', 'localhost']
    const proxy = new EgressProxy({
      socket: path.join(tmpdir(), `pv-test-${process.pid}.sock`),
      allowed: () => allowed,
      // web.test is this computer by its LAN address, which the proxy may
      // reach; localhost stays loopback, which it may not.
      resolve: async (host) =>
        host === 'web.test'
          ? ['127.0.0.1', ...(lan ? [lan] : [])]
          : host === 'localhost'
            ? ['127.0.0.1', '::1']
            : ['192.0.2.1'],
    })
    await proxy.listen()
    try {
      const connect = (target: string) =>
        ask(
          proxy.socket,
          `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`
        )
      expect(await connect('example.com:443')).toBe('HTTP/1.1 403 Forbidden')
      // Allowed names, but not another port, and never an address
      expect(await connect('api.anthropic.com:22')).toBe(
        'HTTP/1.1 403 Forbidden'
      )
      expect(await connect('127.0.0.1:443')).toBe('HTTP/1.1 403 Forbidden')
      expect(proxy.allows('API.Anthropic.com.')).toBe(true)
      expect(proxy.allows('evil.api.anthropic.com')).toBe(false)

      const get = (host: string) =>
        ask(
          proxy.socket,
          `GET http://${host}:${webPort}/dists/InRelease HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`
        )
      // An allowed name that leads to this computer itself is refused.
      expect(await get('localhost')).toBe('HTTP/1.1 403 Forbidden')
      expect(await connect('localhost:443')).toBe('HTTP/1.1 403 Forbidden')
      expect(await get('127.0.0.1')).toBe('HTTP/1.1 403 Forbidden')
      if (lan) {
        // Past the loopback address it also resolves to, to the LAN one
        expect(await get('web.test')).toBe('HTTP/1.1 200 OK')
        // The list is asked again for every connection.
        allowed = []
        expect(await get('web.test')).toBe('HTTP/1.1 403 Forbidden')
      }
    } finally {
      await proxy.close()
      web.close()
    }
  })

  it('never leads to this computer, its link-local range or multicast', () => {
    for (const address of [
      '127.0.0.1',
      '127.8.9.10',
      '0.0.0.0',
      '169.254.169.254',
      '224.0.0.251',
      '::1',
      '::',
      'fe80::1',
      'ff02::fb',
      '::ffff:127.0.0.1',
      'not an address',
    ])
      expect(isLocalAddress(address), address).toBe(true)
    for (const address of [
      '10.0.0.5',
      '192.168.1.20',
      '8.8.8.8',
      '2001:db8::1',
    ])
      expect(isLocalAddress(address), address).toBe(false)
  })

  it('refuses a socket path macOS would cut short', async () => {
    const proxy = new EgressProxy({
      socket: path.join(tmpdir(), 'x'.repeat(120), 'egress.sock'),
      allowed: () => [],
    })
    await expect(proxy.listen()).rejects.toThrow(/too long/)
  })
})

describe('built-in sandbox runs', () => {
  it('gives the VM only the mounts, values and way out the run asks for', () => {
    expect(
      vmRunArgs(
        { root: '/vm', image: 'reasoner', memoryMiB: 2048, cpus: 1.5 },
        {
          command: 'claude',
          args: ['-p', '--output-format', 'stream-json'],
          env: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-secret' },
          mounts: [
            { host: '/data/att', at: '/attachments' },
            { host: '/data/out', at: '/out', writable: true },
          ],
          cwd: { host: '/Users/me/docs', at: '/workspace' },
        },
        '/tmp/egress.sock'
      )
    ).toEqual([
      'run',
      '--root',
      '/vm',
      '--image',
      'reasoner',
      '--cpus',
      '2',
      '--memory',
      '2048',
      '--tmpfs',
      '/tmp:size=256m,mode=1777',
      '--tmpfs',
      '/home/node:size=256m,uid=1000,gid=1000,mode=0700',
      '--egress',
      '/tmp/egress.sock',
      // By name only: the value stays out of process listings.
      '--env',
      'CLAUDE_CODE_OAUTH_TOKEN',
      '--mount',
      '/data/att:/attachments',
      '--mount',
      '/data/out:/out:rw',
      '--mount',
      '/Users/me/docs:/workspace',
      '--workdir',
      '/workspace',
      '--',
      'claude',
      '-p',
      '--output-format',
      'stream-json',
    ])
    // Without a reference directory, an empty working directory, and no way
    // out unless one is given
    expect(
      vmRunArgs(
        { root: '/vm', image: 'reasoner', memoryMiB: 512, cpus: 1 },
        { command: 'pdftotext', args: ['/in/a.pdf', '-'] }
      ).slice(-6)
    ).toEqual(['--workdir', '/work', '--', 'pdftotext', '/in/a.pdf', '-'])
  })

  it('reads the memory limit as the Docker sandbox does', () => {
    expect(memoryMiB('2g')).toBe(2048)
    expect(memoryMiB('1536m')).toBe(1536)
    expect(memoryMiB('64m')).toBe(256)
    expect(memoryMiB('lots')).toBe(2048)
  })

  it('runs only on Apple silicon with macOS 15 or later', () => {
    expect(vmUnsupported('darwin', 'arm64', '24.0.0')).toBeUndefined()
    expect(vmUnsupported('darwin', 'arm64', '23.6.0')).toMatch(/macOS 15/)
    expect(vmUnsupported('darwin', 'x64', '25.0.0')).toMatch(/Apple silicon/)
    expect(vmUnsupported('linux', 'arm64', '6.1.0')).toBeDefined()
  })

  it('says what setting up would fix', () => {
    const ready = {
      helper: { path: '/bin/pacenote-vm', ok: true },
      kernel: true,
      initfs: true,
      image: { createdAt: '2026-10-12T00:00:00Z', base: 'node' },
    }
    expect(vmProblems(ready)).toEqual([])
    expect(vmProblems({ ...ready, kernel: false, image: undefined })).toEqual([
      'The built-in sandbox lacks the Linux kernel, the reasoner image: run "Set up built-in sandbox" in Settings > Sandbox (pnpm sandbox:vm).',
    ])
    expect(
      vmProblems({
        ...ready,
        helper: {
          path: '/x',
          ok: false,
          error: 'pacenote-vm not found at /x.',
        },
      })
    ).toEqual(['pacenote-vm not found at /x.'])
  })
})

describe('the ops broker in its own VM', () => {
  it('may go only where its settings name', () => {
    const dir = mkdtempSync(path.join(root, 'broker-'))
    const hostsFile = path.join(dir, 'hosts.json')
    const kubeconfigFile = path.join(dir, 'kubeconfig')
    writeFileSync(
      hostsFile,
      JSON.stringify({ 'web-01': '10.0.0.5', 'db-01': '10.0.0.6' })
    )
    writeFileSync(
      kubeconfigFile,
      JSON.stringify({
        clusters: [
          { name: 'prod', cluster: { server: 'https://10.0.1.1:6443' } },
          {
            name: 'eks',
            cluster: { server: 'https://ABC.gr7.eks.amazonaws.com' },
          },
        ],
      })
    )
    expect(
      [
        ...brokerDestinations({
          hostsFile,
          kubeconfigFile,
          ssh: true,
          github: true,
          jiraUrl: 'https://acme.atlassian.net',
        }),
      ].sort()
    ).toEqual(
      [
        '10.0.0.5:22',
        '10.0.0.6:22',
        '10.0.1.1:6443',
        'abc.gr7.eks.amazonaws.com:443',
        'github.com:443',
        'api.github.com:443',
        'acme.atlassian.net:443',
      ].sort()
    )
    // What is off opens nothing, and an empty kubeconfig is no cluster.
    writeFileSync(kubeconfigFile, '')
    expect([
      ...brokerDestinations({
        hostsFile,
        kubeconfigFile,
        ssh: false,
        github: false,
      }),
    ]).toEqual([])
  })

  it('reaches addresses its rules name, but never this computer', async () => {
    const proxy = new EgressProxy({
      socket: path.join(tmpdir(), `pv-permit-${process.pid}.sock`),
      allowed: () => [],
      permit: (host, port) =>
        ['10.0.0.5:22', '127.0.0.1:22', 'github.com:443'].includes(
          `${host}:${port}`
        ),
      resolve: async () => ['192.0.2.1'],
    })
    await proxy.listen()
    try {
      const connect = (target: string) =>
        ask(
          proxy.socket,
          `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`
        )
      // Named, but this computer: refused before any connection is tried
      expect(await connect('127.0.0.1:22')).toBe('HTTP/1.1 403 Forbidden')
      // Not named
      expect(await connect('10.0.0.5:443')).toBe('HTTP/1.1 403 Forbidden')
      expect(await connect('example.com:443')).toBe('HTTP/1.1 403 Forbidden')
    } finally {
      await proxy.close()
    }
  })

  it('puts who is asking on each call to the broker, which the reasoner cannot forge', async () => {
    // A broker that answers with the headers it got
    const brokerSocket = path.join(tmpdir(), `pv-broker-${process.pid}.sock`)
    const broker = http
      .createServer((req, res) =>
        res.end(
          JSON.stringify(
            Object.fromEntries(
              Object.entries(req.headers).filter(([name]) =>
                name.startsWith('x-pacenote-')
              )
            )
          )
        )
      )
      .listen(brokerSocket)
    await new Promise((resolve) => broker.once('listening', resolve))
    const door = await openBrokerDoor(
      brokerSocket,
      path.join(tmpdir(), `pv-door-${process.pid}.sock`),
      { user: 'U0ALICE', conversation: 'C0OPS', label: '#운영', thread: '1.0' }
    )
    try {
      const headers = await new Promise<Record<string, string>>(
        (resolve, reject) => {
          const req = http.request(
            {
              socketPath: door.socket,
              path: '/mcp',
              method: 'POST',
              headers: { 'x-pacenote-user': 'U0ADMIN', 'x-pacenote-run': 'x' },
            },
            (res) => {
              let body = ''
              res.on('data', (chunk) => (body += chunk))
              res.on('end', () => resolve(JSON.parse(body)))
            }
          )
          req.on('error', reject)
          req.end('{}')
        }
      )
      expect(headers).toEqual({
        'x-pacenote-user': 'U0ALICE',
        'x-pacenote-conversation': 'C0OPS',
        'x-pacenote-label': encodeURIComponent('#운영'),
        'x-pacenote-thread': '1.0',
      })
    } finally {
      await door.close()
      broker.close()
    }
  })

  it("gives each reasoner VM the broker's socket", () => {
    expect(
      vmRunArgs(
        { root: '/vm', image: 'reasoner', memoryMiB: 512, cpus: 1 },
        { command: 'claude', args: [] },
        '/tmp/egress.sock',
        '/tmp/broker.sock'
      )
    ).toContain('/tmp/broker.sock:broker.sock')
  })
})

describe('built-in sandbox setup', () => {
  it('builds with the CLI and kubectl versions the Docker images use', () => {
    const versions = reasonerVersions(path.resolve('sandbox'))
    expect(versions.claude).toMatch(/^\d+\.\d+\.\d+$/)
    expect(versions.codex).toMatch(/^\d+\.\d+\.\d+$/)
    expect(kubectlVersion(path.resolve('sandbox'))).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it('keeps the kernel only from an archive whose hash matches', async () => {
    // An archive shaped like Kata's, served locally
    const source = path.join(root, 'kata')
    const member = 'opt/kata/share/kata-containers/vmlinux-test'
    mkdirSync(path.join(source, path.dirname(member)), { recursive: true })
    writeFileSync(path.join(source, member), 'a kernel')
    const archive = path.join(root, 'kata.tar.xz')
    expect(
      spawnSync('tar', ['-cJf', archive, '-C', source, 'opt']).status
    ).toBe(0)
    const bytes = readFileSync(archive)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const server = http
      .createServer((_req, res) => res.end(bytes))
      .listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const url = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/kata.tar.xz`
    const lines: string[] = []
    try {
      const vm = path.join(root, 'vm')
      await expect(
        fetchKernel({
          bin: '',
          root: vm,
          sandboxDir: '',
          log: (line) => lines.push(line),
          kernel: { url, sha256: '0'.repeat(64), member },
        })
      ).rejects.toThrow(/hash/)
      expect(() => readFileSync(kernelPath(vm))).toThrow()

      await fetchKernel({
        bin: '',
        root: vm,
        sandboxDir: '',
        log: (line) => lines.push(line),
        kernel: { url, sha256, member },
      })
      expect(readFileSync(kernelPath(vm), 'utf8')).toBe('a kernel')
      expect(lines.at(-1)).toBe('Linux kernel: ready (hash checked)')
    } finally {
      server.close()
    }
  })

  it('fails, not hangs, when tar gives up on the archive early', async () => {
    // Larger than a pipe's buffer, so tar exits while the download goes on
    const bytes = Buffer.alloc(4 * 1024 * 1024, 'not an archive ')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const server = http
      .createServer((_req, res) => res.end(bytes))
      .listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const url = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/kata.tar.xz`
    try {
      const vm = path.join(root, 'vm-bad')
      await expect(
        fetchKernel({
          bin: '',
          root: vm,
          sandboxDir: '',
          log: () => {},
          kernel: { url, sha256, member: 'vmlinux' },
        })
      ).rejects.toThrow(/tar failed/)
      expect(() => readFileSync(kernelPath(vm))).toThrow()
    } finally {
      server.close()
    }
  })
})

describe('config', () => {
  const base = {
    SLACK_BOT_TOKEN: 'xoxb-1',
    SLACK_APP_TOKEN: 'xapp-1',
    MENTION_ANYONE: 'on',
    PACENOTE_HOME: '/home/me/.pacenote',
  }

  it('runs in the built-in sandbox with the sandbox login and limits', () => {
    const config = loadConfig({
      ...base,
      REASONER_SANDBOX: 'vm',
      SANDBOX_CLAUDE_OAUTH_TOKEN: 'sk-ant-oat01-x',
      SANDBOX_MEMORY: '3g',
      PACENOTE_VM_BIN: '/Applications/Pacenote.app/Contents/MacOS/pacenote-vm',
    })
    expect(config.reasoner.sandbox).toBeUndefined()
    expect(config.reasoner.auth).toEqual({
      env: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-x' },
    })
    expect(config.reasoner.vm).toEqual({
      bin: '/Applications/Pacenote.app/Contents/MacOS/pacenote-vm',
      root: '/home/me/.pacenote/vm',
      image: 'reasoner',
      memoryMiB: 3072,
      cpus: 2,
      allowlistFile: '/home/me/.pacenote/sandbox/allowed-domains.txt',
    })
  })

  it('needs the sandbox login', () => {
    expect(() => loadConfig({ ...base, REASONER_SANDBOX: 'vm' })).toThrow(
      /REASONER_SANDBOX=vm requires SANDBOX_CLAUDE_OAUTH_TOKEN/
    )
  })

  it('reaches the ops broker in a VM of its own at a local address', () => {
    const ops = {
      ...base,
      SANDBOX_CLAUDE_OAUTH_TOKEN: 'sk-ant-oat01-x',
      OPS_TOOLS: 'on',
      MENTION_ANYONE: 'off',
      MENTION_ALLOWED_USERS: 'U1',
      PACENOTE_SANDBOX_DIR:
        '/Applications/Pacenote.app/Contents/Resources/app/sandbox',
    }
    const config = loadConfig({ ...ops, REASONER_SANDBOX: 'vm' })
    expect(config.reasoner.mcpServers).toEqual([
      { name: 'ops', url: 'http://127.0.0.1:8080/mcp' },
    ])
    expect(config.reasoner.vm?.broker).toMatchObject({
      image: 'broker',
      bundleDir:
        '/Applications/Pacenote.app/Contents/Resources/app/sandbox/ops-broker/dist',
      workDir: '/home/me/.pacenote/vm/broker-work',
    })
    // Not without a sandbox
    expect(() => loadConfig({ ...ops, REASONER_SANDBOX: 'none' })).toThrow(
      /OPS_TOOLS=on requires a sandbox/
    )
  })
})
