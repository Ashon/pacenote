import { afterEach, describe, expect, it, vi } from 'vitest'
import { Adding, type SetupChannel } from '../src/macs/adding.js'
import { ADDING_MS } from '../src/macs/timing.js'

/** A setup channel that keeps what it is sent and how often it closed */
function channel(name = 'MacBook Air') {
  const sent: unknown[] = []
  let closed = 0
  const it: SetupChannel & { sent: unknown[]; closed: () => number } = {
    peer: { id: `${name}-1`, name },
    send: (message) => void sent.push(message),
    close: () => void (closed += 1),
    sent,
    closed: () => closed,
  }
  return it
}

const until = (now: number) => new Date(now + ADDING_MS).toISOString()

describe('Add a device', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits ten minutes for a new Mac, and says who asks', () => {
    const adding = new Adding()
    expect(adding.view()).toBeUndefined()
    expect(adding.waiting).toBe(false)
    expect(adding.free()).toBeUndefined()
    const now = Date.UTC(2026, 10, 7, 9)
    adding.start({ now, expired: () => undefined })
    expect(adding.waiting).toBe(true)
    expect(adding.ended).toBe(false)
    expect(adding.view()).toEqual({ until: until(now) })

    const run = adding.free()!
    const air = channel()
    expect(
      adding.ask(run, { name: 'MacBook Air', code: '123456', channel: air })
    ).toBe(true)
    expect(adding.request?.channel).toBe(air)
    expect(adding.view()).toEqual({
      until: until(now),
      request: { name: 'MacBook Air', code: '123456' },
    })
    // One asks at a time
    expect(adding.free()).toBeUndefined()
    const mini = channel('Mac mini')
    expect(
      adding.ask(run, { name: 'Mac mini', code: '654321', channel: mini })
    ).toBe(false)

    // The one asking goes: another may ask
    expect(adding.left(run, mini)).toBe(false)
    expect(adding.left(run, air)).toBe(true)
    expect(adding.request).toBeUndefined()
    expect(adding.free()).toBe(run)
    const ipad = channel('iPad')
    adding.ask(run, {
      name: 'iPad',
      code: '111111',
      channel: ipad,
      device: 'tablet',
    })
    expect(adding.view()?.request).toEqual({
      name: 'iPad',
      code: '111111',
      device: 'tablet',
    })
  })

  it('ends saying how, no longer shown, and lets the one asking go', () => {
    const advert = { stop: vi.fn() }
    const adding = new Adding()
    adding.start({ now: 0, expired: () => undefined, advert })
    const run = adding.free()!
    const ipad = channel('iPad')
    adding.ask(run, {
      name: 'iPad',
      code: '111111',
      channel: ipad,
      device: 'tablet',
    })
    expect(adding.end('sent', 'iPad', 'tablet')).toBe(true)
    expect(advert.stop).toHaveBeenCalledTimes(1)
    expect(ipad.closed()).toBe(1)
    expect(ipad.sent).toEqual([])
    expect(adding.ended).toBe(true)
    expect(adding.waiting).toBe(false)
    expect(adding.request).toBeUndefined()
    expect(adding.free()).toBeUndefined()
    expect(adding.view()).toEqual({
      until: until(0),
      result: { kind: 'sent', name: 'iPad', device: 'tablet' },
    })
    // Ended once: nothing ends it again, and no one asks in it
    expect(adding.end('declined')).toBe(false)
    expect(
      adding.ask(run, { name: 'iPad', code: '1', channel: channel('iPad') })
    ).toBe(false)
    // Read: it goes away
    adding.clear()
    expect(adding.view()).toBeUndefined()
    expect(adding.ended).toBe(false)
    expect(adding.end('declined')).toBe(false)
  })

  it('stops waiting after ten minutes, and tells the one asking', () => {
    vi.useFakeTimers()
    const expired = vi.fn()
    const adding = new Adding()
    adding.start({ now: 0, expired })
    const air = channel()
    adding.ask(adding.free()!, {
      name: 'MacBook Air',
      code: '123456',
      channel: air,
    })
    vi.advanceTimersByTime(ADDING_MS - 1)
    expect(expired).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(expired).toHaveBeenCalledTimes(1)
    // As the Macs end it then
    expect(adding.end('expired')).toBe(true)
    expect(air.sent).toEqual([{ t: 'setup-expired' }])
    expect(air.closed()).toBe(1)
    expect(adding.view()?.result).toEqual({ kind: 'expired' })
  })

  it('never expires once it went away, and takes no one who asks in a run gone', () => {
    vi.useFakeTimers()
    const expired = vi.fn()
    const advert = { stop: vi.fn() }
    const adding = new Adding()
    adding.start({ now: 0, expired, advert })
    const gone = adding.free()!
    adding.clear()
    expect(advert.stop).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(ADDING_MS)
    expect(expired).not.toHaveBeenCalled()
    adding.start({ now: 0, expired })
    expect(
      adding.ask(gone, { name: 'MacBook Air', code: '1', channel: channel() })
    ).toBe(false)
    expect(adding.request).toBeUndefined()
  })

  it('lets the one asking go while it is still there, so its going is seen', () => {
    const adding = new Adding()
    adding.start({ now: 0, expired: () => undefined })
    const run = adding.free()!
    const seen: unknown[] = []
    // As the Macs' setup channel: closing says so at once
    const air: SetupChannel = {
      ...channel(),
      close: () => {
        if (adding.left(run, air)) seen.push(adding.view())
      },
    }
    adding.ask(run, { name: 'MacBook Air', code: '123456', channel: air })
    adding.clear()
    expect(seen).toEqual([{ until: until(0) }])
    expect(adding.view()).toBeUndefined()
  })
})
