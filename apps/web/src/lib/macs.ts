import { localized } from '@src/i18n/locale'
import type { MacsView, MacView } from '@src/macs/types'
import { desktopValue, useDesktopValue } from './desktop'
import { text } from './macs.text'

const macs = desktopValue(() => {
  const bridge = window.pacenoteDesktop?.macs
  return bridge && { read: () => bridge.view(), onChange: bridge.onChange }
})

/**
 * Your Macs and where Pace answers (Settings > Macs, the status bar), from
 * the desktop app as it changes. undefined outside the app.
 */
export function useMacs(): MacsView | undefined {
  return useDesktopValue(macs)
}

export const macsControl = () => window.pacenoteDesktop?.macs

/** 482917 as both Macs show it: 482 917 */
export const codeWords = (code: string) =>
  `${code.slice(0, 3)} ${code.slice(3)}`

/** Another of your Macs by its id, as you named it */
export const macNamed = (view: MacsView | undefined, id: string): string =>
  view?.macs.find((mac) => mac.id === id)?.name ?? localized(text).otherMac

/**
 * Where Pace answers, when another of your Macs is in the picture: this Mac
 * or another, and whether it is on its way there. undefined for a Mac on its
 * own, or Macs that only keep Todo the same (nothing to say).
 */
export function whereAnswers(
  view: MacsView | undefined
): { here: boolean; moving: boolean; other?: MacView } | undefined {
  if (!view?.paceFollows || !view.follow) return undefined
  const [me, ...others] = view.macs
  if (!me || others.length === 0) return undefined
  const holder = view.macs.find((mac) => mac.id === view.holder)
  if (!holder) return { here: true, moving: false }
  return {
    here: holder.here,
    moving: me.status === 'moving' || holder.status === 'moving',
    ...(holder.here ? {} : { other: holder }),
  }
}
