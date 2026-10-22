import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { VmBroker } from '../src/sandbox/vm-broker.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-vm-broker-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe("the ops broker's VM", () => {
  it('starts no VM once stopped while it gets ready', async () => {
    // A stand-in for pacenote-vm that says it was run
    const launched = path.join(root, 'launched')
    const bin = path.join(root, 'pacenote-vm')
    writeFileSync(bin, `#!/bin/sh\ntouch '${launched}'\nsleep 30\n`)
    chmodSync(bin, 0o755)
    const images = path.join(root, 'vm', 'images', 'broker')
    mkdirSync(images, { recursive: true })
    writeFileSync(path.join(images, 'rootfs.ext4'), '')
    const broker = new VmBroker({
      bin,
      root: path.join(root, 'vm'),
      image: 'broker',
      bundleDir: path.join(root, 'bundle'),
      workDir: path.join(root, 'work'),
      env: { PACENOTE_HOME: path.join(root, 'home') },
    })
    // A bot told to stop as it starts
    const starting = broker.start()
    await broker.stop()
    await starting
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(existsSync(launched)).toBe(false)
    // Nor its way out
    expect(existsSync(broker.socket.replace('broker-', 'broker-egress-'))).toBe(
      false
    )
  })

  it("gets the gh login's token and the git author from this Mac", async () => {
    const dir = path.join(root, 'credentials')
    const bins = path.join(dir, 'bin')
    mkdirSync(bins, { recursive: true })
    const script = (file: string, body: string) => {
      writeFileSync(file, `#!/bin/sh\n${body}\n`)
      chmodSync(file, 0o755)
    }
    script(path.join(bins, 'gh'), 'echo gho_fake')
    script(
      path.join(bins, 'git'),
      '[ "$3" = user.name ] && echo "Pace Author" || echo pace@example.com'
    )
    // A stand-in for pacenote-vm that keeps what it was given and stops
    const given = path.join(dir, 'env')
    const bin = path.join(dir, 'pacenote-vm')
    script(bin, `env > '${given}'\nexit 1`)
    const images = path.join(dir, 'vm', 'images', 'broker')
    mkdirSync(images, { recursive: true })
    writeFileSync(path.join(images, 'rootfs.ext4'), '')
    const broker = new VmBroker({
      bin,
      root: path.join(dir, 'vm'),
      image: 'broker',
      bundleDir: path.join(dir, 'bundle'),
      workDir: path.join(dir, 'work'),
      env: {
        PACENOTE_HOME: path.join(dir, 'home'),
        PATH: `${bins}:${process.env.PATH}`,
        OPS_GIT_ALLOWED_OWNERS: 'acme',
      },
    })
    await expect(broker.start()).rejects.toThrow('did not start')
    await broker.stop()
    const env = readFileSync(given, 'utf8').split('\n')
    expect(env).toContain('GH_TOKEN=gho_fake')
    expect(env).toContain('GIT_AUTHOR_NAME=Pace Author')
    expect(env).toContain('GIT_AUTHOR_EMAIL=pace@example.com')
    expect(env).toContain('GIT_ALLOWED_OWNERS=acme')
  })
})
