import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { EgressProxy } from './egress.js'
import { VM_IMAGE } from './vm.js'

/**
 * Setting up the built-in VM sandbox (src/sandbox/vm.ts): the Linux kernel it
 * boots, the init filesystem (pacenote-vm prepare), and the reasoner image,
 * built in a VM from sandbox/vm/build.sh. The sandbox job runs it (pnpm
 * sandbox:vm, or "Set up built-in sandbox" in Settings > Sandbox); running it
 * again builds the image anew, for newer CLIs.
 */

/**
 * The kernel: Kata Containers' build, the one Apple's Containerization is
 * tested with. It comes inside Kata's release archive, which is checked
 * against this hash as it streams; only the kernel is kept.
 */
export const KERNEL = {
  url: 'https://github.com/kata-containers/kata-containers/releases/download/3.17.0/kata-static-3.17.0-arm64.tar.xz',
  sha256: '647c7612e6edf789d5e14698c48c99d8bac15ad139ffaa1c8bb7d229f748d181',
  member: 'opt/kata/share/kata-containers/vmlinux-6.12.28-153',
}

/** What the reasoner image is built on */
export const VM_BASE_IMAGE = 'docker.io/library/node:24-bookworm-slim'
/** Where the image build may go: Debian's and npm's package hosts */
export const BUILD_DOMAINS = ['deb.debian.org', 'registry.npmjs.org']
/** The broker image's build: Debian's packages and kubectl's downloads */
export const BROKER_BUILD_DOMAINS = [
  'deb.debian.org',
  'dl.k8s.io',
  'cdn.dl.k8s.io',
]
/** The broker's image, built when ops tools are on */
export const VM_BROKER_IMAGE = 'broker'

/**
 * pacenote-vm build options: the image's settings from then on, as the Docker
 * image sets them
 */
export const VM_IMAGE_SETTINGS = [
  '--set-user',
  '1000:1000',
  '--set-workdir',
  '/work',
  '--set-entrypoint',
  '/usr/local/bin/sandbox-entrypoint',
  ...[
    'HOME=/home/node',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
    'DISABLE_AUTOUPDATER=1',
    'HTTPS_PROXY=http://127.0.0.1:3128',
    'HTTP_PROXY=http://127.0.0.1:3128',
    'NO_PROXY=localhost,127.0.0.1',
  ].flatMap((entry) => ['--set-env', entry]),
]

export interface VmSetupOptions {
  bin: string
  root: string
  /** The repository's (or the app's) sandbox folder: vm/ and compose.yaml */
  sandboxDir: string
  log: (line: string) => void
  /** Where the kernel comes from (tests point it at a local copy) */
  kernel?: typeof KERNEL
  /** Builds the ops broker's image too (OPS_TOOLS=on) */
  broker?: boolean
}

/** A build arg the Docker images are built with (sandbox/compose.yaml) */
function composeArg(sandboxDir: string, name: string): string {
  const compose = readFileSync(path.join(sandboxDir, 'compose.yaml'), 'utf8')
  const found = new RegExp(`${name}:\\s*"?([^"\\s]+)"?`).exec(compose)?.[1]
  if (!found) throw new Error(`${name} is not in sandbox/compose.yaml.`)
  return found
}

/** The CLI versions the Docker image is built with (sandbox/compose.yaml) */
export function reasonerVersions(sandboxDir: string): {
  claude: string
  codex: string
} {
  return {
    claude: composeArg(sandboxDir, 'CLAUDE_CODE_VERSION'),
    codex: composeArg(sandboxDir, 'CODEX_VERSION'),
  }
}

/** The kubectl the Docker broker image is built with */
export const kubectlVersion = (sandboxDir: string) =>
  composeArg(sandboxDir, 'KUBECTL_VERSION')

/** Everything the built-in sandbox needs, fetched or built where missing */
export async function setupVm(options: VmSetupOptions): Promise<void> {
  const { log } = options
  mkdirSync(options.root, { recursive: true })
  if (existsSync(kernelPath(options.root))) log('Linux kernel: present')
  else await fetchKernel(options)
  log('Init filesystem (vminitd)')
  await helper(options, ['prepare', '--root', options.root])
  await buildImage(options)
  if (options.broker) await buildBrokerImage(options)
  else log('Ops broker image: not built (ops tools are off)')
}

export const kernelPath = (root: string) => path.join(root, 'kernel/vmlinux')

/**
 * tar, reading an .xz archive on stdin, extracting only the member (named
 * with or without ./): macOS's own bsdtar, or GNU tar elsewhere, where the
 * tests run on Linux
 */
function extractMember(work: string, member: string): [string, string[]] {
  const read = ['-xJf', '-', '-C', work]
  return process.platform === 'darwin'
    ? ['/usr/bin/tar', [...read, '--include', `*${member}`]]
    : ['tar', [...read, '--wildcards', '--wildcards-match-slash', `*${member}`]]
}

/**
 * Downloads Kata's release archive and keeps its kernel, if the archive's hash
 * matches
 */
