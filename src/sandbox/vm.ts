import { existsSync, readFileSync, statSync } from 'node:fs'
import { arch, release, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localized } from '../i18n/locale.js'
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
import { jobHint, type VmImageStatus, type VmStatus } from './types.js'
import {
  openBrokerDoor,
  VmBroker,
  type OwnTools,
  type VmBrokerOptions,
} from './vm-broker.js'
import { imageCurrent, VM_IMAGE } from './vm-images.js'
import { text } from './vm.text.js'

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
  /**
   * Domains the reasoner CLI cannot work without (REQUIRED_DOMAINS), allowed
   * whether or not the file has them yet
   */
  required?: readonly string[]
  /** How the way out looks names up (tests point them at local servers) */
  resolve?: Resolve
  /**
   * The ops broker, in a VM of its own while Pace runs (vm-broker.ts), when
   * ops tools are on
   */
  broker?: Omit<VmBrokerOptions, 'bin' | 'root' | 'log'>
}

/** What pacenote-vm says and takes (its formatVersion) */
const VM_FORMAT = 1

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
    return localized(text).unsupported
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
  if (run.cwd) args.push('--mount', `${run.cwd.host}:${run.cwd.at}`)
  args.push('--workdir', run.cwd?.at ?? SANDBOX_PATHS.empty)
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
  /** Pace's own tools, once attached (attachOwnTools) */
  private ownTools?: OwnTools
  private doors = 0

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

  /**
   * Serves Pace's own tools to each run, through its door (127.0.0.1:8080/pace/
   * in the VM), with or without the ops broker
   */
  attachOwnTools(tools: OwnTools): void {
    this.ownTools = tools
  }

  async run(run: SandboxRun): Promise<RunResult> {
    const egress = await this.openEgress()
    // The broker and Pace's own tools through a door of the run's own, which
    // says who is asking. Images relay it in as broker.sock, whatever is
    // behind it.
    const broker =
      this.broker && !this.broker.problem ? this.broker.socket : undefined
    const door =
      broker || this.ownTools
        ? await openBrokerDoor(
            broker,
            path.join(
              tmpdir(),
              `pacenote-door-${process.pid}-${++this.doors}.sock`
            ),
            run.requester,
            this.ownTools
          )
        : undefined
    try {
      const result = await runProcess(
        this.options.bin,
        vmRunArgs(this.options, run, egress.socket, door?.socket),
        {
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
      { timeoutMs: 60_000 }
    )
    return stdout
  }

  async verify(): Promise<string[]> {
    const unsupported = vmUnsupported()
    if (unsupported) return [unsupported]
    const { bin, root, image } = this.options
    const problems = vmProblems(await vmStatus({ bin, root, image }))
    if (!existsSync(this.options.allowlistFile))
      problems.push(
        localized(text).noAllowlist(this.options.allowlistFile, jobHint('vm'))
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
          { command: 'true', args: [] }
        ),
        { timeoutMs: 60_000 }
      )
      this.started = true
      return problems
    } catch (err) {
      return [
        ...problems,
        localized(text).vmDidNotStart((err as Error).message),
      ]
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
    return this.broker.problem && localized(text).opsTools(this.broker.problem)
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

  /** The allowed domains: the file's, read again only when it changed */
  private allowedDomains(): string[] {
    return [...this.fileDomains(), ...(this.options.required ?? [])]
  }

  private fileDomains(): string[] {
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

/** What pacenote-vm status says */
export interface VmReport {
  version?: number
  kernel?: boolean
  initfs?: boolean
  images?: Record<
    string,
    { created?: string; base?: string; labels?: Record<string, string> }
  >
}

export function readVmReport(
  options: Pick<VmSandboxOptions, 'bin' | 'root'>
): Promise<VmReport> {
  return runProcess(options.bin, ['status', '--root', options.root], {
    timeoutMs: 15_000,
  }).then(({ stdout }) => JSON.parse(stdout) as VmReport)
}

/**
 * What pacenote-vm has ready, from its status: image is the one runs use, and
 * renderer and broker, if named, the diagram renderer's and the ops broker's.
 * With sandboxDir, each image says whether it was built from this Pacenote's
 * recipe.
 */
export async function vmStatus(
  options: Pick<VmSandboxOptions, 'bin' | 'root' | 'image'> & {
    renderer?: string
    broker?: string
    sandboxDir?: string
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
    const report = await readVmReport(options)
    status.helper.ok = report.version === VM_FORMAT
    if (!status.helper.ok)
      status.helper.error = localized(text).helperVersion(
        report.version,
        VM_FORMAT
      )
    status.kernel = report.kernel === true
    status.initfs = report.initfs === true
    const built = (name: string): VmImageStatus | undefined => {
      const image = report.images?.[name]
      return image?.created
        ? {
            createdAt: image.created,
            base: image.base ?? '',
            current: imageCurrent(name, image.labels, options.sandboxDir),
          }
        : undefined
    }
    status.image = built(options.image)
    if (options.renderer) status.renderer = built(options.renderer)
    if (options.broker) status.broker = built(options.broker)
  } catch (err) {
    status.helper.error = existsSync(options.bin)
      ? (err as Error).message
      : // English in every language: failureCause (mention/failure.ts) reads
        // "pacenote-vm not found" as a setup failure.
        `pacenote-vm not found at ${options.bin}.`
  }
  return status
}

/**
 * The images, of those named, that were built from another recipe than this
 * Pacenote's, as a check issue: they still run, and setting the built-in
 * sandbox up again builds them anew. What keeps the sandbox from running at
 * all is vmProblems', so a helper that does not answer (or is not there, on a
 * Mac that cannot run it) says nothing here.
 */
export async function vmOutdated(
  options: Pick<VmSandboxOptions, 'bin' | 'root'> & {
    sandboxDir: string
    images: string[]
  }
): Promise<string[]> {
  if (options.images.length === 0) return []
  const report = await readVmReport(options).catch(() => undefined)
  if (report === undefined) return []
  const outdated = options.images.filter((name) => {
    const image = report.images?.[name]
    return (
      image?.created && !imageCurrent(name, image.labels, options.sandboxDir)
    )
  })
  if (outdated.length === 0) return []
  const t = localized(text)
  return [t.outdated(outdated.map(t.image), jobHint('vm'))]
}

/**
 * What keeps the built-in sandbox from running, from its status: image is the
 * name of the image asked for (status.image), VM_IMAGE or VM_RENDERER_IMAGE
 */
export function vmProblems(status: VmStatus, image = VM_IMAGE): string[] {
  const t = localized(text)
  if (status.unsupported) return [status.unsupported]
  if (!status.helper.ok) return [status.helper.error ?? t.helperFailed]
  const missing = [
    !status.kernel && t.kernel,
    !status.initfs && t.initfs,
    !status.image && t.image(image),
  ].filter((part) => typeof part === 'string')
  return missing.length > 0 ? [t.lacks(missing, jobHint('vm'))] : []
}
