import type { SupervisorState } from '@runtime/types'
import type { SettingsIssue, SettingsView } from '@src/settings/fields'
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderScreen, stubDesktop, unstubDesktop } from '@/testing'
import { SettingsPage } from './settings-page'

const saved: SettingsView = {
  file: '/Users/you/.pacenote/settings.json',
  exists: true,
  dataDir: '/Users/you/.pacenote',
  values: { HISTORY: 'on', HISTORY_RETENTION_DAYS: '30' },
  secrets: {},
  overridden: [],
}

/**
 * Settings, open on a section, with the desktop app answering the settings
 * file as given and its calls to watch; Pace runs when given its state
 */
function settingsAt(section: string, pace?: Partial<SupervisorState>) {
  window.location.hash = `#/settings/${section}`
  const settings = {
    get: vi.fn(async () => saved),
    validate: vi.fn(async (): Promise<SettingsIssue[]> => []),
    save: vi.fn(async (_values: unknown, restart: boolean) => ({
      issues: [],
      restarted: restart,
    })),
  }
  stubDesktop({
    settings,
    bot: { state: async () => (pace ?? null) as SupervisorState | null },
  })
  renderScreen(<SettingsPage />)
  return settings
}

/** The retention field's input, in its row, once the settings are read */
const retention = async () => {
  const label = await screen.findByText('History retention (days)')
  return within(label.closest<HTMLElement>('[data-setting]')!).getByRole(
    'textbox'
  ) as HTMLInputElement
}

afterEach(() => {
  cleanup()
  unstubDesktop()
  window.location.hash = ''
})

describe('Settings', () => {
  it('says it is only in the desktop app, outside it', () => {
    renderScreen(<SettingsPage />)
    expect(
      screen.getByText('Settings can be changed in the desktop app.')
    ).toBeTruthy()
  })

  it("shows the section's settings as the file has them", async () => {
    settingsAt('logs')
    expect(screen.getByRole('heading', { name: 'History & logs' })).toBeTruthy()
    expect((await retention()).value).toBe('30')
    // Nothing changed yet: no save bar
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('saves what changed from the bar at the bottom', async () => {
    const settings = settingsAt('logs')
    fireEvent.change(await retention(), { target: { value: '60' } })
    expect(screen.getByText('1 unsaved change')).toBeTruthy()
    // Checked a moment after the change
    await waitFor(() =>
      expect(settings.validate).toHaveBeenCalledWith({
        HISTORY_RETENTION_DAYS: '60',
      })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(settings.save).toHaveBeenCalledWith(
      { HISTORY_RETENTION_DAYS: '60' },
      false
    )
    // Pace takes it on a restart, which this app cannot do outside Pace
    expect(
      await screen.findByText('Saved. Restart Pace to apply.')
    ).toBeTruthy()
    expect(screen.queryByText('1 unsaved change')).toBeNull()
  })

  it('reverts what changed, and sends nothing', async () => {
    const settings = settingsAt('logs')
    const input = await retention()
    fireEvent.change(input, { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
    expect(input.value).toBe('30')
    expect(screen.queryByText('1 unsaved change')).toBeNull()
    expect(settings.save).not.toHaveBeenCalled()
  })

  it('keeps Save off while the change has an issue, and says it', async () => {
    const settings = settingsAt('logs')
    settings.validate.mockResolvedValue([
      { key: 'HISTORY_RETENTION_DAYS', message: 'Must be a whole number' },
    ])
    fireEvent.change(await retention(), { target: { value: '1.5' } })
    expect(await screen.findByText('Must be a whole number')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('saves and restarts Pace while it runs, for a change it takes then', async () => {
    const settings = settingsAt('logs', { phase: 'running' })
    fireEvent.change(await retention(), { target: { value: '60' } })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save and restart Pace' })
    )
    expect(settings.save).toHaveBeenCalledWith(
      { HISTORY_RETENTION_DAYS: '60' },
      true
    )
    expect(await screen.findByText('Saved and restarted Pace.')).toBeTruthy()
  })
})
