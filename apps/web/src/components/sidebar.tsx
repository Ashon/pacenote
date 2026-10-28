import {
  Bot,
  Bug,
  CalendarCheck,
  History,
  LayoutDashboard,
  ListChecks,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { useSupervisor } from '@/lib/desktop'
import { useText } from '@/lib/i18n'
import { stagesOf, useTasks } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { PacenoteMark } from './logo'
import { text } from './sidebar.text'

export type Section =
  'overview' | 'runs' | 'tasks' | 'recap' | 'you' | 'bot' | 'settings' | 'debug'

type Item = { section: Section; icon: LucideIcon }

/** Your work, at the top: what you have to do first */
const ITEMS: Item[] = [
  { section: 'tasks', icon: ListChecks },
  // What you did, by day, week and month: what is behind, after what is ahead
  { section: 'recap', icon: CalendarCheck },
  // Where you contribute, from those tasks and your sessions
  { section: 'you', icon: UserRound },
]
/** Pace's screens, below: gone while Pace is off (Todo alone) */
const PACE_ITEMS: Item[] = [
  { section: 'overview', icon: LayoutDashboard },
  { section: 'runs', icon: History },
  { section: 'bot', icon: Bot },
]
/** Setting the app up, at the bottom */
const SETTINGS: Item = { section: 'settings', icon: Settings }
/** Builds made for development only (see App), above Settings */
const DEBUG: Item = { section: 'debug', icon: Bug }

/**
 * The app's sections as a labeled list: your work at the top, then Pace's
 * screens unless Pace is off, and Settings at the bottom. (Pace's status is in the status bar.) A
 * compact sidebar keeps only the icons, for narrow windows. Both use the same
 * padding and only hide the labels, so the icons and the mark stay put when it
 * switches: 12px of sidebar and 11px of item put an 18px icon on the compact
 * sidebar's center line. The width changes with motion (layout): the labels
 * fade before it narrows and after it widens, and are clipped meanwhile.
 */
export function Sidebar({
  active,
  compact,
  onNavigate,
  showDebug,
}: {
  active: Section
  compact: boolean
  onNavigate: (section: Section) => void
  showDebug: boolean
}) {
  const t = useText(text)
  const paceOff = Boolean(useSupervisor()?.off)
  // Open tasks, beside Tasks: not those waiting on someone else
  const tasks = useTasks().data
  const stages = stagesOf(tasks)
  const openTasks = tasks?.settings.on
    ? tasks.tasks.filter(
        (task) => task.status === 'open' && stages[task.id]?.stage !== 'waiting'
      ).length
    : 0
  const item = (props: Item) => (
    <NavItem
      key={props.section}
      {...props}
      label={t.sections[props.section]}
      count={props.section === 'tasks' ? openTasks : 0}
      current={active === props.section}
      compact={compact}
      onClick={() => onNavigate(props.section)}
    />
  )
  return (
    <nav
      aria-label={t.nav}
      className={cn(
        'motion-layout flex shrink-0 flex-col px-3 pb-3',
        compact ? 'w-16' : 'w-56'
      )}
    >
      <div className="flex items-center gap-2.5 overflow-hidden px-[11px] pt-1 pb-5 whitespace-nowrap">
        {/* Larger than the icons below, but on their center line and taking
            their width, so "Pacenote" starts where the labels do. */}
        <PacenoteMark className="-mx-[5px] size-7 max-w-none shrink-0" />
        <span {...hidden(compact)} className="motion-layout-label text-heading">
          Pacenote
        </span>
        {window.pacenoteDesktop?.dev && (
          <span
            {...hidden(compact)}
            className="motion-layout-label rounded-md bg-status-interrupted/15 px-1.5 py-px text-caption font-semibold text-status-interrupted"
          >
            {t.dev}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">{ITEMS.map(item)}</div>
      {!paceOff && (
        <>
          <div aria-hidden="true" className="mx-3 my-2 h-px bg-border" />
          <div className="flex flex-col gap-1">{PACE_ITEMS.map(item)}</div>
        </>
      )}

      <div className="mt-auto flex flex-col gap-1">
        {showDebug && item(DEBUG)}
        {item(SETTINGS)}
      </div>
    </nav>
  )
}

/** What the compact sidebar hides: its labels, faded out and unread */
const hidden = (compact: boolean) => ({
  'data-hidden': compact || undefined,
  'aria-hidden': compact || undefined,
})

function NavItem({
  label,
  icon: Icon,
  count,
  current,
  compact,
  onClick,
}: Item & {
  label: string
  /**
   * Shown when above zero: a tinted badge beside the label, or a solid one on
   * the icon's corner in the compact sidebar
   */
  count: number
  current: boolean
  compact: boolean
  onClick: () => void
}) {
  const t = useText(text)
  const name = count > 0 ? t.withCount(label, count) : label
  // The label and its badge, or the badge on the icon's corner, are always
  // there and only hidden, so they can fade as the sidebar changes width.
  const iconOnly = { 'data-hidden': !compact || undefined }
  return (
    <Tooltip content={name} side="right" disabled={!compact}>
      <button
        type="button"
        aria-label={compact ? name : undefined}
        aria-current={current ? 'page' : undefined}
        onClick={onClick}
        className={cn(
          'relative flex h-9 items-center gap-2.5 overflow-hidden rounded-xl px-[11px] text-body whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          current
            ? 'bg-selected font-semibold text-foreground'
            : 'text-muted-foreground hover:bg-selected/50 hover:text-foreground'
        )}
      >
        <Icon
          className={cn('size-[18px] shrink-0', current && 'text-primary')}
          strokeWidth={1.75}
        />
        <span {...hidden(compact)} className="motion-layout-label">
          {label}
        </span>
        {count > 0 && (
          <span
            {...hidden(compact)}
            className="motion-layout-label ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/12 px-1.5 text-caption font-semibold text-primary tabular-nums"
          >
            {count}
          </span>
        )}
        {count > 0 && (
          <span
            {...iconOnly}
            aria-hidden
            className={cn(
              'motion-layout-label absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold text-primary-foreground tabular-nums ring-2',
              current ? 'ring-selected' : 'ring-sidebar'
            )}
          >
            {count}
          </span>
        )}
      </button>
    </Tooltip>
  )
}
