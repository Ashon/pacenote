import { describe, expect, it } from 'vitest'
import { SingleFlight } from '../src/single-flight.js'

/** Work that waits until it is let go, counting how often it started */
function gate() {
  let release!: (value: string) => void
  let fail!: (error: Error) => void
  let started = 0
  const work = () => {
    started += 1
    return new Promise<string>((resolve, reject) => {
      release = resolve
      fail = reject
    })
  }
  return {
    work,
    release: (value: string) => release(value),
    fail: (error: Error) => fail(error),
    started: () => started,
  }
}

describe('work done one run at a time', () => {
  it('joins the run under way instead of starting another', async () => {
    const flight = new SingleFlight<string>()
    const g = gate()
    const first = flight.run(g.work)
    const second = flight.run(() => Promise.resolve('unused'))
    expect(flight.running).toBe(first)
    g.release('done')
    expect(await first).toBe('done')
    expect(await second).toBe('done')
    expect(g.started()).toBe(1)
    expect(flight.running).toBeUndefined()
  })

  it('starts afresh after a run that failed', async () => {
    const flight = new SingleFlight<string>()
    const g = gate()
    const first = flight.run(g.work)
    g.fail(new Error('down'))
    await expect(first).rejects.toThrow('down')
    const again = flight.run(g.work)
    g.release('up')
    expect(await again).toBe('up')
    expect(g.started()).toBe(2)
  })
})
