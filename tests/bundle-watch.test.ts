import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { BundleWatch, bundleVersion } from '../apps/desktop/src/bundle-watch.js'

const root = mkdtempSync(path.join(tmpdir(), 'pacenote-bundle-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const plist = (version: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>Pacenote</string>
	<key>CFBundleShortVersionString</key>
	<string>${version}</string>
	<key>CFBundleVersion</key>
	<string>${version}</string>
</dict>
</plist>
`

describe('the app bundle replaced while it runs', () => {
  it('reads the version an Info.plist names', () => {
    expect(bundleVersion(plist('0.5.14'))).toBe('0.5.14')
    expect(bundleVersion('<plist><dict></dict></plist>')).toBeUndefined()
  })

  it('restarts into another version once, and waits out a swap in progress', async () => {
    const file = path.join(root, 'Info.plist')
    writeFileSync(file, plist('0.5.14'))
    const onReplaced = vi.fn()
    const watch = new BundleWatch({
      file,
      running: '0.5.14',
      onReplaced,
      intervalMs: 20,
    })
    // Its own version, or no file while the bundle is being swapped: nothing.
    expect(watch.check()).toBe(false)
    expect(watch.swapping()).toBe(false)
    rmSync(file)
    expect(watch.check()).toBe(false)
    expect(watch.swapping()).toBe(true)
    writeFileSync(file, '<plist><dict></dict></plist>')
    expect(watch.check()).toBe(false)

    watch.start()
    writeFileSync(file, plist('0.5.15'))
    await vi.waitFor(() => expect(onReplaced).toHaveBeenCalledWith('0.5.15'))
    // Once, however often it is asked after
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(watch.check()).toBe(true)
    expect(onReplaced).toHaveBeenCalledTimes(1)
    watch.stop()
  })

  it('tells a copy that quits the version on disk, once a swap is over', async () => {
    const file = path.join(root, 'quitting', 'Info.plist')
    const watch = new BundleWatch({
      file,
      running: '0.5.24',
      onReplaced: vi.fn(),
    })
    // Gone while the bundle is swapped, then the new one
    setTimeout(() => {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, plist('0.5.25'))
    }, 100)
    expect(await watch.onDisk(5_000)).toBe('0.5.25')
    rmSync(file)
    expect(await watch.onDisk(300)).toBeUndefined()
  })
})
