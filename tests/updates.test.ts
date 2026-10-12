import { describe, expect, it } from 'vitest'
import {
  isNewer,
  parseVersion,
  UpdateCheck,
} from '../apps/desktop/src/updates.js'

describe('update check', () => {
  it('compares release versions by number', () => {
    expect(parseVersion('v0.4.10')).toEqual([0, 4, 10])
    expect(parseVersion('0.4.6-3-g2034e74')).toBeUndefined()
    expect(isNewer('0.4.10', '0.4.9')).toBe(true)
    expect(isNewer('v1.0.0', '0.9.9')).toBe(true)
    expect(isNewer('0.4.6', '0.4.6')).toBe(false)
    expect(isNewer('0.4.5', '0.4.6')).toBe(false)
    expect(isNewer('nightly', '0.4.6')).toBe(false)
  })

  it('tells when the latest release is newer, and keeps what it knew when a check fails', async () => {
    const logs: string[] = []
    let reply: () => Response = () =>
      Response.json({
        tag_name: 'v0.4.7',
        html_url: 'https://github.com/Ashon/pacenote/releases/tag/v0.4.7',
      })
    const check = new UpdateCheck({
      current: '0.4.6',
      log: (message) => logs.push(message),
      fetch: async () => reply(),
    })
    const changes: boolean[] = []
    check.on('change', (state) => changes.push(state.available))
    expect(await check.check()).toMatchObject({
      available: true,
      latest: { version: '0.4.7' },
    })
    expect(logs).toEqual(['Pacenote 0.4.7 is out'])

    reply = () => new Response('rate limited', { status: 403 })
    expect(await check.check()).toMatchObject({
      available: true,
      latest: { version: '0.4.7' },
    })
    expect(logs.at(-1)).toBe('Could not check for updates: HTTP 403')
    expect(changes).toEqual([true])

    const current = new UpdateCheck({
      current: '0.4.7',
      log: () => {},
      fetch: async () => Response.json({ tag_name: 'v0.4.7' }),
    })
    expect((await current.check()).available).toBe(false)
  })
})
