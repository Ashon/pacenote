import {
  CLI_NAMES,
  OWN_CLIS,
  otherCli,
  switchWords,
  type CliReadiness,
  type CliState,
  type OwnAiView,
  type OwnCli,
  type Switch,
} from '@src/tasks/own-ai'
import { SOURCES } from '@src/tasks/sources'
import { useQuery } from '@tanstack/react-query'
import {
  CircleCheck,
  CircleDashed,
  Clock,
  LoaderCircle,
  RotateCw,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatHourMinute } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The CLIs that do Pacenote's own work (Collect now, Looks done, Write it up,
 * reply drafts), as Settings > Todo shows them: whether each is here and
 * signed in, which one does the work, and one resting at its limit until it
 * resets. From the desktop app; checking runs each CLI, so it runs when asked,
 * on focus and after a change, not on an interval.
 */

export const OWN_AI_KEY = ['own-ai']

export function useOwnAi() {
  const bridge = window.pacenoteDesktop?.ai
  const query = useQuery({
    queryKey: OWN_AI_KEY,
    queryFn: async () => (await bridge?.state()) ?? null,
    enabled: Boolean(bridge),
    staleTime: 15_000,
    refetchOnMount: 'always',
  })
  // A CLI that just worked or could not changes what its line says.
  const { refetch } = query
  useEffect(
    () => window.pacenoteDesktop?.tasks.onChanged(() => void refetch()),
    [refetch]
  )
  return query
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** When a rest ends: 14:00 today, "Tue 14:00" on another day */
export function untilWords(iso: string, now = new Date()): string {
  const at = new Date(iso)
  return at.toDateString() === now.toDateString()
    ? formatHourMinute(iso)
    : `${WEEKDAYS[at.getDay()]} ${formatHourMinute(iso)}`
}

/** A switch in a line: "Claude Code was at its usage limit until 14:00" */
export function switchLine(switched: Switch, now = new Date()): string {
  return `${switchWords(switched)}${switched.until ? ` until ${untilWords(switched.until, now)}` : ''}`
}

type Tone = 'ok' | 'warn' | 'rest' | 'off'

/** One CLI's line: how it is, and what it does for your work */
export function describeCli(
  cli: OwnCli,
  view: Pick<OwnAiView, 'chosen' | 'fallback'>,
  ready: CliReadiness,
  state: CliState | undefined,
  now = new Date()
): { tone: Tone; text: string; signIn?: boolean } {
  const chosen = view.chosen === cli
  const other = CLI_NAMES[otherCli(cli)]
  if (!ready.installed) return { tone: 'off', text: 'Not on this Mac.' }
  if (ready.tooOld)
    return { tone: 'warn', text: 'Too old. Update it to use it here.' }
  if (!ready.signedIn)
    return { tone: 'warn', text: 'Signed out.', signIn: true }
  if (state?.until)
    return {
      tone: 'rest',
      text: `${state.unable === 'unavailable' ? 'Overloaded' : 'At its usage limit'} until ${untilWords(state.until, now)}.${chosen && view.fallback ? ` ${other} does the work until then.` : ''}`,
    }
  if (state?.unable === 'connector')
    return {
      tone: 'warn',
      text: `Has no Slack connector. Connect Slack in ${SOURCES.slack.connectors[cli].where}.`,
    }
  if (chosen) return { tone: 'ok', text: 'Ready. It does the work.' }
  return view.fallback
    ? { tone: 'ok', text: `Ready to take over when ${other} can't.` }
    : { tone: 'off', text: "Not used: switching when it can't is off." }
}

const ICON: Record<Tone, typeof CircleCheck> = {
  ok: CircleCheck,
  warn: TriangleAlert,
  rest: Clock,
  off: CircleDashed,
}

const TONE: Record<Tone, string> = {
  ok: 'text-status-succeeded',
  warn: 'text-status-interrupted',
  rest: 'text-status-interrupted',
  off: 'text-muted-foreground',
}

/**
 * Under the choice in Settings > Todo: each CLI with its state, the one at its
 * limit with the time it is back, and a way to sign one in again
 */
export function OwnAiStatus({
  chosen,
  fallback,
}: {
  /** As saved: the CLI chosen, and whether the other one takes over */
  chosen: OwnCli
  fallback: boolean
}) {
  const ai = useOwnAi()
  const [signing, setSigning] = useState<OwnCli>()
  const [error, setError] = useState<string>()
  const view = ai.data && { ...ai.data, chosen, fallback }
  const signIn = async (cli: OwnCli) => {
    setSigning(cli)
    setError(undefined)
    const opened = await window.pacenoteDesktop?.tasks.signIn(cli)
    setSigning(undefined)
    if (opened?.error) setError(opened.error)
  }
  return (
    <div
      data-own-ai
      className="space-y-2 border-t border-border bg-well/30 px-4 py-3"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-meta text-muted-foreground">
          Each runs with your own login on this Mac.
        </p>
        <Button
          size="xs"
          variant="ghost"
          disabled={ai.isFetching}
          onClick={() => void ai.refetch()}
        >
          <RotateCw className={cn(ai.isFetching && 'animate-spin')} />
          Check again
        </Button>
      </div>
      {!view ? (
        <p className="flex items-center gap-2 py-1 text-meta text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Checking Claude Code and Codex…
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg bg-well/60">
          {OWN_CLIS.map((cli) => {
            const line = describeCli(cli, view, view.clis[cli], view.state[cli])
            const Icon = ICON[line.tone]
            return (
              <li
                key={cli}
                data-cli={cli}
                className="flex items-start gap-2 px-3 py-2 text-meta"
              >
                <Icon
                  className={cn('mt-px size-3.5 shrink-0', TONE[line.tone])}
                />
                <span className="w-24 shrink-0 font-medium">
                  {CLI_NAMES[cli]}
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground select-text">
                  {line.text}
                </span>
                {line.signIn && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={signing !== undefined}
                    onClick={() => void signIn(cli)}
                  >
                    Sign in
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-meta text-status-failed">
          {error}
        </p>
      )}
    </div>
  )
}
