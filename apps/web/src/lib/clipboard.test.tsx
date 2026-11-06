import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCopy } from './clipboard'

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useCopy', () => {
  it('copies the text and says so', async () => {
    const { result } = renderHook(() => useCopy())
    expect(result.current.copied).toBeUndefined()
    let went = false
    await act(async () => {
      went = await result.current.copy('brew upgrade --cask pacenote')
    })
    expect(went).toBe(true)
    expect(writeText).toHaveBeenCalledWith('brew upgrade --cask pacenote')
    expect(result.current.copied).toBe('yes')
  })

  it('waits for text still on its way', async () => {
    const { result } = renderHook(() => useCopy())
    await act(async () => {
      await result.current.copy(Promise.resolve('diagnostics'))
    })
    expect(writeText).toHaveBeenCalledWith('diagnostics')
  })

  it('says when the clipboard refused it, and keeps saying so', async () => {
    vi.useFakeTimers()
    writeText.mockRejectedValue(new Error('denied'))
    const { result } = renderHook(() => useCopy(1_500))
    let went = true
    await act(async () => {
      went = await result.current.copy('link')
    })
    expect(went).toBe(false)
    expect(result.current.copied).toBe('failed')
    act(() => vi.advanceTimersByTime(5_000))
    expect(result.current.copied).toBe('failed')
  })

  it('says it failed when the text never came', async () => {
    const { result } = renderHook(() => useCopy())
    await act(async () => {
      await result.current.copy(Promise.reject(new Error('no diagnostics')))
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(result.current.copied).toBe('failed')
  })

  it('goes back to nothing after the time given', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCopy(1_200))
    await act(async () => {
      await result.current.copy('pnpm mcp')
    })
    act(() => vi.advanceTimersByTime(1_199))
    expect(result.current.copied).toBe('yes')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.copied).toBeUndefined()
  })

  it('stays copied without a time', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCopy())
    await act(async () => {
      await result.current.copy('the command')
    })
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current.copied).toBe('yes')
  })
})
