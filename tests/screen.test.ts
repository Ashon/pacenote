import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenLoader, unavailablePage } from '../apps/desktop/src/screen.js'
import { setLocale } from '../src/i18n/locale.js'

/** A window whose screen fails while failing() says so */
function world(options: { failing: () => string | undefined }) {
  const shown: string[] = []
  const window = { page: 'blank' }
  const log = { info: vi.fn(), warn: vi.fn() }
  let closed = false
  const load = vi.fn(async () => {
    const reason = options.failing()
    // A failed load leaves an empty page, as Chromium's does.
    window.page = reason ? 'blank' : 'screen'
    if (reason) throw new Error(reason)
  })
  const probe = vi.fn(async () => {
    const reason = options.failing()
    if (reason) throw new Error(reason)
  })
  const screen = new ScreenLoader({
    load,
    probe,
    showUnavailable: vi.fn(async (reason: string) => {
      shown.push(reason)
      window.page = 'unavailable'
    }),
    gone: () => closed,
    log,
    delaysMs: [0],
  })
  return {
    screen,
    load,
    probe,
    shown,
    window,
    log,
    close: () => {
      closed = true
    },
  }
}

describe("the window's screen", () => {
  afterEach(() => setLocale('en'))

  it('loads at once when it can, saying nothing', async () => {
    const w = world({ failing: () => undefined })
    await w.screen.load()
    expect(w.window.page).toBe('screen')
    expect(w.shown).toEqual([])
    expect(w.log.warn).not.toHaveBeenCalled()
  })

  it('tries again quietly while the cause passes quickly, as an upgrade swaps the files', async () => {
    let tries = 0
    const w = world({
      failing: () =>
        ++tries <= 2 ? "ERR_FAILED (-2) loading 'pacenote://app/'" : undefined,
    })
    await w.screen.load()
    expect(w.window.page).toBe('screen')
    // No page saying why for a moment's failure, and one line in the log for
    // the same reason twice.
    expect(w.shown).toEqual([])
    expect(w.log.warn).toHaveBeenCalledTimes(1)
    expect(w.log.warn).toHaveBeenCalledWith(
      "The window could not load (try 1): ERR_FAILED (-2) loading 'pacenote://app/'"
    )
    expect(w.log.info).toHaveBeenCalledWith('The window loaded on try 3')
  })

  it('says why in its place while it stays away, without touching the window until it would load', async () => {
    let reason: string | undefined = 'net::ERR_ACCESS_DENIED'
    const w = world({ failing: () => reason })
    const loading = w.screen.load()
    await vi.waitFor(() => expect(w.shown).toEqual(['net::ERR_ACCESS_DENIED']))
    expect(w.window.page).toBe('unavailable')
    expect(w.screen.unavailable).toBe(true)
    // Tries go on behind the page: the probe fails, and the page stays.
    const loads = w.load.mock.calls.length
    await vi.waitFor(() => expect(w.probe.mock.calls.length).toBeGreaterThan(3))
    expect(w.load.mock.calls.length).toBe(loads)
    expect(w.shown).toHaveLength(1)
    expect(w.window.page).toBe('unavailable')

    reason = undefined
    await loading
    expect(w.window.page).toBe('screen')
    expect(w.screen.unavailable).toBe(false)
  })

  it('puts the reason back when a load it tried fails anyway', async () => {
    let loads = 0
    const shown: string[] = []
    const screen = new ScreenLoader({
      load: async () => {
        loads += 1
        if (loads < 5) throw new Error(`failed ${loads}`)
      },
      // The files are there, yet the window fails: it says so each time.
      probe: async () => undefined,
      showUnavailable: async (reason) => {
        shown.push(reason)
      },
      gone: () => false,
      log: { info: vi.fn(), warn: vi.fn() },
      delaysMs: [0],
      quietTries: 2,
    })
    await screen.load()
    expect(shown).toEqual(['failed 2', 'failed 3', 'failed 4'])
    expect(screen.unavailable).toBe(false)
  })

  it('says nothing while the cause is passing, such as an upgrade swapping the bundle', async () => {
    let swapping = true
    const shown: string[] = []
    let loads = 0
    const screen = new ScreenLoader({
      load: async () => {
        loads += 1
        if (swapping) throw new Error('ERR_FAILED')
      },
      probe: async () => undefined,
      showUnavailable: async (reason) => {
        shown.push(reason)
      },
      gone: () => false,
      passing: () => swapping,
      log: { info: vi.fn(), warn: vi.fn() },
      delaysMs: [0],
    })
    const loading = screen.load()
    await vi.waitFor(() => expect(loads).toBeGreaterThan(5))
    expect(shown).toEqual([])
    swapping = false
    await loading
    expect(shown).toEqual([])
  })

  it('stops once the window closes, or the app quits or restarts into a new version', async () => {
    const w = world({ failing: () => 'ERR_FAILED' })
    const loading = w.screen.load()
    await vi.waitFor(() => expect(w.shown).toHaveLength(1))
    w.close()
    await loading
    const probes = w.probe.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(w.probe.mock.calls.length).toBe(probes)
  })

  it('tries again at once when asked, not after the wait, and loads once however often asked', async () => {
    let reason: string | undefined = 'ERR_FAILED'
    const load = vi.fn(async () => {
      if (reason) throw new Error(reason)
    })
    const screen = new ScreenLoader({
      load,
      probe: async () => {
        if (reason) throw new Error(reason)
      },
      showUnavailable: async () => undefined,
      gone: () => false,
      log: { info: vi.fn(), warn: vi.fn() },
      // Long enough that only "Try again" gets past it
      delaysMs: [0, 0, 60_000],
    })
    const loading = screen.load()
    expect(screen.load()).toBe(loading)
    await vi.waitFor(() => expect(screen.unavailable).toBe(true))
    reason = undefined
    screen.retryNow()
    await loading
    expect(screen.unavailable).toBe(false)
    expect(load).toHaveBeenCalledTimes(4)
  })
})

describe('the page in its place', () => {
  afterEach(() => setLocale('en'))

  it('says why with the reason as text, and links to try again', () => {
    const page = unavailablePage({
      app: 'Pacenote',
      reason: "ERR_FAILED (-2) loading '<pacenote://app/>'",
      retryUrl: 'pacenote://app/',
    })
    expect(page).toContain('<html lang="en">')
    expect(page).toContain('The screen did not load')
    expect(page).toContain('Pacenote is still running in the menu bar')
    expect(page).toContain(
      'ERR_FAILED (-2) loading &#39;&lt;pacenote://app/&gt;&#39;'
    )
    expect(page).not.toContain('<pacenote://app/>')
    expect(page).toContain('<a href="pacenote://app/">Try again</a>')
    // Nothing of the app's own: no script, and no file to load.
    expect(page).not.toMatch(/<script|<link|src=/)
  })

  it("reads in the app's language", () => {
    setLocale('ko')
    const page = unavailablePage({
      app: 'Pacenote',
      reason: 'ERR_FAILED',
      retryUrl: 'pacenote://app/',
    })
    expect(page).toContain('<html lang="ko">')
    expect(page).toContain('화면을 불러오지 못했어요')
    expect(page).toContain('Pacenote는 메뉴 막대에서 계속 실행 중이고')
    expect(page).toContain('>다시 시도</a>')
  })
})
