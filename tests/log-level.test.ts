import { describe, expect, it } from 'vitest'
import { lineLevelOf, LOG_LEVELS } from '../src/log-level.js'

describe('log levels', () => {
  it('go from the least severe to the most', () => {
    expect(LOG_LEVELS).toEqual(['debug', 'info', 'warn', 'error'])
  })

  it('read a requested level in either case, as a log line writes it', () => {
    expect(lineLevelOf('warn')).toBe('WARN')
    expect(lineLevelOf('ERROR')).toBe('ERROR')
    expect(lineLevelOf('loud')).toBeUndefined()
    expect(lineLevelOf(null)).toBeUndefined()
  })
})
