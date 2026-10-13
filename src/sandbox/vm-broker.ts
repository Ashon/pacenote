import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import type net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Logger } from '../logger.js'
import { EgressProxy } from './egress.js'
import { brokerExpected, loadBrokerEnv } from './env.js'
import { prepareBrokerFiles } from './prepare.js'
import type { Requester } from './runtime.js'
import { jobHint } from './types.js'
import { brokerRuntimeDir } from '../settings/paths.js'

/**
 * The ops broker in the built-in VM sandbox: a VM of its own that runs while
 * Pace does, holding the broker's credentials (SSH key, kubeconfig, GitHub and
 * Jira tokens) and its work folder, none of which reasoner VMs ever see. Its
 * MCP server listens on a socket that pacenote-vm publishes out to this Mac,
 * and VmSandbox relays that socket into each reasoner VM (127.0.0.1:8080
 * there), so the two VMs share no network. The broker's VM has no network
 * device either: its way out is an egress proxy here that goes only where its
 * settings name (brokerDestinations).
 */
export interface VmBrokerOptions {
  bin: string
  root: string
  /** The broker's image (VM_BROKER_IMAGE) */
  image: string
  /** The broker bundle's folder (sandbox/ops-broker/dist), mounted at /app */
  bundleDir: string
  /** Mirrors and worktrees for draft PRs, kept between runs */
  workDir: string
  /**
   * Where its settings come from: .env's OPS_* and the environment. Its files
   * (hosts.json, kubeconfig, placeholders for what is not set) are in
   * brokerRuntimeDir(env), ~/.pacenote/ops-broker.
   */
  env: NodeJS.ProcessEnv
  log?: Logger
}

/** Where the broker listens in its VM (BROKER_SOCKET) */
const GUEST_SOCKET = '/run/broker/mcp.sock'
/** ssh's way out in the broker's VM (sandbox/vm/proxy-connect.mjs) */
const SSH_PROXY_COMMAND = 'node /usr/local/lib/pacenote/proxy-connect.mjs %h %p'

/**
 * Where the broker's VM may connect, as host:port: the SSH hosts in hosts.json
 * on 22, each kubeconfig cluster's API server, GitHub when its tools are on,
 * and the Jira site. Nothing else, and never this Mac (EgressProxy).
 */
export function brokerDestinations(input: {
  hostsFile: string
  kubeconfigFile: string
  ssh: boolean
  github: boolean
  jiraUrl?: string
}): Set<string> {
  const out = new Set<string>()
  const read = (file: string) => {
    try {
      const text = readFileSync(file, 'utf8').trim()
      return text ? (JSON.parse(text) as unknown) : undefined
    } catch {
      return undefined
    }
  }
  const add = (url: string) => {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
      out.add(
        `${host}:${parsed.port || (parsed.protocol === 'http:' ? 80 : 443)}`
      )
    } catch {
      // Not a URL: nothing to open
    }
  }
  if (input.ssh) {
    const hosts = read(input.hostsFile)
    if (hosts && typeof hosts === 'object')
      for (const address of Object.values(hosts))
        if (typeof address === 'string') out.add(`${address.toLowerCase()}:22`)
  }
  const kubeconfig = read(input.kubeconfigFile) as
    { clusters?: { cluster?: { server?: string } }[] } | undefined
  for (const entry of kubeconfig?.clusters ?? [])
    if (entry.cluster?.server) add(entry.cluster.server)
  if (input.github) {
    out.add('github.com:443')
    out.add('api.github.com:443')
  }
  if (input.jiraUrl) add(input.jiraUrl)
  return out
}

/**
 * The headers the broker reads as who is asking (TRUST_REQUESTER): set by
 * the door in front of it (openBrokerDoor), never by the reasoner
 */
export const REQUESTER_HEADERS: Record<keyof Requester, string> = {
  user: 'x-pacenote-user',
  conversation: 'x-pacenote-conversation',
  label: 'x-pacenote-label',
  thread: 'x-pacenote-thread',
  run: 'x-pacenote-run',
}

/**
 * A door to the broker for one run: a socket of its own that passes each
 * request on to the broker, with who is asking in REQUESTER_HEADERS, and drops
 * any such header the reasoner sent itself. Each reasoner VM gets its run's
 * door, never the broker's own socket, so what the broker logs about who asked
 * comes from Pace.
 */