export async function fetchKernel(options: VmSetupOptions): Promise<void> {
  const kernel = options.kernel ?? KERNEL
  options.log(`Linux kernel: downloading ${kernel.url}`)
  mkdirSync(options.root, { recursive: true })
  const work = mkdtempSync(path.join(options.root, '.kernel-'))
  try {
    const response = await fetch(kernel.url)
    if (!response.ok || !response.body)
      throw new Error(`Download failed: HTTP ${response.status}`)
    const hash = createHash('sha256')
    const [command, args] = extractMember(work, kernel.member)
    const tar = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    tar.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    const done = new Promise<number | null>((resolve) =>
      tar.on('close', resolve)
    )
    // A tar that exits early (an archive it cannot read) closes its input:
    // the rest of the download is still hashed, and its exit code says why.
    let tarGone = false
    tar.stdin.on('error', () => (tarGone = true))
    const writable = () =>
      new Promise<void>((resolve) => {
        const go = () => {
          tar.stdin.off('drain', go)
          tar.stdin.off('close', go)
          resolve()
        }
        tar.stdin.on('drain', go)
        tar.stdin.on('close', go)
      })
    const body = Readable.fromWeb(
      response.body as import('node:stream/web').ReadableStream
    )
    for await (const chunk of body) {
      hash.update(chunk as Buffer)
      if (!tarGone && !tar.stdin.write(chunk)) await writable()
    }
    if (!tarGone) tar.stdin.end()
    const code = await done
    const digest = hash.digest('hex')
    if (digest !== kernel.sha256)
      throw new Error(
        `The kernel archive's hash is ${digest}, not ${kernel.sha256}; it was not used.`
      )
    if (code !== 0) throw new Error(`tar failed: ${stderr.trim()}`)
    const extracted = [kernel.member, `./${kernel.member}`]
      .map((member) => path.join(work, member))
      .find((file) => existsSync(file))
    if (!extracted) throw new Error(`${kernel.member} is not in the archive.`)
    mkdirSync(path.dirname(kernelPath(options.root)), { recursive: true })
    renameSync(extracted, kernelPath(options.root))
    options.log('Linux kernel: ready (hash checked)')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/**
 * Builds the reasoner image in a VM, its way out open only to the package
 * hosts
 */
export async function buildImage(
  options: VmSetupOptions & { name?: string }
): Promise<void> {
  const versions = reasonerVersions(options.sandboxDir)
  options.log(
    `Reasoner image: building on ${VM_BASE_IMAGE} with claude ${versions.claude} and codex ${versions.codex}`
  )
  const proxy = new EgressProxy({
    socket: path.join(tmpdir(), `pacenote-build-${process.pid}.sock`),
    allowed: () => BUILD_DOMAINS,
  })
  await proxy.listen()
  try {
    await helper(options, [
      'build',
      '--root',
      options.root,
      '--base',
      VM_BASE_IMAGE,
      '--name',
      options.name ?? VM_IMAGE,
      ...VM_IMAGE_SETTINGS,
      '--mount',
      `${path.join(options.sandboxDir, 'vm')}:/pacenote`,
      '--egress',
      proxy.socket,
      '--env',
      `CLAUDE_CODE_VERSION=${versions.claude}`,
      '--env',
      `CODEX_VERSION=${versions.codex}`,
      '--cpus',
      '4',
      '--memory',
      '4096',
      '--',
      '/bin/sh',
      '/pacenote/build.sh',
    ])
  } finally {
    await proxy.close()
  }
  options.log('Reasoner image: ready')
}

/**
 * Builds the ops broker's image in a VM, its way out open only to the Debian
 * and Kubernetes download hosts
 */
export async function buildBrokerImage(options: VmSetupOptions): Promise<void> {
  const kubectl = kubectlVersion(options.sandboxDir)
  options.log(
    `Ops broker image: building on ${VM_BASE_IMAGE} with kubectl ${kubectl}`
  )
  const proxy = new EgressProxy({
    socket: path.join(tmpdir(), `pacenote-build-${process.pid}.sock`),
    allowed: () => BROKER_BUILD_DOMAINS,
  })
  await proxy.listen()
  try {
    await helper(options, [
      'build',
      '--root',
      options.root,
      '--base',
      VM_BASE_IMAGE,
      '--name',
      VM_BROKER_IMAGE,
      '--set-user',
      '1000:1000',
      '--set-workdir',
      '/app',
      '--set-entrypoint',
      '/usr/local/bin/sandbox-entrypoint',
      '--set-env',
      'HOME=/tmp',
      '--mount',
      `${path.join(options.sandboxDir, 'vm')}:/pacenote`,
      '--egress',
      proxy.socket,
      '--env',
      `KUBECTL_VERSION=${kubectl}`,
      '--cpus',
      '4',
      '--memory',
      '2048',
      '--',
      '/bin/sh',
      '/pacenote/broker-build.sh',
    ])
  } finally {
    await proxy.close()
  }
  options.log('Ops broker image: ready')
}

/** Runs pacenote-vm, passing its output on line by line */
function helper(
  options: Pick<VmSetupOptions, 'bin' | 'log'>,
  args: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const forward = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n'))
        if (line.trim()) options.log(line)
    }
    child.stdout.on('data', forward)
    child.stderr.on('data', forward)
    child.on('error', (err) =>
      reject(
        new Error(
          (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? `pacenote-vm not found at ${options.bin}.`
            : err.message
        )
      )
    )
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pacenote-vm ${args[0]} exited with code ${code}.`))
    )
  })
}
