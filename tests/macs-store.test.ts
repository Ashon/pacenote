import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  GROUP_FILE,
  groupKeyOf,
  MACS_FILE,
  macsFileOf,
  MacsStore,
  type MacsFile,
} from '../src/macs/store.js'

describe('what a Mac keeps of your Macs', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true })
  })
  const fresh = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pacenote-macs-store-'))
    dirs.push(dir)
    return dir
  }
  const quiet = () => undefined

  it('reads macs.json with anything missing or not of its kind at its default', () => {
    expect(macsFileOf({}, () => 'mac-1')).toEqual({
      version: 1,
      id: 'mac-1',
      follow: false,
      addresses: [],
      ignored: [],
      known: {},
      devices: {},
      removed: {},
    })
    const kept: MacsFile = {
      version: 1,
      id: 'pro',
      follow: true,
      addresses: ['100.68.0.12:50000'],
      ignored: ['old'],
      lease: { holder: 'air', term: 3, at: 1_000 },
      known: {
        air: { name: 'MacBook Air', lastSeen: '2026-11-07T09:00:00.000Z' },
      },
      devices: {
        ipad: {
          name: 'iPad',
          device: 'tablet',
          pairedAt: '2026-11-02T00:00:00.000Z',
        },
      },
      removed: { phone: '2026-11-03T00:00:00.000Z' },
    }
    expect(macsFileOf(kept, () => 'unused')).toEqual(kept)
    expect(
      macsFileOf(
        {
          id: '',
          follow: 'yes',
          addresses: 'mini.local',
          ignored: null,
        } as never,
        () => 'mac-2'
      )
    ).toMatchObject({ id: 'mac-2', follow: false, addresses: [], ignored: [] })
  })

  it('gives a Mac its id once, and keeps what it saves', () => {
    const dataDir = fresh()
    const store = new MacsStore(dataDir, quiet)
    const id = store.file.id
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    // Written at once, so the Mac is the same one after a restart
    const written = () =>
      JSON.parse(readFileSync(path.join(dataDir, MACS_FILE), 'utf8')) as {
        id: string
      }
    expect(written()).toMatchObject({ version: 1, id })
    store.save({ follow: true, addresses: ['mini.local'] })
    expect(written()).toMatchObject({ id, follow: true })
    const again = new MacsStore(dataDir, quiet)
    expect(again.file).toMatchObject({
      id,
      follow: true,
      addresses: ['mini.local'],
    })
    expect(again.group).toBeUndefined()
  })

  it('keeps the key Add a device made for you alone, and reads only a key', () => {
    const dataDir = fresh()
    const store = new MacsStore(dataDir, quiet)
    const key = Buffer.alloc(32, 7)
    store.setGroup(key)
    expect(store.group).toEqual(key)
    const file = path.join(dataDir, GROUP_FILE)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(readFileSync(file, 'utf8')).toBe(`${key.toString('base64')}\n`)
    expect(new MacsStore(dataDir, quiet).group).toEqual(key)
    writeFileSync(file, Buffer.alloc(16, 7).toString('base64'))
    expect(new MacsStore(dataDir, quiet).group).toBeUndefined()
    expect(groupKeyOf(` ${key.toString('base64')}\n`)).toEqual(key)
    expect(groupKeyOf('')).toBeUndefined()
  })

  it('says in the log what it could not save, and keeps it meanwhile', () => {
    // A file where its folder should be: nothing can be written in it
    const dataDir = path.join(fresh(), 'not-a-folder')
    writeFileSync(dataDir, '')
    const said: string[] = []
    const store = new MacsStore(dataDir, (message) => said.push(message))
    expect(said).toEqual([
      expect.stringMatching(/^Macs: could not save macs\.json: /),
    ])
    store.save({ follow: true })
    expect(store.file.follow).toBe(true)
    store.setGroup(Buffer.alloc(32, 1))
    expect(store.group).toEqual(Buffer.alloc(32, 1))
    expect(said).toHaveLength(3)
    expect(said[2]).toMatch(/^Macs: could not save macs-key: /)
  })
})
