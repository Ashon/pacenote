import type { MacsView, MacView } from '@src/macs/types'
import { useEffect, useState } from 'react'

/**
 * Your Macs and where Pace answers (Settings > Macs, the status bar), from
 * the desktop app as it changes. undefined outside the app.
 */
export function useMacs(): MacsView | undefined {
  const bridge = window.pacenoteDesktop?.macs
  const [view, setView] = useState<MacsView>()
  useEffect(() => {
    if (!bridge) return
    void bridge.view().then((value) => value && setView(value))
    return bridge.onChange(setView)
  }, [bridge])
  return view
}

export const macsControl = () => window.pacenoteDesktop?.macs

/** Another of your Macs by its id, as you named it */
export const macNamed = (view: MacsView | undefined, id: string): string =>
  view?.macs.find((mac) => mac.id === id)?.name ?? 'your other Mac'

/**
 * Where Pace answers, when another of your Macs is in the picture: this Mac
 * or another, and whether it is on its way there. undefined for a Mac on its
 * own (nothing to say).
 */
export function whereAnswers(
  view: MacsView | undefined
): { here: boolean; moving: boolean; other?: MacView } | undefined {
  if (!view?.available || !view.follow) return undefined
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
