import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import type { PowerMonitor } from 'electron'
import type { MacUse } from '../../../src/macs/types.js'

/**
 * What the desktop app gives Settings > Devices (src/macs/macs.ts): this Mac's
 * name and how it is used now.
 */

/**
 * This Mac's name as you set it (System Settings > General > Sharing), or its
 * host name
 */
export function macName(): string {
  try {
    const name = execFileSync('/usr/sbin/scutil', ['--get', 'ComputerName'], {
      encoding: 'utf8',
      timeout: 2_000,
    }).trim()
    if (name) return name
  } catch {
    // Not on macOS, or no name set
  }
  return hostname().replace(/\.local$/, '')
}

/**
 * How this Mac is used: seconds since the last keyboard or mouse input, the
 * screen locked, and going to sleep (said on suspend, as the Mac goes).
 * onChange is called when it locks, unlocks, sleeps or wakes, so the other
 * Macs hear at once. End-to-end tests name a JSON file to read it from
 * instead (PACENOTE_MACS_USE_FILE).
 */
export class MacUseWatch {
  private locked = false
  private asleep = false

  constructor(
    private readonly monitor: Pick<
      PowerMonitor,
      'on' | 'getSystemIdleTime' | 'getSystemIdleState'
    >,
    onChange: () => void,
    private readonly file?: string
  ) {
    const set = (patch: { locked?: boolean; asleep?: boolean }) => () => {
      if (patch.locked !== undefined) this.locked = patch.locked
      if (patch.asleep !== undefined) this.asleep = patch.asleep
      onChange()
    }
    monitor.on('lock-screen', set({ locked: true }))
    monitor.on('unlock-screen', set({ locked: false }))
    monitor.on('suspend', set({ asleep: true }))
    monitor.on('resume', set({ asleep: false }))
  }

  current(): MacUse {
    if (this.file) {
      try {
        const use = JSON.parse(readFileSync(this.file, 'utf8')) as MacUse
        return {
          idle: Number(use.idle) || 0,
          locked: use.locked === true,
          asleep: use.asleep === true,
        }
      } catch {
        return { idle: 0, locked: false, asleep: false }
      }
    }
    return {
      idle: this.monitor.getSystemIdleTime(),
      locked: this.locked || this.monitor.getSystemIdleState(1) === 'locked',
      asleep: this.asleep,
    }
  }
}
