import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMac } from './platform'
import {
  HOLD_MS,
  KEYS,
  keyOf,
  keysLabel,
  useKeysWatch,
  useShortcut,
} from './shortcuts'

/** ⌘ here, as the tests' platform takes it (Ctrl off a Mac) */
const COMMAND = isMac ? 'Meta' : 'Control'
const withCommand = isMac ? { metaKey: true } : { ctrlKey: true }

const press = (
  key: string,
  extra: Partial<KeyboardEventInit> = {},
  target: Element = document.body
) => fireEvent.keyDown(target, { key, ...withCommand, ...extra })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('the key a press is for', () => {
  it('is the character the key types', () => {
    expect(keyOf({ key: 'N', code: 'KeyN' })).toBe('n')
    expect(keyOf({ key: '1', code: 'Digit1' })).toBe('1')
    expect(keyOf({ key: ',', code: 'Comma' })).toBe(',')
    expect(keyOf({ key: 'Enter', code: 'Enter' })).toBe('Enter')
  })

  it("is the key's place when the layout or Shift types something else", () => {
    // A Korean input source on
    expect(keyOf({ key: 'ㅜ', code: 'KeyN' })).toBe('n')
    // ⇧[ types "{", ⇧1 types "!"
    expect(keyOf({ key: '{', code: 'BracketLeft' })).toBe('[')
    expect(keyOf({ key: '!', code: 'Digit1' })).toBe('1')
  })
})

describe('the keys, as they are written', () => {
  it('in the order and signs a Mac menu has, or spelled out elsewhere', () => {
    expect(keysLabel(KEYS.newSession)).toBe(isMac ? '⇧⌘N' : 'Ctrl+Shift+N')
    expect(keysLabel(KEYS.taskDone)).toBe(isMac ? '⌘↩' : 'Ctrl+Enter')
    expect(keysLabel(KEYS.section(2))).toBe(isMac ? '⌘2' : 'Ctrl+2')
  })
})

describe('a shortcut', () => {
  it('runs on its keys, and only with exactly their modifiers', () => {
    const run = vi.fn()
    renderHook(() => useShortcut(KEYS.newTask, run))
    press('n', { shiftKey: true })
    press('n', { altKey: true })
    expect(run).not.toHaveBeenCalled()
    press('n')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('is there only while it is asked for', () => {
    const run = vi.fn()
    const { rerender, unmount } = renderHook(
      ({ when }) => useShortcut(KEYS.newTask, run, { when }),
      { initialProps: { when: false } }
    )
    press('n')
    rerender({ when: true })
    press('n')
    unmount()
    press('n')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('leaves the keys that edit text to a field being typed in', () => {
    const done = vi.fn()
    const search = vi.fn()
    renderHook(() => {
      useShortcut(KEYS.taskDone, done)
      useShortcut(KEYS.search, search)
    })
    const field = document.body.appendChild(document.createElement('textarea'))
    press('Enter', {}, field)
    expect(done).not.toHaveBeenCalled()
    press('k', {}, field)
    expect(search).toHaveBeenCalledTimes(1)
    press('Enter')
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('waits while a dialog or menu is over the window', () => {
    const run = vi.fn()
    renderHook(() => useShortcut(KEYS.section(1), run))
    render(<div role="dialog" />)
    press('1')
    expect(run).not.toHaveBeenCalled()
  })
})

describe('the keys shown while ⌘ is held', () => {
  const shown = () => 'keys' in document.documentElement.dataset

  it('show once ⌘ is held by itself a moment, until it is let go', () => {
    vi.useFakeTimers()
    renderHook(() => useKeysWatch())
    fireEvent.keyDown(window, { key: COMMAND, ...withCommand })
    act(() => vi.advanceTimersByTime(HOLD_MS - 1))
    expect(shown()).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(shown()).toBe(true)
    fireEvent.keyUp(window, { key: COMMAND })
    expect(shown()).toBe(false)
  })

  it('stay away for a key pressed with ⌘, until ⌘ is held again', () => {
    vi.useFakeTimers()
    renderHook(() => useKeysWatch())
    fireEvent.keyDown(window, { key: COMMAND, ...withCommand })
    // ⌘C, quicker than the keys come
    fireEvent.keyDown(window, { key: 'c', ...withCommand })
    act(() => vi.advanceTimersByTime(HOLD_MS * 2))
    expect(shown()).toBe(false)
    fireEvent.keyUp(window, { key: COMMAND })
    fireEvent.keyDown(window, { key: COMMAND, ...withCommand })
    act(() => vi.advanceTimersByTime(HOLD_MS))
    expect(shown()).toBe(true)
    // ⌘Tab away: the window never hears ⌘ let go
    fireEvent.blur(window)
    expect(shown()).toBe(false)
  })

  it('come after a click made without ⌘', () => {
    vi.useFakeTimers()
    renderHook(() => useKeysWatch())
    fireEvent.pointerDown(document.body)
    fireEvent.keyDown(window, { key: COMMAND, ...withCommand })
    act(() => vi.advanceTimersByTime(HOLD_MS))
    expect(shown()).toBe(true)
    // A click while they show puts them away
    fireEvent.pointerDown(document.body)
    expect(shown()).toBe(false)
    fireEvent.keyUp(window, { key: COMMAND })
  })
})
