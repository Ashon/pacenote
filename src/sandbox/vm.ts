import { existsSync, readFileSync, statSync } from 'node:fs'
import { arch, release, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Logger } from '../logger.js'
import { parseAllowlist } from './allowlist.js'
import { EgressProxy, type Resolve } from './egress.js'
import { runProcess, type RunResult } from './process.js'
import {
  PDFTOTEXT_ARGS,
  SANDBOX_PATHS,
  type Mount,
  type Sandbox,
  type SandboxRun,
} from './runtime.js'
import { jobHint, type VmStatus } from './types.js'
import { VmBroker, type VmBrokerOptions } from './vm-broker.js'

/**
 * The reasoner sandbox built into Pacenote: each run is one process in a
 * lightweight Linux VM of its own (pacenote-vm, apps/vm), started in well under
 * a second from a read-only image. It sees only the mounts a run asks for, and
 * HOME and /tmp are empty every time. The VM has no network device: its one
 * way out is the egress proxy here, relayed in as a socket, which lets through
 * only the allowed domains. Nothing else to install.
 */
export interface VmSandboxOptions {
  /** pacenote-vm */
  bin: string
  /** pacenote-vm's folder: kernel, init filesystem, images */
  root: string
  /** The image runs use */
  image: string
  /** Memory for the process, in MiB */
  memoryMiB: number
  cpus: number
  /** The allowed domains, read again when the file changes */
  allowlistFile: string
  /** How the way out looks names up (tests point them at local servers) */
  resolve?: Resolve
  /**
   * The ops broker, in a VM of its own while Pace runs (vm-broker.ts), when
   * ops tools are on
   */
  broker?: Omit<VmBrokerOptions, 'bin' | 'root' | 'log'>
}

/** The image the setup job builds, and runs use */
export const VM_IMAGE = 'reasoner'
/** What pacenote-vm says and takes (its formatVersion) */
export const VM_FORMAT = 1

/** HOME and /tmp: empty tmpfs on every run */
const TMPFS = [
  '/tmp:size=256m,mode=1777',
  '/home/node:size=256m,uid=1000,gid=1000,mode=0700',
]

/**
 * pacenote-vm in this repository, once built (cd apps/vm && swift build -c
 * release). The desktop app passes the one in its bundle as PACENOTE_VM_BIN.
 */
export function defaultVmBin(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.PACENOTE_VM_BIN?.trim() ||
    fileURLToPath(
      new URL('../../apps/vm/.build/release/pacenote-vm', import.meta.url)
    )
  )
}

/**
 * The repository's sandbox folder (vm/, ops-broker/dist), or the app's, which
 * the desktop app passes as PACENOTE_SANDBOX_DIR
 */
export function defaultSandboxDir(
  env: NodeJS.ProcessEnv = process.env
): string {
  return (
    env.PACENOTE_SANDBOX_DIR?.trim() ||
    fileURLToPath(new URL('../../sandbox', import.meta.url))
  )
}

/** Why this Mac cannot run the built-in sandbox, if it cannot */
export function vmUnsupported(
  platform: string = process.platform,
  cpu: string = arch(),
  kernel: string = release()
): string | undefined {
  const darwin = Number(kernel.split('.')[0])
  // Darwin 24 is macOS 15.
  if (platform !== 'darwin' || cpu !== 'arm64' || !(darwin >= 24))
    return 'The built-in sandbox needs a Mac with Apple silicon and macOS 15 or later.'
  return undefined
}

