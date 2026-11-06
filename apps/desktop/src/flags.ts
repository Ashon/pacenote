/**
 * The switches the desktop app reads from its environment at start, for
 * screen captures, end-to-end tests and runs from the repository. None is set
 * in a normal run: each says what it changes, and what is left as it is.
 */
export interface DesktopFlags {
  /** A copy of the UI to load in its place (PACENOTE_DESKTOP_WEB_DIST) */
  webDist?: string
  /** The Vite dev server, in a run from source (PACENOTE_WEB_DEV_URL) */
  webDevUrl?: string
  /** Saves the window as a PNG and quits (PACENOTE_DESKTOP_CAPTURE) */
  capture?: {
    file: string
    /** The window's size, when given; 0 keeps the default */
    width: number
    height: number
    /** The screen to capture, as a route (#/settings) */
    hash?: string
    /** How long the screen gets to settle first */
    delayMs: number
  }
  /** Where the bundle's Info.plist is, in a run from the repository */
  bundleInfo?: string
  /** Leaves restarting to the test that quit the app (NO_RELAUNCH=1) */
  noRelaunch: boolean
  /**
   * Whether the app runs the bot: on, off, or left to it (it does, except
   * during captures)
   */
  bot?: 'on' | 'off'
  /** A user data folder of its own, off the running app's lock */
  userData?: string
  /** system unless light or dark */
  theme?: 'light' | 'dark'
  /** Your other Macs, as end-to-end tests set them up */
  macs: {
    name?: string
    bonjour: boolean
    port?: number
    /** A file standing in for whether the Mac is in use */
    useFile?: string
  }
  /** Where updates are looked for, and whether they are */
  updates: { url?: string; check: boolean }
}

const set = (value: string | undefined) => value || undefined

export function desktopFlags(
  env: NodeJS.ProcessEnv,
  { packaged }: { packaged: boolean }
): DesktopFlags {
  const captureFile = set(env.PACENOTE_DESKTOP_CAPTURE)
  const bot = env.PACENOTE_DESKTOP_BOT
  const theme = env.PACENOTE_DESKTOP_THEME
  const port = Number(env.PACENOTE_MACS_PORT)
  return {
    webDist: set(env.PACENOTE_DESKTOP_WEB_DIST),
    webDevUrl: packaged ? undefined : set(env.PACENOTE_WEB_DEV_URL),
    capture: captureFile
      ? {
          file: captureFile,
          width: Number(env.PACENOTE_DESKTOP_CAPTURE_WIDTH) || 0,
          height: Number(env.PACENOTE_DESKTOP_CAPTURE_HEIGHT) || 0,
          hash: set(env.PACENOTE_DESKTOP_CAPTURE_HASH),
          delayMs: Number(env.PACENOTE_DESKTOP_CAPTURE_DELAY) || 2_500,
        }
      : undefined,
    bundleInfo: packaged ? undefined : set(env.PACENOTE_DESKTOP_BUNDLE_INFO),
    noRelaunch: env.PACENOTE_DESKTOP_NO_RELAUNCH === '1',
    bot: bot === 'on' || bot === 'off' ? bot : undefined,
    userData: set(env.PACENOTE_DESKTOP_USER_DATA),
    theme: theme === 'light' || theme === 'dark' ? theme : undefined,
    macs: {
      name: set(env.PACENOTE_MACS_NAME),
      bonjour: env.PACENOTE_MACS_BONJOUR !== 'off',
      port: port > 0 ? port : undefined,
      useFile: set(env.PACENOTE_MACS_USE_FILE),
    },
    updates: {
      url: set(env.PACENOTE_DESKTOP_UPDATE_URL),
      check: env.PACENOTE_DESKTOP_UPDATE_CHECK !== 'off',
    },
  }
}
