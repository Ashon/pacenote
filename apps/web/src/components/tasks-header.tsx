import { newTokens } from '@history/usage'
import { localized } from '@src/i18n/locale'
import type { MacsView } from '@src/macs/types'
import { CLI_NAMES, type OwnCli } from '@src/tasks/own-ai'
import type { TasksCollect, TasksLive } from '@src/tasks/types'
import {
  ArrowRightLeft,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  SquareTerminal,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Swap } from '@/components/ui/motion'
import { openAiSheet } from '@/lib/ai-sheet'
import { formatTokens } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { macNamed } from '@/lib/macs'
import { isMac } from '@/lib/platform'
import { useCollect } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { switchLine } from './own-ai-status'
import { PaceSpinner } from './pace-spinner'
import { closedBy } from './task-row'
import { text } from './tasks-page.text'

/**
 * Todo's header (tasks-page.tsx): New task and Collect now beside the title,
 * and the line under it, of a collection or of what an AI tool is doing.
 */

/** New task, beside Collect now: opens (and closes) the form, as Cmd-N does */
export function NewTaskButton({
  pressed = false,
  onClick,
}: {
  pressed?: boolean
  onClick?: () => void
}) {
  const t = useText(text)
  return (
    <Button
      size="sm"
      variant="outline"
      aria-pressed={pressed}
      aria-keyshortcuts={isMac ? 'Meta+N' : 'Control+N'}
      onClick={onClick}
    >
      <Plus />
      {t.newTask}
    </Button>
  )
}

/**
 * Collect now, or Stop while a collection runs. While another of your Macs
 * collects, it waits for that one.
 */
export function CollectButton({
  running,
  elsewhere,
  noAi = false,
}: {
  running: boolean
  /** Another of your Macs collecting now */
  elsewhere?: string
  /** No AI set up yet: it opens Let your AI help instead */
  noAi?: boolean
}) {
  const t = useText(text)
  const { collect, stop } = useCollect()
  if (noAi && !running && !elsewhere)
    return (
      <Button size="sm" variant="outline" onClick={() => openAiSheet()}>
        <Sparkles />
        {t.findWithAi}
      </Button>
    )
  if (elsewhere && !running)
    return (
      <Button size="sm" variant="secondary" disabled>
        <LoaderCircle className="animate-spin" />
        {t.collectingOn(elsewhere)}
      </Button>
    )
  if (running)
    return (
      <div className="flex items-center gap-1">
        {/* The status line under the title shows Pace at work. */}
        <Button size="sm" variant="secondary" disabled>
          {t.collecting}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void stop()}>
          {t.stop}
        </Button>
      </div>
    )
  return (
    <Button size="sm" onClick={() => void collect()}>
      <RefreshCw />
      {t.collectNow}
    </Button>
  )
}

/** What an AI tool is doing with your tasks, or just did, in a sentence */
function liveLine(
  live: TasksLive | null | undefined,
  titleOf: (id: string) => string | undefined
): { key: string; text: string; active: boolean } | undefined {
  if (!live) return undefined
  const t = localized(text)
  if (live.collecting) {
    const { by, since, added } = live.collecting
    return {
      key: `collect:${since}`,
      active: true,
      text: t.liveCollecting(closedBy(by) ?? t.anAiTool, added),
    }
  }
  const event = live.latest
  if (!event) return undefined
  const title = event.task ? titleOf(event.task) : undefined
  const tool = closedBy(event.by) ?? t.anAiTool
  const line =
    event.kind === 'look'
      ? t.liveLook(tool, title)
      : event.kind === 'update'
        ? t.liveUpdate(tool, title)
        : event.kind === 'close'
          ? t.liveClose(tool, title)
          : event.kind === 'wrap-up'
            ? t.liveWrapUp(tool, title)
            : event.kind === 'follow-up'
              ? t.liveFollowUp(tool, title)
              : event.kind === 'add' && event.finished !== false
                ? event.added
                  ? t.liveAdded(tool, event.added)
                  : t.liveNothing(tool)
                : undefined
  if (!line) return undefined
  return {
    key: `${event.kind}:${event.task ?? ''}:${event.at}`,
    active: event.kind === 'look',
    text: line,
  }
}

/**
 * The line under the title: a collection the app runs, or what an AI tool is
 * doing with your tasks over MCP as it does it, or how the app's last
 * collection ended. Each line gives way to the next (swap).
 */
