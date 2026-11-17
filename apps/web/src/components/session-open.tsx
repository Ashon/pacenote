import type { SessionRow, SessionWhere } from '@src/sessions/types'
import { CLI_NAMES } from '@src/tasks/own-ai'
import {
  AppWindow,
  ExternalLink,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react'
import { Pill } from '@/components/task-meta'
import { Button } from '@/components/ui/button'
import { formatRelative, formatWait } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { text } from './sessions-page.text'

/**
 * A session on this Mac as Sessions and Todo show it: its state, where it
 * runs, and the button that takes you there
 */

type Words = (typeof text)['en']

const OPEN_ICON: Record<SessionWhere, LucideIcon> = {
  'claude-app': AppWindow,
  terminal: SquareTerminal,
  web: ExternalLink,
  'codex-app': AppWindow,
}

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
        {said(t.yourTurn)}
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

/** Takes you to where it runs: its app, claude.ai, or its terminal app */
export function OpenButton({
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
