import type { HubTeam, HubUser } from '@src/hub/protocol'
import { useEffect, useRef, useState } from 'react'

export type PairState =
  | { step: 'idle'; note?: string }
  | { step: 'starting' }
  | { step: 'waiting'; code: string }
  | { step: 'bound'; user: HubUser }
  | { step: 'confirming'; user: HubUser }
  /** afterCode: it went wrong after a code was given, so a new one is next */
  | { step: 'error'; message: string; afterCode?: boolean }

/**
 * Pairs this desktop with the team hub (Settings and setup): get a code, wait
 * for "@Pace connect <code>" in Slack, then confirm the Slack member who sent
 * it. Leaving cancels a pairing that was not confirmed, and a code that comes
 * after its pairing was cancelled is let go.
 */
export function useHubPairing({
  pollMs,
  expired,
  confirmWith,
  onPaired,
}: {
  /** How often to ask the hub whether the code was sent */
  pollMs: number
  /** What to say when the code expired */
  expired: string
  /** pairConfirm's options: start: false leaves Pace stopped */
  confirmWith?: { start?: boolean }
  onPaired: (paired: { user: HubUser; team: HubTeam; started: boolean }) => void
}) {
  const hub = window.pacenoteDesktop?.hub
  const [state, setState] = useState<PairState>({ step: 'idle' })
  /** The pairing asked for last: one cancelled meanwhile is let go */
  const attempt = useRef(0)

  useEffect(() => {
    if (state.step !== 'waiting' || !hub) return
    const timer = setInterval(() => {
      void hub.pairStatus().then((res) => {
        if ('error' in res)
          setState({ step: 'error', message: res.error, afterCode: true })
        else if (res.status === 'bound')
          setState({ step: 'bound', user: res.user })
        else if (res.status === 'expired')
          setState({ step: 'error', message: expired, afterCode: true })
      })
    }, pollMs)
    return () => clearInterval(timer)
  }, [state.step, hub, pollMs, expired])
  // Leaving cancels a pairing that was not confirmed.
  useEffect(() => () => void hub?.pairCancel(), [hub])

  const start = (hubUrl: string) => {
    const id = ++attempt.current
    setState({ step: 'starting' })
    void hub?.pairStart(hubUrl).then((res) => {
      if (attempt.current !== id) {
        if (!('error' in res)) void hub.pairCancel()
        return
      }
      setState(
        'error' in res
          ? { step: 'error', message: res.error }
          : { step: 'waiting', code: res.code }
      )
    })
  }
  const cancel = (note?: string) => {
    attempt.current += 1
    void hub?.pairCancel()
    setState({ step: 'idle', note })
  }
  const confirm = (user: HubUser) => {
    setState({ step: 'confirming', user })
    void hub?.pairConfirm(confirmWith).then((res) => {
      if ('error' in res) return setState({ step: 'error', message: res.error })
      if (res.issues.length > 0)
        return setState({
          step: 'error',
          message: res.issues.map((issue) => issue.message).join(' '),
        })
      onPaired(res)
    })
  }
  return { state, setState, start, cancel, confirm }
}
