import { describe, expect, it } from 'vitest'
import { sheetShape } from './sheet-shape'

describe("a sheet in the window's corners", () => {
  it('is concentric with them: their radius less its gap', () => {
    // macOS 26 and later
    expect(sheetShape(16)).toEqual({ gap: 6, radius: 10 })
    // macOS 11 to 15
    expect(sheetShape(10)).toEqual({ gap: 4, radius: 6 })
    // Rounder corners keep the gap at 8px
    expect(sheetShape(26)).toEqual({ gap: 8, radius: 18 })
  })

  it("keeps macOS 26's shape where the corners are square", () => {
    expect(sheetShape(0)).toEqual({ gap: 6, radius: 10 })
    expect(sheetShape(Number.NaN)).toEqual({ gap: 6, radius: 10 })
  })
})
