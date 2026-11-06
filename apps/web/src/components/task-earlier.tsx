import { CLI_NAMES } from '@src/tasks/own-ai'
import type { MacsView } from '@src/macs/types'
import type { WorkTool } from '@src/tasks/types'
import { SquareTerminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { formatRelative, formatShortDay } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { macNamed } from '@/lib/macs'
import { taskHash } from '@/lib/tasks'
import { Line } from './task-line'
import type { Earlier } from './task-open-state'
import { text } from './task-row.text'
import { foundHint, resumesInApp, type Session } from './task-sessions'

/**
 * An earlier task, Pace's run or one of your sessions, on one line: its name
 * opens what is behind it (the run, the session's log), and a session can be
 * continued
 */
export function EarlierLine({
  line,
  taskId,
  macs,
  onResume,
  onStartHere,
}: {
  line: Earlier
  taskId: string
  macs: MacsView | undefined
  onResume: (entryId: string) => void
  onStartHere?: (tool: WorkTool) => void
}) {
  const t = useText(text)
  const { task, run } = line
  const session = line.session ?? task?.session
  // A session on another of your Macs continues there; its log is there too
  const elsewhere = session?.mac ? macNamed(macs, session.mac) : undefined
  const log =
    session?.session && !elsewhere
      ? taskHash(taskId, `/log/${encodeURIComponent(session.id)}`)
      : undefined
  // The terminal icon of the row's own Continue button: it opens there too.
  // Its name is a tooltip at its left, clear of the lines' icons above.
  const resume = !session?.session
    ? ''
    : resumesInApp(session)
      ? t.resumeInApp(Boolean(task), t.app.codex)
      : session.app
        ? t.resumeInTerminal(Boolean(task))
        : t.resumeIn(Boolean(task), CLI_NAMES[session.tool])
  const action =
    elsewhere && session ? (
      <Tooltip
        content={t.startHereTip(elsewhere, CLI_NAMES[session.tool])}
        side="left"
      >
        <Button
          size="xs"
          variant="outline"
          className="text-primary"
          onClick={() => onStartHere?.(session.tool)}
        >
          <SquareTerminal />
          {t.startHere}
        </Button>
      </Tooltip>
    ) : session?.session ? (
      <Tooltip content={resume} side="left">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={resume}
          className="text-primary"
          onClick={() => onResume(session.id)}
        >
          <SquareTerminal />
        </Button>
      </Tooltip>
    ) : line.session ? (
      <span className="text-meta text-muted-foreground">
        {line.session.app
          ? t.waitingToSend
          : t.waitingToStart(CLI_NAMES[line.session.tool])}
      </span>
    ) : undefined
  const name = (text: string, href?: string, hint?: string) =>
    href ? (
      <a
        href={href}
        title={hint}
        className="font-semibold underline-offset-2 hover:underline"
      >
        {text}
      </a>
    ) : (
      <span className="font-semibold">{text}</span>
    )
  const quiet = (text: string, hint?: string) => (
    <span title={hint} className="text-meta text-muted-foreground">
      {text}
    </span>
  )

  if (run)
    return (
      <Line label={line.label}>
        {name(
          run.request || t.aMention,
          `#/runs/${encodeURIComponent(run.id)}`,
          t.openRun
        )}
        {quiet(`Pace · ${formatShortDay(run.at)}`)}
      </Line>
    )
  if (task)
    return (
      <Line label={line.label} actions={action}>
        {name(task.title, log, t.readItsSession)}
        {/* How it ended, from its thread, on hover */}
        {quiet(
          [task.outcome, formatShortDay(task.postedAt)]
            .filter(Boolean)
            .join(' · '),
          task.wrapUp
        )}
      </Line>
    )
  if (!line.session) return null
  const own = line.session as Session
  return (
    <Line label={line.label} actions={action}>
      {name(t.toolSession(CLI_NAMES[own.tool]), log, t.readSession)}
      {quiet(
        [
          elsewhere && t.onMac(elsewhere),
          own.app && t.inApp(t.app[own.tool]),
          own.branch,
          own.lastActiveAt
            ? t.lastActive(formatRelative(own.lastActiveAt))
            : t.started(formatRelative(own.startedAt)),
        ]
          .filter(Boolean)
          .join(' · '),
        foundHint(own)
      )}
    </Line>
  )
}
