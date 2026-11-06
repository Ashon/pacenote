import { describe, expect, it } from 'vitest'
import {
  closeAction,
  CrashBudget,
  isScreenUrl,
  opensInBrowser,
} from '../apps/desktop/src/window-rules.js'

describe('closing the window', () => {
  it('hides it while the app runs, and closes it when the app quits', () => {
    expect(closeAction({ quitting: false, fullScreen: false })).toBe('hide')
    expect(closeAction({ quitting: true, fullScreen: true })).toBe('close')
  })

  it('leaves full screen first, so no black space is left behind', () => {
    expect(closeAction({ quitting: false, fullScreen: true })).toBe(
      'leave-full-screen'
    )
  })
})

describe('a window whose process ended', () => {
  it('loads again three times a minute, then stays blank', () => {
    const budget = new CrashBudget(3, 60_000, () => 0)
    expect([budget.reload(), budget.reload(), budget.reload()]).toEqual([
      true,
      true,
      true,
    ])
    expect(budget.reload()).toBe(false)
  })

  it('forgets endings older than a minute', () => {
    let now = 0
    const budget = new CrashBudget(3, 60_000, () => now)
    for (let i = 0; i < 3; i += 1) budget.reload()
    now = 61_000
    expect(budget.reload()).toBe(true)
  })
})

describe('where the window goes', () => {
  it('stays on the app screen, or the dev server in a run from source', () => {
    expect(isScreenUrl('pacenote://app/#/settings')).toBe(true)
    expect(isScreenUrl('https://example.com/')).toBe(false)
    expect(
      isScreenUrl('http://localhost:5173/#/', 'http://localhost:5173/')
    ).toBe(true)
  })

  it('opens only https links in the browser', () => {
    expect(opensInBrowser('https://app.slack.com/client')).toBe(true)
    expect(opensInBrowser('file:///etc/passwd')).toBe(false)
    expect(opensInBrowser('javascript:alert(1)')).toBe(false)
  })
})
