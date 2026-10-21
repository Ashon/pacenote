import { Menu, type MenuItemConstructorOptions } from 'electron'
import { localized } from '../../../src/i18n/locale.js'
import { text } from './app-menu.text.js'

/**
 * The menu bar, as Electron's default menu has it but in the app's language:
 * the default spells its items in English whatever the app's language is.
 * Each item keeps its role, so the shortcuts and what macOS adds to the menus
 * stay. Built again when the language changes.
 */
export function setAppMenu(appName: string): void {
  const t = localized(text)
  const template: MenuItemConstructorOptions[] = [
    {
      role: 'appMenu',
      label: appName,
      submenu: [
        { role: 'about', label: t.about(appName) },
        { type: 'separator' },
        { role: 'services', label: t.services },
        { type: 'separator' },
        { role: 'hide', label: t.hide(appName) },
        { role: 'hideOthers', label: t.hideOthers },
        { role: 'unhide', label: t.unhide },
        { type: 'separator' },
        { role: 'quit', label: t.quit(appName) },
      ],
    },
    {
      role: 'fileMenu',
      label: t.file,
      submenu: [{ role: 'close', label: t.close }],
    },
    {
      role: 'editMenu',
      label: t.edit,
      submenu: [
        { role: 'undo', label: t.undo },
        { role: 'redo', label: t.redo },
        { type: 'separator' },
        { role: 'cut', label: t.cut },
        { role: 'copy', label: t.copy },
        { role: 'paste', label: t.paste },
        { role: 'pasteAndMatchStyle', label: t.pasteAndMatchStyle },
        { role: 'delete', label: t.delete },
        { role: 'selectAll', label: t.selectAll },
        { type: 'separator' },
        {
          label: t.speech,
          submenu: [
            { role: 'startSpeaking', label: t.startSpeaking },
            { role: 'stopSpeaking', label: t.stopSpeaking },
          ],
        },
      ],
    },
    {
      role: 'viewMenu',
      label: t.view,
      submenu: [
        { role: 'reload', label: t.reload },
        { role: 'forceReload', label: t.forceReload },
        { role: 'toggleDevTools', label: t.toggleDevTools },
        { type: 'separator' },
        { role: 'resetZoom', label: t.resetZoom },
        { role: 'zoomIn', label: t.zoomIn },
        { role: 'zoomOut', label: t.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t.toggleFullScreen },
      ],
    },
    {
      role: 'windowMenu',
      label: t.window,
      submenu: [
        { role: 'minimize', label: t.minimize },
        { role: 'zoom', label: t.zoom },
        { type: 'separator' },
        { role: 'front', label: t.front },
      ],
    },
    { role: 'help', label: t.help, submenu: [] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