export async function openBrokerDoor(
  broker: string,
  socket: string,
  requester?: Requester
): Promise<{ socket: string; close(): Promise<void> }> {
  const connections = new Set<net.Socket>()
  const server = http.createServer((req, res) => {
    const headers = { ...req.headers }
    for (const name of Object.keys(headers))
      if (name.startsWith('x-pacenote-')) delete headers[name]
    for (const [key, name] of Object.entries(REQUESTER_HEADERS)) {
      const value = requester?.[key as keyof Requester]
      if (value) headers[name] = encodeURIComponent(value)
    }
    const upstream = http.request(
      { socketPath: broker, method: req.method, path: req.url, headers },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers)
        reply.pipe(res)
      }
    )
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Length': '0' })
      res.end()
    })
    req.pipe(upstream)
  })
  server.on('connection', (connection) => {
    connections.add(connection)
    connection.on('close', () => connections.delete(connection))
  })
  rmSync(socket, { force: true })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socket, () => resolve())
  })
  chmodSync(socket, 0o600)
  return {
    socket,
    async close() {
      for (const connection of connections) connection.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(socket, { force: true })
    },
  }
}

export class VmBroker {
  /** Where the broker's MCP server appears on this Mac */
  readonly socket = path.join(tmpdir(), `pacenote-broker-${process.pid}.sock`)
  private egress?: EgressProxy
  private child?: ChildProcess
  private stopping = false
  private restarts = 0
  /** What the broker's VM said last, to say why it did not start */
  private lastLine?: string
  private doors = 0
  /** Why the broker is not answering, if it is not */
  problem?: string

  constructor(private readonly options: VmBrokerOptions) {}

  /** Starts the broker's VM and waits until it answers */
  async start(): Promise<void> {
    const { options } = this
    if (
      !existsSync(
        path.join(options.root, 'images', options.image, 'rootfs.ext4')
      )
    )
      throw new Error(`The ops broker's image is not built: ${jobHint('vm')}.`)
    const brokerEnv = loadBrokerEnv(options.env)
    await prepareBrokerFiles(brokerEnv, options.env, (line) =>
      options.log?.info(line)
    )
    const runtimeDir = brokerRuntimeDir(options.env)
    const expected = brokerExpected(options.env, runtimeDir)
    const hostsFile = path.join(runtimeDir, 'hosts.json')
    const kubeconfigFile = path.join(runtimeDir, 'kubeconfig')
    const destinations = brokerDestinations({
      hostsFile,
      kubeconfigFile,
      ssh: expected.configured.ssh,
      github: Boolean(expected.allowedOwners),
      jiraUrl: expected.jiraUrl || undefined,
    })
    options.log?.info(
      `Broker's way out: ${[...destinations].join(', ') || 'nowhere'}`
    )
    this.egress = new EgressProxy({
      socket: path.join(tmpdir(), `pacenote-broker-egress-${process.pid}.sock`),
      allowed: () => [],
      permit: (host, port) => destinations.has(`${host}:${port}`),
      log: options.log,
    })
    await this.egress.listen()
    mkdirSync(options.workDir, { recursive: true })
    this.launch(this.values(expected), [
      `${options.bundleDir}:/app`,
      `${expected.sshKey}:/run/secrets/ssh-key`,
      `${expected.knownHosts}:/run/secrets/known_hosts`,
      `${hostsFile}:/etc/ops/hosts.json`,
      `${kubeconfigFile}:/run/secrets/kubeconfig`,
      `${expected.fsRoot}:/workspace`,
      `${options.workDir}:/work:rw`,
    ])
    await this.healthy(60_000)
  }

