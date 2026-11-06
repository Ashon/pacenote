import { describe, expect, it } from 'vitest'
import { splitList } from '../src/settings/list.js'

describe('a list setting', () => {
  it('splits on commas, trimming each item and leaving out empty ones', () => {
    expect(splitList(' a, b,,c ')).toEqual(['a', 'b', 'c'])
  })

  it('is empty when unset', () => {
    expect(splitList(undefined)).toEqual([])
    expect(splitList(null)).toEqual([])
    expect(splitList(' , ')).toEqual([])
  })
})
