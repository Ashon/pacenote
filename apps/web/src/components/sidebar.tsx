import {
  Bot,
  Bug,
  History,
  LayoutDashboard,
  ListChecks,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { useTasks } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { PacenoteMark } from './logo'

export type Section =
  'overview' | 'runs' | 'tasks' | 'you' | 'bot' | 'settings' | 'debug'

type Item = { section: Section; label: string; icon: LucideIcon }

/** The screens for watching Pace, at the top */
const ITEMS: Item[] = [
  { section: 'overview', label: 'Overview', icon: LayoutDashboard },
  // What you have to do, above the jobs Pacenote ran
  { section: 'tasks', label: 'Todo', icon: ListChecks },
  // Where you contribute, from those tasks and your sessions
  { section: 'you', label: 'You', icon: UserRound },
  { section: 'runs', label: 'Runs', icon: History },
  { section: 'bot', label: 'Pace', icon: Bot },
]
/** Setting the app up, at the bottom */
const SETTINGS: Item = {
  section: 'settings',
  label: 'Settings',
  icon: Settings,
}
/** Builds made for development only (see App), above Settings */
const DEBUG: Item = { section: 'debug', label: 'Debug', icon: Bug }

/**
 * The app's sections as a labeled list: the screens for watching Pace at the
 * top, and Settings at the bottom. (Pace's status is in the status bar.) A
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
  // Open tasks, beside Tasks
  const tasks = useTasks().data
  const openTasks = tasks?.settings.on
    ? tasks.tasks.filter((task) => task.status === 'open').length
    : 0
  const item = (props: Item) => (
    <NavItem
      key={props.section}
      {...props}
      count={props.section === 'tasks' ? openTasks : 0}
      current={active === props.section}
      compact={compact}
      onClick={() => onNavigate(props.section)}
    />
  )
  return (
    <nav
      aria-label="Sections"
      className={cn(
        'motion-layout flex shrink-0 flex-col px-3 pb-3',
        compact ? 'w-16' : 'w-56'
      )}
    >
      <div className="flex items-center gap-2.5 overflow-hidden px-[11px] pt-1 pb-5 whitespace-nowrap">
        {/* Larger than the icons below, but on their center line and taking
            their width, so "Pacenote" starts where the labels do. */}
        <PacenoteMark className="-mx-[5px] size-7 max-w-none shrink-0" />
        <span
          data-hidden={compact || undefined}
          aria-hidden={compact || undefined}
          className="motion-layout-label text-base font-semibold tracking-tight"
        >
          Pacenote
        </span>
        {window.pacenoteDesktop?.dev && (
          <span
            data-hidden={compact || undefined}
            aria-hidden={compact || undefined}
            className="motion-layout-label rounded-md bg-status-interrupted/15 px-1.5 py-px text-2xs font-semibold text-status-interrupted"
          >
            Dev
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">{ITEMS.map(item)}</div>

      <div className="mt-auto flex flex-col gap-1">
        {showDebug && item(DEBUG)}
        {item(SETTINGS)}
      </div>
    </nav>
  )
}

function NavItem({
  label,
  icon: Icon,
  count,
  current,
  compact,
  onClick,
}: Item & {
  /**
   * Shown when above zero: a tinted badge beside the label, or a solid one on
   * the icon's corner in the compact sidebar
   */
  count: number
  current: boolean
  compact: boolean
  onClick: () => void
}) {
  const name = count > 0 ? `${label} (${count})` : label
  // The label and its badge, or the badge on the icon's corner, are always
  // there and only hidden, so they can fade as the sidebar changes width.
  const labeled = { 'data-hidden': compact || undefined }
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
        <span
          {...labeled}
          aria-hidden={compact || undefined}
          className="motion-layout-label"
        >
          {label}
        </span>
        {count > 0 && (
          <span
            {...labeled}
            aria-hidden={compact || undefined}
            className="motion-layout-label ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/12 px-1.5 text-2xs font-semibold text-primary tabular-nums"
          >
            {count}
          </span>
        )}
        {count > 0 && (
          <span
            {...iconOnly}
            aria-hidden
            className={cn(
              'motion-layout-label absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold text-primary-foreground tabular-nums ring-2',
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
