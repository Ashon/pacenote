import {
  CLI_NAMES,
  cliOrder,
  OWN_CLIS,
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
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { getLocale, LOCALE_TAGS, localized } from '@src/i18n/locale'
import { text } from './own-ai-status.text'

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

/** When a rest ends: 14:00 today, "Tue 14:00" (화요일 14:00) on another day */
export function untilWords(iso: string, now = new Date()): string {
  const at = new Date(iso)
  if (at.toDateString() === now.toDateString()) return formatHourMinute(iso)
  const weekday = new Intl.DateTimeFormat(LOCALE_TAGS[getLocale()], {
    weekday: getLocale() === 'ko' ? 'long' : 'short',
  }).format(at)
  return `${weekday} ${formatHourMinute(iso)}`
}

/** A switch in a line: "Claude Code was at its usage limit until 14:00" */
export function switchLine(switched: Switch, now = new Date()): string {
  return localized(text).switched(
    CLI_NAMES[switched.from],
    switched.unable,
    switched.until && untilWords(switched.until, now)
  )
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
  const t = localized(text)
  const chosen = view.chosen === cli
  // Who does the work while this one cannot: the first that may take over
  const next = cliOrder(view.chosen, view.fallback, {}).find((c) => c !== cli)
  if (!ready.installed) return { tone: 'off', text: t.notHere }
  if (ready.tooOld) return { tone: 'warn', text: t.tooOld }
  if (!ready.signedIn) return { tone: 'warn', text: t.signedOut, signIn: true }
  if (state?.until)
    return {
      tone: 'rest',
      text: t.resting(
        state.unable === 'unavailable',
        untilWords(state.until, now),
        chosen && next ? CLI_NAMES[next] : undefined
      ),
    }
  if (cli === 'opencode') {
    if (!chosen) return { tone: 'off', text: t.onlyWhenChosen }
    return {
      tone: 'ok',
      text: next ? t.opencodeReady(CLI_NAMES[next]) : t.opencodeAlone,
    }
  }
  if (state?.unable === 'connector')
    return {
      tone: 'warn',
      text: t.noConnector(SOURCES.slack.connectors[cli].where),
    }
  if (chosen) return { tone: 'ok', text: t.doesTheWork }
  return view.fallback
    ? { tone: 'ok', text: t.takesOver(CLI_NAMES[view.chosen]) }
    : { tone: 'off', text: t.notUsed }
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
  const t = useText(text)
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
        <p className="flex-1 text-meta text-muted-foreground">{t.intro}</p>
        <Button
          size="xs"
          variant="ghost"
          disabled={ai.isFetching}
          onClick={() => void ai.refetch()}
        >
          <RotateCw className={cn(ai.isFetching && 'animate-spin')} />
          {t.checkAgain}
        </Button>
      </div>
      {!view ? (
        <p className="flex items-center gap-2 py-1 text-meta text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          {t.checking}
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
                    {t.signIn}
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
