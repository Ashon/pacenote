import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { EgressProxy } from './egress.js'
import { forwardLines } from './process.js'
import { readVmReport, type VmReport } from './vm.js'
import {
  IMAGE_RECIPES,
  imageCurrent,
  RECIPE_LABEL,
  recipeHash,
  VM_BASE_IMAGE,
  VM_BROKER_IMAGE,
  VM_IMAGE,
  VM_RENDERER_IMAGE,
} from './vm-images.js'

/**
 * Setting up the built-in VM sandbox (src/sandbox/vm.ts): the Linux kernel it
 * boots, the init filesystem (pacenote-vm prepare), and the images
 * (vm-images.ts), each built in a VM from its script in sandbox/vm. The
 * sandbox job runs it (pnpm sandbox:vm, or "Set up built-in sandbox" in
 * Settings > Sandbox); running it again builds the images whose recipe
 * changed, after an update.
 */

/**
 * The kernel: Kata Containers' build, the one Apple's Containerization is
 * tested with. It is published by its hash to ghcr.io (.github/workflows/
 * kernel.yml), about 14 MB. Kata's release archive it comes from, about
 * 290 MB, is the way back when the registry cannot give it. Both are checked
 * against these hashes as they stream; only the kernel is kept.
 */
export const KERNEL = {
  sha256: '67bac9f416af4cdc9b151e4ba4962d6515e0ad7acc53816761cf964aa6af6ea0',
  registry: 'https://ghcr.io',
  repository: 'ashon/pacenote-kernel',
  archive: {
    url: 'https://github.com/kata-containers/kata-containers/releases/download/3.17.0/kata-static-3.17.0-arm64.tar.xz',
    sha256: '647c7612e6edf789d5e14698c48c99d8bac15ad139ffaa1c8bb7d229f748d181',
    member: 'opt/kata/share/kata-containers/vmlinux-6.12.28-153',
  },
}

interface VmSetupOptions {
  bin: string
  root: string
  /** The repository's (or the app's) sandbox folder, with vm/ */
  sandboxDir: string
  log: (line: string) => void
  /** Where the kernel comes from (tests point it at local servers) */
  kernel?: typeof KERNEL
  /** Builds the ops broker's image too (OPS_TOOLS=on) */
  broker?: boolean
  /** Builds the diagram renderer's image too (RENDER_DIAGRAMS=on) */
  renderer?: boolean
}

/**
 * Everything the built-in sandbox needs, fetched where missing, and the images
 * built where missing or made from another recipe
 */
export async function setupVm(options: VmSetupOptions): Promise<void> {
  const { log } = options
  mkdirSync(options.root, { recursive: true })
  if (existsSync(kernelPath(options.root))) log('Linux kernel: present')
  else await fetchKernel(options)
  log('Init filesystem (vminitd)')
  await helper(options, ['prepare', '--root', options.root])
  const report = await readVmReport(options).catch((): VmReport => ({}))
  const images = [
    { name: VM_IMAGE, wanted: true, off: '' },
    {
      name: VM_RENDERER_IMAGE,
      wanted: options.renderer,
      off: 'diagrams are off',
    },
    { name: VM_BROKER_IMAGE, wanted: options.broker, off: 'ops tools are off' },
  ]
  for (const { name, wanted, off } of images) {
    const { title } = IMAGE_RECIPES[name]!
    const built = report.images?.[name]
    if (!wanted) log(`${title}: not built (${off})`)
    else if (
      built?.created &&
      imageCurrent(name, built.labels, options.sandboxDir)
    )
      log(`${title}: up to date`)
    else await buildVmImage(options, name)
  }
}

export const kernelPath = (root: string) => path.join(root, 'kernel/vmlinux')

/**
 * Puts the kernel in place: from the registry, or from Kata's archive when the
 * registry cannot give it, either way only if its hash matches
 */