  /** Stops the broker's VM and its way out */
  async stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve))
      child.kill('SIGTERM')
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 8_000)),
      ])
    }
    await this.egress?.close()
  }

  /** A door to the broker for one run (openBrokerDoor) */
  door(requester?: Requester) {
    return openBrokerDoor(
      this.socket,
      path.join(tmpdir(), `pacenote-door-${process.pid}-${++this.doors}.sock`),
      requester
    )
  }

  /** Whether the broker answers now, over its socket */
  check(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        { socketPath: this.socket, path: '/healthz', timeout: 3_000 },
        (res) => {
          res.resume()
          resolve(res.statusCode === 200)
        }
      )
      req.on('timeout', () => req.destroy())
      req.on('error', () => resolve(false))
    })
  }

  /**
   * The broker's settings from .env, and the credentials it gets from this
   * Mac: the gh login's token and the git
   * author
   */
  private values(
    expected: ReturnType<typeof brokerExpected>
  ): Record<string, string> {
    const env = this.options.env
    const capture = (command: string, args: string[]) => {
      const result = spawnSync(command, args, {
        env,
        encoding: 'utf8',
        timeout: 15_000,
      })
      return result.status === 0 ? result.stdout.trim() : ''
    }
    const github = Boolean(expected.allowedOwners)
    const values: Record<string, string> = {
      SSH_USER: expected.sshUser,
      ALLOWED_CIDR: expected.allowedCidr,
      GIT_ALLOWED_OWNERS: expected.allowedOwners,
      GH_TOKEN: github ? env.GH_TOKEN || capture('gh', ['auth', 'token']) : '',
      GIT_AUTHOR_NAME:
        env.OPS_GIT_AUTHOR_NAME ||
        (github ? capture('git', ['config', '--global', 'user.name']) : ''),
      GIT_AUTHOR_EMAIL:
        env.OPS_GIT_AUTHOR_EMAIL ||
        (github ? capture('git', ['config', '--global', 'user.email']) : ''),
      JIRA_URL: expected.jiraUrl,
      JIRA_EMAIL: expected.jiraEmail,
      JIRA_TOKEN: env.OPS_JIRA_TOKEN ?? '',
      JIRA_PROJECTS: expected.jiraProjects,
    }
    return Object.fromEntries(
      Object.entries(values).filter((entry) => entry[1])
    )
  }

  /** Runs the broker's VM, starting it again if it stops on its own */
  private launch(values: Record<string, string>, mounts: string[]): void {
    const { options } = this
    const settings = {
      BROKER_SOCKET: GUEST_SOCKET,
      // Only Pace's doors reach it, and they say who is asking.
      TRUST_REQUESTER: '1',
      HTTPS_PROXY: 'http://127.0.0.1:3128',
      HTTP_PROXY: 'http://127.0.0.1:3128',
      NO_PROXY: 'localhost,127.0.0.1',
      NODE_USE_ENV_PROXY: '1',
      SSH_PROXY_COMMAND,
    }
    const args = [
      'run',
      '--root',
      options.root,
      '--image',
      options.image,
      // Its socket lives in its own copy of the image.
      '--writable-root',
      '--cpus',
      '2',
      '--memory',
      '1024',
      '--tmpfs',
      '/tmp:size=256m,mode=1777',
      '--egress',
      this.egress!.socket,
      '--publish',
      `${GUEST_SOCKET}:${this.socket}`,
      ...mounts.flatMap((mount) => ['--mount', mount]),
      // Values by name only, from pacenote-vm's environment
      ...Object.keys({ ...values, ...settings }).flatMap((name) => [
        '--env',
        name,
      ]),
      '--',
      'node',
      '/app/server.mjs',
    ]
    const child = spawn(options.bin, args, {
      env: { ...process.env, ...values, ...settings },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    // The broker's audit log, one JSON line per call
    const forward = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n'))
        if (line.trim()) {
          this.lastLine = line.trim().slice(0, 300)
          options.log?.info(line)
        }
    }
    child.stdout?.on('data', forward)
    child.stderr?.on('data', forward)
    child.on('exit', (code) => {
      if (this.stopping) return
      this.problem = `The ops broker's VM stopped (code ${code}).`
      options.log?.warn(this.problem)
      // Again after a wait that grows, up to a minute
      const wait = Math.min(60_000, 2_000 * 2 ** this.restarts++)
      setTimeout(() => {
        if (this.stopping) return
        this.launch(values, mounts)
        void this.healthy(60_000).catch(() => undefined)
      }, wait).unref()
    })
  }

  private async healthy(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    const child = this.child
    while (Date.now() < deadline) {
      if (existsSync(this.socket) && (await this.check())) {
        this.problem = undefined
        this.restarts = 0
        return
      }
      // Its VM stopped before it answered: no use waiting.
      if (child && child.exitCode !== null) break
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    this.problem = `The ops broker did not start in its VM${this.lastLine ? `: ${this.lastLine}` : '.'}`
    throw new Error(this.problem)
  }
}
