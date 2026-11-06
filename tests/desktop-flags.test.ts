import { describe, expect, it } from 'vitest'
import { desktopFlags } from '../apps/desktop/src/flags.js'

describe('the desktop app’s start switches', () => {
  it('change nothing in a normal run', () => {
    expect(desktopFlags({}, { packaged: true })).toEqual({
      webDist: undefined,
      webDevUrl: undefined,
      capture: undefined,
      bundleInfo: undefined,
      noRelaunch: false,
      bot: undefined,
      userData: undefined,
      theme: undefined,
      macs: {
        name: undefined,
        bonjour: true,
        port: undefined,
        useFile: undefined,
      },
      updates: { url: undefined, check: true },
    })
  })

  it('take a capture with its size, screen and wait', () => {
    expect(
      desktopFlags(
        {
          PACENOTE_DESKTOP_CAPTURE: '/tmp/shot.png',
          PACENOTE_DESKTOP_CAPTURE_WIDTH: '900',
          PACENOTE_DESKTOP_CAPTURE_HASH: '#/settings',
        },
        { packaged: true }
      ).capture
    ).toEqual({
      file: '/tmp/shot.png',
      width: 900,
      height: 0,
      hash: '#/settings',
      delayMs: 2_500,
    })
  })

  it('load the dev server only in a run from source', () => {
    const env = { PACENOTE_WEB_DEV_URL: 'http://localhost:5173/' }
    expect(desktopFlags(env, { packaged: false }).webDevUrl).toBe(
      'http://localhost:5173/'
    )
    expect(desktopFlags(env, { packaged: true }).webDevUrl).toBeUndefined()
  })

  it('take only the values each switch knows', () => {
    const flags = desktopFlags(
      {
        PACENOTE_DESKTOP_BOT: 'maybe',
        PACENOTE_DESKTOP_THEME: 'blue',
        PACENOTE_MACS_PORT: 'x',
        PACENOTE_MACS_BONJOUR: 'off',
        PACENOTE_DESKTOP_UPDATE_CHECK: 'off',
      },
      { packaged: true }
    )
    expect(flags).toMatchObject({
      bot: undefined,
      theme: undefined,
      macs: { bonjour: false, port: undefined },
      updates: { check: false },
    })
  })
})
