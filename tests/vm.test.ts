import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
  vmOutdated,
  vmProblems,
  vmRunArgs,
  vmUnsupported,
} from '../src/sandbox/vm.js'
import {
  fetchKernel,
  KERNEL,
  kernelPath,
  setupVm,
} from '../src/sandbox/vm-setup.js'
import {
  IMAGE_RECIPES,
  imageCurrent,
  RECIPE_LABEL,
  recipeHash,
  VERSIONS,
} from '../src/sandbox/vm-images.js'
import { brokerDestinations, openBrokerDoor } from '../src/sandbox/vm-broker.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-vm-'))
const REPO = path.resolve(import.meta.dirname, '..')
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

  it('reads the memory limit as a size such as 2g or 1536m', () => {
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
      image: { createdAt: '2026-10-12T00:00:00Z', base: 'node', current: true },
    }
    expect(vmProblems(ready)).toEqual([])
    // An image built for another version still runs.
    expect(
      vmProblems({ ...ready, image: { ...ready.image, current: false } })
    ).toEqual([])
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
  it('pins what goes into the images to exact versions', () => {
    expect(VERSIONS.claude).toMatch(/^\d+\.\d+\.\d+$/)
    expect(VERSIONS.codex).toMatch(/^\d+\.\d+\.\d+$/)
    expect(VERSIONS.kubectl).toMatch(/^v\d+\.\d+\.\d+$/)
    expect(VERSIONS.mermaidCli).toMatch(/^\d+\.\d+\.\d+$/)
  })

  /**
   * A registry and Kata's archive, served locally: the registry asks for a
   * token as ghcr.io does, and gives the blob for it
   */
  async function kernelSources(blob: Buffer, archive: Buffer) {
    const asked: string[] = []
    const server = http
      .createServer((req, res) => {
        const url = new URL(req.url!, 'http://local')
        asked.push(url.pathname)
        const port = (server.address() as net.AddressInfo).port
        if (url.pathname === '/token') {
          expect(url.searchParams.get('scope')).toBe(
            'repository:test/kernel:pull'
          )
          return res.end(JSON.stringify({ token: 'pull-token' }))
        }
        if (url.pathname.startsWith('/v2/test/kernel/blobs/')) {
          if (req.headers.authorization !== 'Bearer pull-token') {
            res.writeHead(401, {
              'www-authenticate': `Bearer realm="http://127.0.0.1:${port}/token",service="test",scope="repository:test/kernel:pull"`,
            })
            return res.end()
          }
          return res.end(blob)
        }
        if (url.pathname === '/kata.tar.xz') return res.end(archive)
        res.writeHead(404).end()
      })
      .listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`
    return { asked, server, base }
  }

  /** An archive shaped like Kata's, holding the kernel */
  function kataArchive(kernel: string, member: string): Buffer {
    const source = mkdtempSync(path.join(root, 'kata-'))
    mkdirSync(path.join(source, path.dirname(member)), { recursive: true })
    writeFileSync(path.join(source, member), kernel)
    const archive = path.join(source, 'kata.tar.xz')
    expect(
      spawnSync('tar', ['-cJf', archive, '-C', source, 'opt']).status
    ).toBe(0)
    return readFileSync(archive)
  }

  const sha256 = (bytes: Buffer | string) =>
    createHash('sha256').update(bytes).digest('hex')
  const member = 'opt/kata/share/kata-containers/vmlinux-test'

  it('takes the kernel from the registry by its hash, with a pull token', async () => {
    const archive = kataArchive('a kernel', member)
    const { asked, server, base } = await kernelSources(
      Buffer.from('a kernel'),
      archive
    )
    const lines: string[] = []
    try {
      const vm = path.join(root, 'vm-registry')
      await fetchKernel({
        bin: '',
        root: vm,
        sandboxDir: '',
        log: (line) => lines.push(line),
        kernel: {
          sha256: sha256('a kernel'),
          registry: base,
          repository: 'test/kernel',
          archive: {
            url: `${base}/kata.tar.xz`,
            sha256: sha256(archive),
            member,
          },
        },
      })
      expect(readFileSync(kernelPath(vm), 'utf8')).toBe('a kernel')
      expect(lines).toEqual([
        `Linux kernel: downloading from ${new URL(base).host}/test/kernel`,
        'Linux kernel: ready (hash checked)',
      ])
      expect(asked).not.toContain('/kata.tar.xz')
    } finally {
      server.close()
    }
  })

  it("falls back to Kata's archive, and keeps only a kernel whose hashes match", async () => {
    const archive = kataArchive('a kernel', member)
    // The registry gives something else than the kernel.
    const { asked, server, base } = await kernelSources(
      Buffer.from('not the kernel'),
      archive
    )
    const kernel = {
      sha256: sha256('a kernel'),
      registry: base,
      repository: 'test/kernel',
      archive: { url: `${base}/kata.tar.xz`, sha256: sha256(archive), member },
    }
    const options = (vm: string, lines: string[] = []) => ({
      bin: '',
      root: path.join(root, vm),
      sandboxDir: '',
      log: (line: string) => lines.push(line),
    })
    try {
      await expect(
        fetchKernel({
          ...options('vm-bad-archive'),
          kernel: {
            ...kernel,
            archive: { ...kernel.archive, sha256: '0'.repeat(64) },
          },
        })
      ).rejects.toThrow(/archive's hash/)
      expect(() =>
        readFileSync(kernelPath(path.join(root, 'vm-bad-archive')))
      ).toThrow()

      // An archive whose kernel is not the one pinned
      await expect(
        fetchKernel({
          ...options('vm-bad-kernel'),
          kernel: { ...kernel, sha256: '1'.repeat(64) },
        })
      ).rejects.toThrow(/The kernel's hash/)

      const lines: string[] = []
      await fetchKernel({ ...options('vm-fallback', lines), kernel })
      expect(
        readFileSync(kernelPath(path.join(root, 'vm-fallback')), 'utf8')
      ).toBe('a kernel')
      expect(lines[1]).toMatch(
        /test\/kernel did not give it \(its hash is [0-9a-f]{64}\); from Kata's release archive instead$/
      )
      expect(lines.at(-1)).toBe('Linux kernel: ready (hash checked)')
      expect(asked).toContain('/kata.tar.xz')

      // A registry without the kernel at all
      await fetchKernel({
        ...options('vm-missing', lines),
        kernel: { ...kernel, repository: 'test/missing' },
      })
      expect(lines.some((line) => line.includes('(HTTP 404)'))).toBe(true)
    } finally {
      server.close()
    }
  })

  it('fails, not hangs, when tar gives up on the archive early', async () => {
    // Larger than a pipe's buffer, so tar exits while the download goes on
    const bytes = Buffer.alloc(4 * 1024 * 1024, 'not an archive ')
    const { server, base } = await kernelSources(Buffer.from(''), bytes)
    try {
      const vm = path.join(root, 'vm-bad')
      await expect(
        fetchKernel({
          bin: '',
          root: vm,
          sandboxDir: '',
          log: () => {},
          kernel: {
            sha256: sha256('a kernel'),
            registry: base,
            repository: 'test/missing',
            archive: {
              url: `${base}/kata.tar.xz`,
              sha256: sha256(bytes),
              member: 'vmlinux',
            },
          },
        })
      ).rejects.toThrow(/tar failed/)
      expect(() => readFileSync(kernelPath(vm))).toThrow()
    } finally {
      server.close()
    }
  })

  it('pins a kernel published to ghcr.io by the kernel workflow', () => {
    const workflow = readFileSync(
      path.join(REPO, '.github/workflows/kernel.yml'),
      'utf8'
    )
    for (const line of [
      `KERNEL_SHA256: ${KERNEL.sha256}`,
      `ARCHIVE_URL: ${KERNEL.archive.url}`,
      `ARCHIVE_SHA256: ${KERNEL.archive.sha256}`,
      `MEMBER: ${KERNEL.archive.member}`,
      `REPOSITORY: ${KERNEL.repository}`,
    ])
      expect(workflow).toContain(line)
    expect(KERNEL.registry).toBe('https://ghcr.io')
  })
})

describe('images built for another version', () => {
  const sandboxDir = path.join(REPO, 'sandbox')

  it('covers every file of sandbox/vm in some recipe', () => {
    const files = (dir: string): string[] =>
      readdirSync(path.join(sandboxDir, 'vm', dir), {
        withFileTypes: true,
      }).flatMap((entry) =>
        entry.isDirectory()
          ? files(path.join(dir, entry.name))
          : [path.join(dir, entry.name)]
      )
    const used = new Set(
      Object.values(IMAGE_RECIPES).flatMap((r) => [r.script, ...r.files])
    )
    expect(files('').filter((file) => !used.has(file))).toEqual([])
  })

  it("changes an image's recipe hash with its files, not with others'", () => {
    const copy = mkdtempSync(path.join(root, 'sandbox-'))
    cpSync(sandboxDir, copy, { recursive: true })
    const before = Object.fromEntries(
      Object.keys(IMAGE_RECIPES).map((name) => [name, recipeHash(name, copy)])
    )
    appendFileSync(path.join(copy, 'vm/renderer/render.sh'), '\n# changed\n')
    expect(recipeHash('renderer', copy)).not.toBe(before.renderer)
    expect(recipeHash('reasoner', copy)).toBe(before.reasoner)
    expect(recipeHash('broker', copy)).toBe(before.broker)
    appendFileSync(path.join(copy, 'vm/egress.sh'), '\n# changed\n')
    for (const name of Object.keys(IMAGE_RECIPES))
      expect(recipeHash(name, copy)).not.toBe(before[name])

    const label = { [RECIPE_LABEL]: recipeHash('reasoner', sandboxDir) }
    expect(imageCurrent('reasoner', label, sandboxDir)).toBe(true)
    expect(imageCurrent('reasoner', label, copy)).toBe(false)
    // Built before images kept their recipe
    expect(imageCurrent('reasoner', undefined, sandboxDir)).toBe(false)
    // Nothing to compare with
    expect(imageCurrent('reasoner', undefined, undefined)).toBe(true)
    expect(imageCurrent('test-image', undefined, sandboxDir)).toBe(true)
  })

  /** A pacenote-vm that reports these images, and records what it is asked */
  function fakeHelper(images: Record<string, string | undefined>) {
    const dir = mkdtempSync(path.join(root, 'helper-'))
    const report = {
      version: 1,
      kernel: true,
      initfs: true,
      images: Object.fromEntries(
        Object.entries(images).map(([name, recipe]) => [
          name,
          {
            created: '2026-10-13T00:00:00Z',
            base: 'node',
            ...(recipe ? { labels: { [RECIPE_LABEL]: recipe } } : {}),
          },
        ])
      ),
    }
    writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report))
    const bin = path.join(dir, 'pacenote-vm')
    writeFileSync(
      bin,
      `#!/bin/sh\necho "$*" >> "${dir}/calls"\n[ "$1" = status ] && cat "${dir}/report.json"\nexit 0\n`,
      { mode: 0o755 }
    )
    const calls = () =>
      readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n')
    return { bin, calls }
  }

  it('builds only the images whose recipe changed, and labels them', async () => {
    const { bin, calls } = fakeHelper({
      reasoner: 'an older recipe',
      renderer: recipeHash('renderer', sandboxDir),
    })
    const vm = path.join(root, 'vm-setup')
    mkdirSync(path.dirname(kernelPath(vm)), { recursive: true })
    writeFileSync(kernelPath(vm), 'a kernel')
    const lines: string[] = []
    await setupVm({
      bin,
      root: vm,
      sandboxDir,
      log: (line) => lines.push(line),
      renderer: true,
    })
    const builds = calls().filter((call) => call.startsWith('build '))
    expect(builds).toHaveLength(1)
    expect(builds[0]).toContain('--name reasoner')
    expect(builds[0]).toContain(
      `--label ${RECIPE_LABEL}=${recipeHash('reasoner', sandboxDir)}`
    )
    expect(builds[0]).toContain(`CODEX_VERSION=${VERSIONS.codex}`)
    expect(lines).toContain('Diagram renderer image: up to date')
    expect(lines).toContain('Ops broker image: not built (ops tools are off)')
  })

  it('names the images built for another version as one check issue', async () => {
    const { bin } = fakeHelper({
      reasoner: 'an older recipe',
      renderer: undefined,
      broker: recipeHash('broker', sandboxDir),
    })
    const options = { bin, root, sandboxDir }
    expect(
      await vmOutdated({ ...options, images: ['reasoner', 'broker'] })
    ).toEqual([
      'The reasoner image was built for another version of Pacenote: run "Set up built-in sandbox" in Settings > Sandbox (pnpm sandbox:vm) to update it.',
    ])
    expect(
      await vmOutdated({ ...options, images: ['reasoner', 'renderer'] })
    ).toEqual([
      'The reasoner image and the diagram renderer image were built for another version of Pacenote: run "Set up built-in sandbox" in Settings > Sandbox (pnpm sandbox:vm) to update them.',
    ])
    expect(await vmOutdated({ ...options, images: ['broker'] })).toEqual([])
    // A helper that does not answer is the sandbox check's to report.
    expect(
      await vmOutdated({
        ...options,
        bin: '/nonexistent',
        images: ['reasoner'],
      })
    ).toEqual([])
  })
})