/** A memory size (2g, 1536m) in MiB, as pacenote-vm takes it */
export function memoryMiB(text: string): number {
  const match = /^(\d+(?:\.\d+)?)([bkmg]?)$/i.exec(text.trim())
  if (!match) return 2048
  const bytes =
    Number(match[1]) *
    { '': 1, b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[
      match[2]!.toLowerCase() as '' | 'b' | 'k' | 'm' | 'g'
    ]
  return Math.max(256, Math.round(bytes / 1024 ** 2))
}

/**
 * pacenote-vm run arguments for one process: egress is the way out's socket,
 * broker the ops broker's (127.0.0.1:8080 in the VM)
 */
export function vmRunArgs(
  options: Pick<VmSandboxOptions, 'root' | 'image' | 'memoryMiB' | 'cpus'>,
  run: Pick<SandboxRun, 'command' | 'args' | 'env' | 'mounts' | 'cwd'>,
  egress?: string,
  broker?: string
): string[] {
  const args = [
    'run',
    '--root',
    options.root,
    '--image',
    options.image,
    '--cpus',
    String(Math.max(1, Math.ceil(options.cpus))),
    '--memory',
    String(options.memoryMiB),
  ]
  for (const tmpfs of TMPFS) args.push('--tmpfs', tmpfs)
  if (egress) args.push('--egress', egress)
  if (broker) args.push('--relay', `${broker}:broker.sock`)
  // Values come from pacenote-vm's environment, which keeps them out of
  // process listings.
  for (const name of Object.keys(run.env ?? {})) args.push('--env', name)
  for (const mount of run.mounts ?? [])
    args.push(
      '--mount',
      `${mount.host}:${mount.at}${mount.writable ? ':rw' : ''}`
    )
  if (run.cwd)
    args.push(
      '--mount',
      `${run.cwd.host}:${run.cwd.at}`,
      '--workdir',
      run.cwd.at
    )
  else args.push('--workdir', SANDBOX_PATHS.empty)
  args.push('--', run.command, ...run.args)
  return args
}

/**
 * pacenote-vm arguments for the text of a PDF someone uploaded: without the way
 * out, since it needs no network, and seeing only the PDF's folder
 */
export function pdfExtractArgs(
  options: Pick<VmSandboxOptions, 'root' | 'image'>,
  pdfPath: string
): string[] {
  return vmRunArgs(
    { ...options, memoryMiB: 512, cpus: 1 },
    {
      command: 'pdftotext',
      args: [...PDFTOTEXT_ARGS, `/in/${path.basename(pdfPath)}`, '-'],
      mounts: [{ host: path.dirname(pdfPath), at: '/in' }],
    }
  )
}

export class VmSandbox implements Sandbox {
  readonly kind = 'vm' as const
  readonly isolated = true
  private egress?: Promise<EgressProxy>
  private allowlist: { mtimeMs: number; domains: string[] } = {
    mtimeMs: -1,
    domains: [],
  }
  /** Set once a VM has started here: the whole chain works */
  private started = false
  /** The ops broker's VM, once started */
  private broker?: VmBroker
  private brokerStarting?: Promise<void>

  constructor(
    private readonly options: VmSandboxOptions,
    private readonly log?: Logger
  ) {}

  pathIn(mount: Mount, hostFile: string): string {
    return path.posix.join(
      mount.at,
      path.relative(mount.host, hostFile).split(path.sep).join('/')
    )
  }

  async run(run: SandboxRun): Promise<RunResult> {
    const egress = await this.openEgress()
    // The broker through a door of the run's own, which says who is asking
    const door =
      this.broker && !this.broker.problem
        ? await this.broker.door(run.requester)
        : undefined
    try {
      const result = await runProcess(
        this.options.bin,
        vmRunArgs(this.options, run, egress.socket, door?.socket),
        {
          cwd: process.cwd(),
          input: run.input,
          timeoutMs: run.timeoutMs,
          signal: run.signal,
          env: { ...process.env, ...run.env },
          onStdoutLine: run.onOutputLine,
        }
      )
      this.started = true
      return result
    } finally {
      await door?.close()
    }
  }

  async extractPdfText(pdfPath: string): Promise<string> {
    const { stdout } = await runProcess(
      this.options.bin,
      pdfExtractArgs(this.options, pdfPath),
      { cwd: process.cwd(), input: '', timeoutMs: 60_000 }
    )
    return stdout
  }

  async verify(): Promise<string[]> {
    const unsupported = vmUnsupported()
    if (unsupported) return [unsupported]
    const status = await vmStatus(this.options)
    const problems = vmProblems(status)
    if (!existsSync(this.options.allowlistFile))
      problems.push(
        `The allowed domains list is missing (${this.options.allowlistFile}): ${jobHint('vm')}.`
      )
    if (problems.length > 0) return problems
    const broker = await this.brokerProblem()
    if (broker) problems.push(broker)
    if (this.started) return problems
    // One VM, once, to know the whole chain works: the helper may start, the
    // kernel boots, the image runs.
    try {
      await runProcess(
        this.options.bin,
        vmRunArgs(
          { ...this.options, memoryMiB: 256, cpus: 1 },
          {
            command: 'true',
            args: [],
          }
        ),
        { cwd: process.cwd(), input: '', timeoutMs: 60_000 }
      )
      this.started = true
      return problems
    } catch (err) {
      return [...problems, `A VM did not start: ${(err as Error).message}`]
    }
  }

  /**
   * Starts the ops broker's VM the first time, and says what is wrong with it
   * then and later, if anything
   */
  private async brokerProblem(): Promise<string | undefined> {
    const settings = this.options.broker
    if (!settings) return undefined
    if (!this.broker) {
      this.broker = new VmBroker({
        ...settings,
        bin: this.options.bin,
        root: this.options.root,
        log: this.log?.child('broker'),
      })
      this.brokerStarting = this.broker.start().catch((err: unknown) => {
        this.broker!.problem ??= (err as Error).message
      })
    }
    await this.brokerStarting
    return this.broker.problem && `Ops tools: ${this.broker.problem}`
  }

  /** Stops the broker's VM and the way out, at shutdown */
  async close(): Promise<void> {
    await this.broker?.stop()
    const egress = this.egress
    this.egress = undefined
    await (await egress?.catch(() => undefined))?.close()
  }

  private openEgress(): Promise<EgressProxy> {
    this.egress ??= (async () => {
      const proxy = new EgressProxy({
        socket: path.join(tmpdir(), `pacenote-egress-${process.pid}.sock`),
        allowed: () => this.allowedDomains(),
        resolve: this.options.resolve,
        log: this.log?.child('egress'),
      })
      await proxy.listen()
      return proxy
    })()
    this.egress.catch(() => (this.egress = undefined))
    return this.egress
  }

  /** The allowed domains file, read again only when it changed */
  private allowedDomains(): string[] {
    try {
      const { mtimeMs } = statSync(this.options.allowlistFile)
      if (mtimeMs !== this.allowlist.mtimeMs)
        this.allowlist = {
          mtimeMs,
          domains: parseAllowlist(
            readFileSync(this.options.allowlistFile, 'utf8')
          ),
        }
      return this.allowlist.domains
    } catch {
      return []
    }
  }
}

/**
 * What pacenote-vm has ready, from its status: image is the one runs use, and
 * renderer, if named, the diagram renderer's
 */
export async function vmStatus(
  options: Pick<VmSandboxOptions, 'bin' | 'root' | 'image'> & {
    renderer?: string
  }
): Promise<VmStatus> {
  const status: VmStatus = {
    unsupported: vmUnsupported(),
    helper: { path: options.bin, ok: false },
    kernel: false,
    initfs: false,
  }
  if (status.unsupported) return status
  try {
    const { stdout } = await runProcess(
      options.bin,
      ['status', '--root', options.root],
      { cwd: process.cwd(), input: '', timeoutMs: 15_000 }
    )
    const report = JSON.parse(stdout) as {
      version?: number
      kernel?: boolean
      initfs?: boolean
      images?: Record<string, { created?: string; base?: string }>
    }
    status.helper.ok = report.version === VM_FORMAT
    if (!status.helper.ok)
      status.helper.error = `pacenote-vm speaks version ${report.version}, Pacenote ${VM_FORMAT}.`
    status.kernel = report.kernel === true
    status.initfs = report.initfs === true
    const built = (name: string) => {
      const image = report.images?.[name]
      return image?.created
        ? { createdAt: image.created, base: image.base ?? '' }
        : undefined
    }
    status.image = built(options.image)
    if (options.renderer) status.renderer = built(options.renderer)
  } catch (err) {
    status.helper.error = existsSync(options.bin)
      ? (err as Error).message
      : `pacenote-vm not found at ${options.bin}.`
  }
  return status
}

/**
 * What keeps the built-in sandbox from running, from its status: image names
 * the image asked for (status.image)
 */
export function vmProblems(
  status: VmStatus,
  image = 'the reasoner image'
): string[] {
  if (status.unsupported) return [status.unsupported]
  if (!status.helper.ok) return [status.helper.error ?? 'pacenote-vm failed.']
  const missing = [
    !status.kernel && 'the Linux kernel',
    !status.initfs && 'the init filesystem',
    !status.image && image,
  ].filter(Boolean)
  return missing.length > 0
    ? [`The built-in sandbox lacks ${missing.join(', ')}: ${jobHint('vm')}.`]
    : []
}
