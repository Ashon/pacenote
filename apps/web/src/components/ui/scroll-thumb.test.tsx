import { describe, expect, it } from 'vitest'
import { THUMB_WIDTH, thumbDash, thumbTrack } from './scroll-thumb'

// The scrollbar's box inside its border: w-2.5 less the 1px border
const BAR = { width: 9, height: 400 }

describe("the scrollbar thumb's line", () => {
  it('runs straight down the bar where it meets no corner', () => {
    const track = thumbTrack({ ...BAR, top: 0, bottom: 0 })
    expect(track.d).toBe('M4.5 4.5L4.5 395.5')
    expect(track.length).toBe(391)
  })

  it('bends round the curved corners it meets, concentric with them', () => {
    const track = thumbTrack({ ...BAR, top: 20, bottom: 20 })
    // A circle 15.5 round from the corner's centre (-11, 20): 4.5 in from
    // the curve, as the straight part is 4.5 in from the side
    expect(track.d).toBe(
      'M-3.25 6.58A15.5 15.5 0 0 1 4.5 20L4.5 380A15.5 15.5 0 0 1 -3.25 393.42'
    )
    // A third of the way round each corner, and the side between them
    expect(track.length).toBeCloseTo(360 + 2 * (Math.PI / 3) * 15.5, 6)
  })

  it('bends only at the end that meets a corner', () => {
    const track = thumbTrack({ ...BAR, top: 0, bottom: 20 })
    expect(track.d.startsWith('M4.5 4.5L4.5 380A')).toBe(true)
  })

  it('keeps straight ends at a corner too tight to bend round, or a bar too short', () => {
    expect(thumbTrack({ ...BAR, top: 5, bottom: 5 }).d).toBe(
      'M4.5 4.5L4.5 395.5'
    )
    expect(thumbTrack({ width: 9, height: 40, top: 20, bottom: 20 }).d).toBe(
      'M4.5 4.5L4.5 35.5'
    )
  })
})

describe('where the thumb sits on it', () => {
  const track = thumbTrack({ ...BAR, top: 20, bottom: 20 })

  it('covers the share of the content shown, its round ends included', () => {
    const { dash } = thumbDash(track, {
      viewport: 100,
      content: 400,
      scrollTop: 0,
    })
    expect(dash + THUMB_WIDTH).toBeCloseTo((track.length + THUMB_WIDTH) / 4, 6)
  })

  it('starts at the top, ends at the bottom and moves with the scroll', () => {
    const at = (scrollTop: number) =>
      thumbDash(track, { viewport: 100, content: 400, scrollTop })
    expect(at(0).offset).toBe(0)
    const end = at(300)
    expect(end.offset + end.dash).toBeCloseTo(track.length, 6)
    expect(at(150).offset).toBeCloseTo(end.offset / 2, 6)
    // Past either end, as a bounce may take it, it stays at the end
    expect(at(-40).offset).toBe(0)
    expect(at(340).offset).toBeCloseTo(end.offset, 6)
  })

  it('is 18px long at least, as Radix keeps its own', () => {
    const { dash } = thumbDash(track, {
      viewport: 100,
      content: 100_000,
      scrollTop: 0,
    })
    expect(dash + THUMB_WIDTH).toBe(18)
  })
})
