import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
})
