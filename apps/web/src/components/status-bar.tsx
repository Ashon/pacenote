import type {
  BotStatusView,
  SupervisorState,
  UpdateState,
} from '@runtime/types'
import { setupSettingsRoute } from '@src/settings/fields'
import type { TasksCollect } from '@src/tasks/types'
import type { MacsView } from '@src/macs/types'
import {
  ArrowRightLeft,
  CircleArrowUp,
  Clock,
  Cpu,
  FolderOpen,
  Laptop,
  Plug,
  TriangleAlert,
} from 'lucide-react'
import type * as React from 'react'
import { Tooltip } from '@/components/ui/tooltip'
import { useBotStatus } from '@/lib/api'
import { useMacs, whereAnswers } from '@/lib/macs'
import { useSupervisor, useUpdate } from '@/lib/desktop'
import { useTasks } from '@/lib/tasks'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { SkeletonWord } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { botKnown, describeBot, TONE_CLASS } from './bot-state'
import { text } from './status-bar.text'

/**
 * The window's footer: indicators to glance at from any screen, on the chrome
 * under the sidebar and the content surface. Left: Pace (status, reasoner,
 * attached tools, check issues). Right: work in progress (a task collection,
 * requests), a button that opens the run history in Finder, and the version.
 * Narrow windows drop the less needed ones.
 */
export function StatusBar({
  onOpenRoute,
}: {
  /** Opens a route such as #/bot or #/settings/messengers */
  onOpenRoute: (route: string) => void
}) {
  const { data } = useBotStatus()
  const supervisor = useSupervisor()
  // A collection keeps running when you leave the Todo screen; this is where
  // it still shows. (the sidebar already keeps the tasks query fresh)
  const collecting = useTasks().data?.collect.running
  const update = useUpdate()
  const macs = useMacs()
  return (
    <StatusBarView
      bot={data}
      supervisor={supervisor}
      collecting={collecting}
      update={update}
      macs={macs}
      onOpenRoute={onOpenRoute}
    />
  )
}

