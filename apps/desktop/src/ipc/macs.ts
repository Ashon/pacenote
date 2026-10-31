import { ipcMain, shell } from 'electron'
import type { Macs } from '../../../../src/macs/macs.js'
import type { Ipc } from './gate.js'

/**
 * Settings > Devices: your Macs, and where Pace answers; Add a device, which
 * lets a new Mac's setup take your Slack app from this one. macs is undefined
 * when the app does not run Pace.
 */
export function registerMacsIpc(ipc: Ipc, macs: () => Macs | undefined): void {
  ipc.handle('pacenote:macs:view', null, () => macs()?.view() ?? null)
  ipc.handle('pacenote:macs:answer-here', undefined, () => macs()?.answerHere())
  ipcMain.handle('pacenote:macs:follow', async (event, on: unknown) => {
    if (ipc.fromWindow(event) && typeof on === 'boolean')
      await macs()?.setFollow(on)
    return macs()?.view() ?? null
  })
  ipc.handle('pacenote:macs:add-address', false, (address) =>
    typeof address === 'string' ? (macs()?.addAddress(address) ?? false) : false
  )
  ipc.handle('pacenote:macs:remove-address', undefined, (address) => {
    if (typeof address === 'string') macs()?.removeAddress(address)
  })
  ipc.handle('pacenote:macs:ignore', undefined, (id) => {
    if (typeof id === 'string') macs()?.ignore(id)
  })
  ipc.handle('pacenote:macs:remove-device', undefined, (id) => {
    if (typeof id === 'string') macs()?.removeDevice(id)
  })
  // Add a device: a new Mac's setup takes your Slack app from this one
  ipc.handle(
    'pacenote:macs:add-start',
    false,
    () => macs()?.startAdding() ?? false
  )
  ipc.handle('pacenote:macs:add-stop', undefined, () => macs()?.stopAdding())
  ipc.handle('pacenote:macs:add-allow', undefined, () => macs()?.allowAdding())
  ipc.handle('pacenote:macs:add-decline', undefined, () =>
    macs()?.declineAdding()
  )
  ipc.handle('pacenote:macs:add-close', undefined, () => macs()?.closeAdding())
  ipc.handle('pacenote:macs:open-privacy', undefined, () => {
    void shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork'
    )
  })
}