export async function fetchKernel(options: VmSetupOptions): Promise<void> {
  const kernel = options.kernel ?? KERNEL
  mkdirSync(options.root, { recursive: true })
  const work = mkdtempSync(path.join(options.root, '.kernel-'))
  try {
    let file: string
    try {
      file = await kernelFromRegistry(kernel, work, options.log)
    } catch (err) {
      options.log(
        `Linux kernel: ${registryName(kernel)} did not give it (${(err as Error).message}); from Kata's release archive instead`
      )
      file = await kernelFromArchive(kernel, work, options.log)
    }
    mkdirSync(path.dirname(kernelPath(options.root)), { recursive: true })
    renameSync(file, kernelPath(options.root))
    options.log('Linux kernel: ready (hash checked)')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const registryName = (kernel: typeof KERNEL) =>
  `${new URL(kernel.registry).host}/${kernel.repository}`

/**
 * Downloads the kernel from the registry by its hash, anonymously: the
 * registry's first answer says where to get a token for pulling
 */
async function kernelFromRegistry(
  kernel: typeof KERNEL,
  work: string,
  log: (line: string) => void
): Promise<string> {
  const blob = `${kernel.registry}/v2/${kernel.repository}/blobs/sha256:${kernel.sha256}`
  log(`Linux kernel: downloading from ${registryName(kernel)}`)
  // A slow connection still gets 14 MB in this time.
  const signal = AbortSignal.timeout(5 * 60_000)
  let response = await fetch(blob, { signal })
  if (response.status === 401) {
    await response.body?.cancel()
    const token = await pullToken(response.headers.get('www-authenticate'))
    response = await fetch(blob, {
      signal,
      headers: { authorization: `Bearer ${token}` },
    })
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new Error(`HTTP ${response.status}`)
  }
  const file = path.join(work, 'vmlinux')
  const hash = createHash('sha256')
  await pipeline(
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
    new Transform({
      transform(chunk: Buffer, _encoding, done) {
        hash.update(chunk)
        done(null, chunk)
      },
    }),
    createWriteStream(file)
  )
  const digest = hash.digest('hex')
  if (digest !== kernel.sha256) throw new Error(`its hash is ${digest}`)
  return file
}

/** A pull token, from the registry's challenge (Bearer realm=..., scope=...) */
async function pullToken(challenge: string | null): Promise<string> {
  const params = Object.fromEntries(
    [...(challenge ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]])
  )
  if (!/^Bearer\s/i.test(challenge ?? '') || !params.realm)
    throw new Error('it asked for a login it did not describe')
  const url = new URL(params.realm)
  for (const key of ['service', 'scope'])
    if (params[key]) url.searchParams.set(key, params[key])
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const body = (await response.json().catch(() => ({}))) as {
    token?: string
    access_token?: string
  }
  const token = body.token ?? body.access_token
  if (!response.ok || !token)
    throw new Error(`no pull token (HTTP ${response.status})`)
  return token
}

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
 * Downloads Kata's release archive and takes its kernel, if the archive's hash
 * and the kernel's match
 */
async function kernelFromArchive(
  kernel: typeof KERNEL,
  work: string,
  log: (line: string) => void
): Promise<string> {
  const { archive } = kernel
  log(`Linux kernel: downloading ${archive.url}`)
  const response = await fetch(archive.url)
  if (!response.ok || !response.body)
    throw new Error(`Download failed: HTTP ${response.status}`)
  const hash = createHash('sha256')
  const [command, args] = extractMember(work, archive.member)
  const tar = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  tar.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
  const done = new Promise<number | null>((resolve) => tar.on('close', resolve))
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
  if (digest !== archive.sha256)
    throw new Error(
      `The kernel archive's hash is ${digest}, not ${archive.sha256}; it was not used.`
    )
  if (code !== 0) throw new Error(`tar failed: ${stderr.trim()}`)
  const extracted = [archive.member, `./${archive.member}`]
    .map((member) => path.join(work, member))
    .find((file) => existsSync(file))
  if (!extracted) throw new Error(`${archive.member} is not in the archive.`)
  const kernelDigest = createHash('sha256')
    .update(readFileSync(extracted))
    .digest('hex')
  if (kernelDigest !== kernel.sha256)
    throw new Error(
      `The kernel's hash is ${kernelDigest}, not ${kernel.sha256}; it was not used.`
    )
  return extracted
}

/**
 * Builds an image from its recipe (vm-images.ts) in a VM, its way out open
 * only to the recipe's package hosts, and labels it with the recipe's hash
 */
async function buildVmImage(
  options: VmSetupOptions,
  name: string
): Promise<void> {
  const recipe = IMAGE_RECIPES[name]
  if (!recipe) throw new Error(`No recipe for the image ${name}.`)
  options.log(
    `${recipe.title}: building on ${VM_BASE_IMAGE} with ${recipe.versions}`
  )
  const proxy = new EgressProxy({
    socket: path.join(tmpdir(), `pacenote-build-${process.pid}.sock`),
    allowed: () => recipe.domains,
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
      name,
      ...recipe.settings,
      '--label',
      `${RECIPE_LABEL}=${recipeHash(name, options.sandboxDir)}`,
      '--mount',
      `${path.join(options.sandboxDir, 'vm')}:/pacenote`,
      '--egress',
      proxy.socket,
      ...Object.entries(recipe.env).flatMap(([key, value]) => [
        '--env',
        `${key}=${value}`,
      ]),
      '--cpus',
      '4',
      '--memory',
      String(recipe.memoryMiB),
      '--',
      '/bin/sh',
      `/pacenote/${recipe.script}`,
    ])
  } finally {
    await proxy.close()
  }
  options.log(`${recipe.title}: ready`)
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
    forwardLines(child.stdout, options.log)
    forwardLines(child.stderr, options.log)
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
