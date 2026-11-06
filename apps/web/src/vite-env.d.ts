/// <reference types="vite/client" />

import type { DesktopBridge } from '@src/desktop-bridge'

declare global {
  /**
   * The build: Pacenote's version (package.json), and git describe when the
   * build is not exactly the release tag (v0.3.9-3-g2034e74-dirty)
   */
  const __PACENOTE_BUILD__: { version: string; describe?: string }
  interface ImportMetaEnv {
    /** 1: the build includes the Debug section (pnpm desktop) */
    readonly VITE_PACENOTE_DEBUG?: string
  }
  interface Window {
    /**
     * Present in the desktop app (preload), and on a device of yours
     * (the iPhone, iPad and Android app), which asks its Mac for what these
     * screens get (src/desktop-bridge.ts)
     */
    pacenoteDesktop?: DesktopBridge
  }
}
