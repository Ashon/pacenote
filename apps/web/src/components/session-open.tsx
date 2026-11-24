import type { SessionRow, SessionWhere } from '@src/sessions/types'
import { CLI_NAMES } from '@src/tasks/own-ai'
import {
  AppWindow,
  ExternalLink,
  MessagesSquare,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react'
import { Pill } from '@/components/task-meta'
import { Button } from '@/components/ui/button'
import { formatRelative, formatWait } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { text } from './sessions-page.text'
import { ToolMark } from './tool-mark'

/**
 * A session on this Mac as Sessions and Todo show it: its state, where it
 * runs, the button that opens its page, and the one that takes you to where
 * it runs
 */

type Words = (typeof text)['en']

const OPEN_ICON: Record<SessionWhere, LucideIcon> = {
  'claude-app': AppWindow,
  terminal: SquareTerminal,
  web: ExternalLink,
  'codex-app': AppWindow,
  pacenote: MessagesSquare,
}

/** A session's page in Pacenote */
export const sessionHref = (id: string) =>
  `#/sessions/${encodeURIComponent(id)}`

export const openLabel = (s: SessionRow, t: Words) =>
  s.where === 'terminal' ? t.openIn.terminal(s.terminal) : t.openIn[s.where]

/** Where it runs, in a word: "Claude app", "iTerm", "claude.ai" */
export const whereName = (s: SessionRow, t: Words) =>
  s.where === 'terminal' ? (s.terminal ?? t.where.terminal) : t.where[s.where]

/** The tool and where it runs: "Claude app", "Claude Code · iTerm" */
export function toolWhere(s: SessionRow, t: Words) {
  if (s.where === 'claude-app' || s.where === 'codex-app')
    return t.where[s.where]
  return `${CLI_NAMES[s.tool]} · ${whereName(s, t)}`
}

/** Working, your turn, quiet or ended: the session's state on its row */
export function StateMark({ s, where }: { s: SessionRow; where?: boolean }) {
  const t = useText(text)
  // On a task's row, where it runs goes with it: "Your turn · Claude app"
  const said = (state: string) =>
    where ? `${state} · ${whereName(s, t)}` : state
  if (s.state === 'working')
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-status-running">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-status-running"
        />
        {said(t.working)}
      </span>
    )
  if (s.state === 'turn')
    return (
      <Pill tone="primary" className="gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
        {/* What it asks, in place of your turn */}
        {s.asks ? t.asks[s.asks] : said(t.yourTurn)}
        {where && ` ${formatRelative(s.lastAt)}`}
      </Pill>
    )
  return (
    <Pill>
      {s.state === 'ended'
        ? t.ended
        : said(t.quiet(formatWait(Date.now() - Date.parse(s.lastAt))))}
    </Pill>
  )
}

/**
 * Opens the session's page, to follow it and type to it (V1), with its
 * tool's mark
 */
export function OpenButton({ s, size }: { s: SessionRow; size?: 'sm' }) {
  const t = useText(text)
  return (
    <Button variant="outline" size={size} asChild>
      <a href={sessionHref(s.id)}>
        <ToolMark tool={s.tool} fallback={MessagesSquare} />
        {t.open}
      </a>
    </Button>
  )
}

/** Takes you to where it runs: its app, claude.ai, or its terminal app */
export function ShowButton({
  s,
  onError,
  size,
}: {
  s: SessionRow
  onError: (error?: string) => void
  size?: 'sm'
}) {
  const t = useText(text)
  const Icon = OPEN_ICON[s.where]
  return (
    <Button
      variant="outline"
      size={size}
      onClick={() =>
        void window.pacenoteDesktop?.sessions
          .open(s.id)
          .then((result) => onError(result?.error))
      }
    >
      <Icon />
      {openLabel(s, t)}
    </Button>
  )
}