export function StatusLine({
  collect,
  macs,
  live,
  titleOf,
}: {
  collect: TasksCollect
  macs: MacsView | undefined
  live: TasksLive | null | undefined
  titleOf: (id: string) => string | undefined
}) {
  const line = collect.running ? undefined : liveLine(live, titleOf)
  return (
    <Swap id={collect.running ? 'collect' : (line?.key ?? 'last')}>
      {line ? (
        <p className="mt-1 flex items-center gap-2 text-copy text-muted-foreground">
          {/* In the spinner's place: the tool at work, or done */}
          <span className="flex size-6 shrink-0 items-center justify-center">
            {line.active ? (
              <span className="size-1.5 animate-pulse-dot rounded-full bg-status-running" />
            ) : (
              <SquareTerminal aria-hidden="true" className="size-3.5" />
            )}
          </span>
          <span className={cn('min-w-0', line.active && 'text-shimmer')}>
            {line.text}
          </span>
        </p>
      ) : (
        <CollectStatus collect={collect} macs={macs} />
      )}
    </Swap>
  )
}

/**
 * What the running collection is doing, or how the last one ended, and which
 * AI did it when the one chosen could not. Signed out, it offers that CLI's
 * sign-in in your terminal. When the work goes to the other AI mid-run, only
 * the words swap: Pace's mark keeps looking.
 */
function CollectStatus({
  collect,
  macs,
}: {
  collect: TasksCollect
  macs: MacsView | undefined
}) {
  const t = useText(text)
  const { running, last, elsewhere } = collect
  // Why the terminal did not open, for the collection it was opened for
  const [signIn, setSignIn] = useState<{ at: string; error: string }>()
  const name = (cli: OwnCli | undefined) => (cli ? CLI_NAMES[cli] : t.yourAi)
  let status: string | undefined
  let spent: string | undefined
  if (running)
    status = running.reads
      ? t.reading(name(running.by), running.reads)
      : t.starting(name(running.by))
  else if (elsewhere) status = t.elsewhere(elsewhere.name)
  else if (last?.ok) {
    status = t.collected(
      last.added,
      last.maybe,
      last.mac && macNamed(macs, last.mac),
      last.skipped
    )
    if (last.usage)
      spent = t.spent(
        formatTokens(newTokens(last.usage)),
        last.reads ?? 0,
        last.by && CLI_NAMES[last.by]
      )
  }
  if (!status && !last) return null
  const switched = running ? running.switched : last?.switched
  // Who to sign in again: the CLI that ran, or the one it took over from
  const signOut: OwnCli | undefined = running
    ? undefined
    : last && !last.ok && last.signedOut
      ? last.by
      : last?.switched?.unable === 'auth'
        ? last.switched.from
        : undefined
  // Pace's mark looks around while a collection runs and eases into the logo
  // beside its result.
  return (
    <div data-collect-status>
      <div
        className={cn(
          'mt-1 flex items-center gap-2 text-copy',
          last && !last.ok && !running
            ? 'text-status-interrupted'
            : 'text-muted-foreground'
        )}
      >
        <PaceSpinner
          active={Boolean(running || elsewhere)}
          className="size-6"
        />
        <Swap
          id={running ? `run:${running.by ?? ''}` : 'last'}
          className={cn('min-w-0', running && 'text-shimmer')}
        >
          {status ??
            (last && !last.ok
              ? signIn?.at === last.at
                ? signIn.error
                : last.error
              : null)}
          {spent && <span className="text-foreground/80"> {spent}</span>}
        </Swap>
        {signOut && last && (
          <Button
            size="xs"
            variant="outline"
            className="text-foreground"
            onClick={async () => {
              const opened = await window.pacenoteDesktop?.tasks.signIn(signOut)
              if (opened?.error) setSignIn({ at: last.at, error: opened.error })
            }}
          >
            <SquareTerminal aria-hidden="true" />
            {t.signIn(CLI_NAMES[signOut])}
          </Button>
        )}
      </div>
      {switched && (
        <Swap id={`switch:${switched.from}:${running ? 'run' : 'last'}`}>
          <p
            data-switch
            className="flex items-center gap-2 pl-8 text-meta text-muted-foreground"
          >
            <ArrowRightLeft aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0">
              {running
                ? t.tookOver(switchLine(switched), name(running.by))
                : last?.ok
                  ? t.collectedInstead(switchLine(switched), name(last.by))
                  : t.couldNotEither(switchLine(switched), name(last?.by))}
            </span>
          </p>
        </Swap>
      )}
    </div>
  )
}
