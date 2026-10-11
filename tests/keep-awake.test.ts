import { describe, expect, it, vi } from 'vitest'
import { KeepAwake } from '../apps/desktop/src/keep-awake.js'

describe('keeping the Mac awake while Pace answers', () => {
  it('holds off system sleep while requests are in progress, once', () => {
    const blocker = { start: vi.fn(() => 7), stop: vi.fn() }
    const awake = new KeepAwake(blocker)
    awake.set(false)
    expect(blocker.start).not.toHaveBeenCalled()

    awake.set(true)
    awake.set(true)
    expect(blocker.start).toHaveBeenCalledTimes(1)
    // System sleep only: the display may still sleep.
    expect(blocker.start).toHaveBeenCalledWith('prevent-app-suspension')
    expect(awake.holding).toBe(true)

    awake.set(false)
    awake.set(false)
    expect(blocker.stop).toHaveBeenCalledTimes(1)
    expect(blocker.stop).toHaveBeenCalledWith(7)
    expect(awake.holding).toBe(false)
  })
})
