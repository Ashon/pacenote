import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultVmBin, vmUnsupported } from '../../../src/sandbox/vm.js'
import {
  fetchKernel,
  kernelPath,
  VM_IMAGE_SETTINGS,
} from '../../../src/sandbox/vm-setup.js'
import { REPO } from './processes.js'

/**
 * The built-in VM sandbox for end-to-end tests: pacenote-vm starting Linux VMs
 * on this Mac, with an image built for the tests (support/vm) whose claude is
 * the fake one, answering with what it finds in the VM. The kernel, init
 * filesystem and image stay in a folder of their own between runs; the image
 * is built again when its files change. It needs Apple silicon, macOS 15 or
 * later and a built pacenote-vm (pnpm vm:build); CI's Macs cannot nest VMs, so
 * there it runs only with PACENOTE_E2E_VM=1.
 */
export const ROOT = path.join(tmpdir(), 'pacenote-e2e-vm')
export const BIN = defaultVmBin()
const SUPPORT = path.join(REPO, 'tests/e2e/support')
export const skip =
  vmUnsupported() ??
  (!existsSync(BIN)
    ? `pacenote-vm is not built at ${BIN} (pnpm vm:build)`
    : process.env.CI && process.env.PACENOTE_E2E_VM !== '1'
      ? 'CI cannot nest VMs (PACENOTE_E2E_VM=1 runs it anyway)'
      : undefined)

/** The files the test image is made from, so it is rebuilt when they change */
function imageInputs(): string {
  const hash = createHash('sha256')
  const dirs = [path.join(REPO, 'sandbox/vm'), path.join(SUPPORT, 'vm')]
  for (const dir of dirs)
    for (const name of readdirSync(dir).sort())
      hash.update(name).update(readFileSync(path.join(dir, name)))
  hash.update(readFileSync(path.join(SUPPORT, 'fake-claude.mjs')))
  hash.update(JSON.stringify(VM_IMAGE_SETTINGS))
  return hash.digest('hex')
}

/** The kernel, the init filesystem and the test images, where missing */
export async function prepare(): Promise<void> {
  mkdirSync(ROOT, { recursive: true })
  const log = (line: string) => console.log(`[vm] ${line}`)
  if (!existsSync(kernelPath(ROOT)))
    await fetchKernel({ bin: BIN, root: ROOT, sandboxDir: '', log })
  const helper = (args: string[]) => {
    const result = spawnSync(BIN, args, { encoding: 'utf8' })
    if (result.status !== 0)
      throw new Error(
        `pacenote-vm ${args[0]} failed: ${result.stderr}${result.stdout}`
      )
  }
  if (!existsSync(path.join(ROOT, 'initfs.ext4')))
    helper(['prepare', '--root', ROOT])
  const inputs = imageInputs()
  const build = (name: string, base: string, script: string) => {
    const stamp = path.join(ROOT, 'images', name, 'e2e-inputs')
    if (existsSync(stamp) && readFileSync(stamp, 'utf8') === inputs) return
    log(`building the test image ${name}`)
    helper([
      'build',
      '--root',
      ROOT,
      '--base',
      base,
      '--name',
      name,
      '--size',
      '1',
      // As vm-setup.ts sets each image
      ...(name === 'broker'
        ? [
            '--set-user',
            '1000:1000',
            '--set-workdir',
            '/app',
            '--set-entrypoint',
            '/usr/local/bin/sandbox-entrypoint',
            '--set-env',
            'HOME=/tmp',
          ]
        : VM_IMAGE_SETTINGS),
      '--mount',
      `${path.join(REPO, 'sandbox/vm')}:/pacenote`,
      '--mount',
      `${path.join(SUPPORT, 'vm')}:/fake`,
      '--mount',
      `${SUPPORT}:/support`,
      '--',
      '/bin/sh',
      script,
    ])
    writeFileSync(stamp, inputs)
  }
  build('reasoner', 'docker.io/library/node:24-alpine', '/fake/image.sh')
  build('broker', 'docker.io/library/node:24-alpine', '/fake/broker-image.sh')
}