/** The footer from what it shows, so the Debug page can show it in any state */
export function StatusBarView({
  bot: data,
  supervisor,
  collecting,
  update,
  macs,
  onOpenRoute,
  now = Date.now(),
}: {
  bot?: BotStatusView
  supervisor?: SupervisorState
  /** The task collection running, if one is */
  collecting?: TasksCollect['running']
  /** A newer Pacenote, if there is one */
  update?: UpdateState
  /** Your Macs, when another one runs Pace too */
  macs?: MacsView
  onOpenRoute: (route: string) => void
  now?: number
}) {
  const t = useText(text)
  const where = whereAnswers(macs)
  // Pace just moved here: said for a few seconds where it came from
  const moved =
    where?.here && macs?.moved && now - Date.parse(macs.moved.at) < 15_000
      ? macs.moved
      : undefined
  const { tone, label } = describeBot(data, supervisor)
  const status = data?.alive ? data.status : undefined
  const active = status?.requests.active ?? 0
  const problems = status?.problems ?? []
  // Pace's own tools come with the built-in sandbox; the bar names add-ons.
  const tools = [
    ...(status?.mcp ?? []).filter((name) => name !== 'pacenote'),
    ...(status?.diagrams ? ['diagrams'] : []),
  ]
  const setup = supervisor?.phase === 'setup'
  const openBot = () => onOpenRoute('#/bot')
  const openDataDir = window.pacenoteDesktop?.settings.openDataDir

  return (
    <footer className="@container flex h-8 shrink-0 items-center gap-1 overflow-hidden px-4 text-caption whitespace-nowrap text-muted-foreground">
      {/* When setup is needed, Pace's status goes straight to the settings
          that fix it. */}
      <Item
        tip={setup ? t.setupTip : supervisor?.off ? t.offTip : t.statusTip}
        onClick={
          setup
            ? () => onOpenRoute(setupSettingsRoute(supervisor?.issues))
            : supervisor?.off
              ? () => onOpenRoute('#/settings')
              : openBot
        }
      >
        {/* The dot pings only while Pace starts, builds or stops; connected,
            it holds still. */}
        <span className="relative flex size-2">
          {tone === 'busy' && (
            <span
              className={cn(
                'absolute inset-0 animate-ping rounded-full opacity-50',
                TONE_CLASS[tone].dot
              )}
            />
          )}
          <span
            className={cn('relative size-2 rounded-full', TONE_CLASS[tone].dot)}
          />
        </span>
        <span className={cn('font-semibold', TONE_CLASS[tone].text)}>
          {t.pace}{' '}
          {botKnown(data, supervisor) ? label : <SkeletonWord width="4rem" />}
        </span>
      </Item>
      {where && (
        <Item
          tip={t.whereTip}
          onClick={() => onOpenRoute('#/settings/macs')}
          className={cn(moved && 'text-primary')}
        >
          {moved ? <ArrowRightLeft /> : <Laptop />}
          <span data-where-answers={where.here ? 'here' : 'other'}>
            {moved
              ? t.movedHere(moved.from)
              : where.moving
                ? where.here
                  ? t.movingHere
                  : t.movingTo(where.other?.name)
                : where.here
                  ? t.answeringHere
                  : t.otherAnswers(where.other?.name)}
          </span>
        </Item>
      )}
      {status?.reasoner && (
        <Item
          tip={t.reasonerTip}
          onClick={openBot}
          className="@max-[34rem]:hidden"
        >
          <Cpu />
          {status.reasoner}
        </Item>
      )}
      {tools.length > 0 && (
        <Item tip={t.toolsTip} className="min-w-0 shrink @max-[52rem]:hidden">
          <Plug />
          <span className="truncate">{tools.join(', ')}</span>
        </Item>
      )}
      {problems.length > 0 && (
        <Item
          tip={problems.join('\n')}
          onClick={openBot}
          className="text-status-interrupted"
        >
          <TriangleAlert />
          {t.checkIssues(problems.length)}
        </Item>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {collecting && (
          <Item
            tip={
              collecting.reads
                ? t.collectingReads(collecting.reads)
                : t.collectingTip
            }
            onClick={() => onOpenRoute('#/tasks')}
            className="text-status-running"
          >
            <span className="size-1.5 animate-pulse-dot rounded-full bg-status-running" />
            {t.collecting}
          </Item>
        )}
        {active > 0 && (
          <Item
            tip={t.activeTip}
            onClick={openBot}
            className="text-status-running"
          >
            <span className="size-1.5 animate-pulse-dot rounded-full bg-status-running" />
            {t.active(active)}
          </Item>
        )}
        {status?.requests.lastAt && (
          <Item
            tip={t.handledTip(status.requests.handled)}
            className="@max-[44rem]:hidden"
          >
            <Clock />
            {t.lastRequest(formatRelative(status.requests.lastAt))}
          </Item>
        )}
        {/* Only the icon: the folder's path is in Settings > General. */}
        {openDataDir && (
          <Item
            label={t.openDataDir}
            tip={t.openDataDir}
            onClick={() => void openDataDir()}
          >
            <FolderOpen />
          </Item>
        )}
        {update?.available && update.latest && (
          <Item
            tip={t.updateTip(update.latest.version)}
            onClick={() => onOpenRoute('#/settings/general')}
            className="text-primary"
          >
            <CircleArrowUp />
            {t.update}
          </Item>
        )}
        {/* Which Pacenote this is, for upgrades and bug reports */}
        <Version />
      </div>
    </footer>
  )
}

function Item({
  tip,
  label,
  onClick,
  className,
  children,
}: {
  tip: string
  /** For an item that is only an icon */
  label?: string
  onClick?: () => void
  className?: string
  children: React.ReactNode
}) {
  const body = cn(
    'flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1.5 whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0',
    onClick && 'transition-colors hover:bg-selected/50 hover:text-foreground',
    className
  )
  return (
    <Tooltip
      content={<span className="whitespace-pre-line">{tip}</span>}
      side="top"
    >
      {onClick ? (
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={body}
        >
          {children}
        </button>
      ) : (
        <span aria-label={label} className={body}>
          {children}
        </span>
      )}
    </Tooltip>
  )
}

/**
 * The build: its version for a release, which opens its release notes, or
 * where it stands in git for any other build (pnpm desktop, a build between
 * releases)
 */
function Version() {
  const t = useText(text)
  const { version, describe } = __PACENOTE_BUILD__
  const dev = Boolean(window.pacenoteDesktop?.dev)
  if (!describe) {
    const notes = `https://github.com/Ashon/pacenote/releases/tag/v${version}`
    return (
      <Item
        tip={dev ? t.versionDev(version) : t.versionNotes(version)}
        onClick={dev ? undefined : () => window.open(notes, '_blank')}
      >
        v{version}
      </Item>
    )
  }
  // v0.3.9-3-g2034e74-dirty: 3 commits after v0.3.9, uncommitted changes
  const [, base = describe, ahead, hash, dirty] =
    /^(v.+?)(?:-(\d+)-g([0-9a-f]+))?(-dirty)?$/.exec(describe) ?? []
  return (
    <Item
      tip={t.gitBuild({ base, ahead, hash, dirty: Boolean(dirty), dev })}
      className="@max-[40rem]:hidden"
    >
      {describe}
    </Item>
  )
}