describe('config', () => {
  const base = {
    SLACK_BOT_TOKEN: 'xoxb-1',
    SLACK_APP_TOKEN: 'xapp-1',
    MENTION_ALLOWED_USERS: 'U1',
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
      // Its sign-in and its renewal, whether or not the file lists them yet
      required: ['api.anthropic.com', 'platform.claude.com'],
    })
  })

  it('starts without the sandbox login, which it then says it needs', () => {
    expect(
      loadConfig({ ...base, REASONER_SANDBOX: 'vm' }).reasoner.auth
    ).toEqual({})
  })

  it('reaches the ops broker in a VM of its own at a local address', () => {
    const ops = {
      ...base,
      SANDBOX_CLAUDE_OAUTH_TOKEN: 'sk-ant-oat01-x',
      OPS_TOOLS: 'on',
      PACENOTE_SANDBOX_DIR:
        '/Applications/Pacenote.app/Contents/Resources/app/sandbox',
    }
    const config = loadConfig({ ...ops, REASONER_SANDBOX: 'vm' })
    expect(config.reasoner.mcpServers).toEqual([
      { name: 'ops', url: 'http://127.0.0.1:8080/mcp' },
      { name: 'pacenote', url: 'http://127.0.0.1:8080/pace/mcp' },
    ])
    expect(config.reasoner.vm?.broker).toMatchObject({
      image: 'broker',
      bundleDir:
        '/Applications/Pacenote.app/Contents/Resources/app/sandbox/ops-broker/dist',
      workDir: '/home/me/.pacenote/vm/broker-work',
    })
    // Not without a sandbox
    expect(() => loadConfig({ ...ops, REASONER_SANDBOX: 'none' })).toThrow(
      /Ops tools need the built-in sandbox/
    )
  })
})
