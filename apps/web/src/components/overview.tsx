import { setupSettingsRoute } from '@src/settings/fields'
import type { TokenStats } from '@history/types'
import type { HandledHow, TaskTrend } from '@src/tasks/types'
import { newTokens } from '@history/usage'
import {
  Activity,
  BarChart3,
  CircleCheck,
  Coins,
  Flag,
  Layers,
  ListChecks,
  LoaderCircle,
  Settings,
  Timer,
  Wrench,
} from 'lucide-react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { Placeholder } from '@/components/ui/motion'
import { SkeletonBlock, SkeletonText } from '@/components/ui/skeleton'
import { useStats } from '@/lib/api'
import { useSupervisor } from '@/lib/desktop'
import { useSetup } from '@/lib/setup'
import {
  formatDuration,
  formatNumber,
  formatTokens,
  formatWait,
} from '@/lib/format'
import { useTaskTrend } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { Briefing, BriefingSkeleton, lastBriefing } from './briefing'
import { ResumeSetup, SetupFacts } from './setup/resume'

/**
 * The first thing to do when the bot cannot start yet, usually connecting Slack
 * on a first run. It names what is missing and leads to Settings, where the
 * tokens are entered and checked, or back to setup's steps for someone who
 * left them for Settings and would rather be guided.
 */
function SetupCard({
  message,
  issues,
  onGuide,
}: {
  message?: string
  issues?: { key?: string }[]
  onGuide?: () => void
}) {
  return (
    <div className="mt-6 flex items-center gap-4 rounded-2xl bg-card-accent px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">Set up Pace</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {message ?? 'Some settings are missing before Pace can start.'}
        </p>
      </div>
      {onGuide && (
        <Button size="sm" variant="ghost" onClick={onGuide}>
          Set up step by step
        </Button>
      )}
      <Button
        size="sm"
        onClick={() => (window.location.hash = setupSettingsRoute(issues))}
      >
        <Settings />
        Open Settings
      </Button>
    </div>
  )
}

/**
 * "32.9s" -> ["32.9", "s"]. If the number and unit cannot be split, the whole
 * text goes in the number slot. ("1m 5s")
 */
function splitUnit(text: string): [string, string] {
  const match = /^([\d.,]+)\s*([^\d\s]+)$/.exec(text)
  return match ? [match[1]!, match[2]!] : [text, '']
}

export function Overview() {
  const stats = useStats()
  const supervisor = useSupervisor()
  const setup = useSetup()
  const trend = useTaskTrend()
  const setupOpen = setup.view?.open === true
  const data = stats.data
  const finished = data
    ? data.byStatus.succeeded + data.byStatus.failed + data.byStatus.interrupted
    : 0
  const successRate =
    data && finished > 0
      ? Math.round((data.byStatus.succeeded / finished) * 100)
      : undefined
  const daily = data?.daily ?? []
  const recentRuns = daily.reduce((sum, d) => sum + d.runs, 0)
  const recentFailed = daily.reduce((sum, d) => sum + d.failed, 0)
  const today = daily.at(-1)?.runs ?? 0
  const maxTool = Math.max(1, ...(data?.topTools.map((t) => t.calls) ?? [1]))
  const [avgValue, avgUnit] = splitUnit(formatDuration(data?.avgDurationMs))
  const running = data?.byStatus.running ?? 0
  // Everything below the title comes at once, when the figures and whether
  // setup is done are both known: a setup card that came later would push
  // the page down.
  const desktop = Boolean(window.pacenoteDesktop)
  const ready =
    Boolean(data) &&
    (!desktop ||
      (setup.view !== undefined && supervisor !== undefined && trend.isFetched))
  if (ready && desktop) rememberTaskBand(Boolean(trend.data))

  return (
    // One surface, no cards: the figures share a row split by hairlines, and
    // each band below a divider holds two sections side by side. The row wraps
    // to two columns, and the bands to one, when the surface is narrow.
    <div className="@container mx-auto max-w-4xl px-10 py-9">
      {/* A page title like the other screens'; the brand is the sidebar's. */}
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How Pace has answered your Slack mentions and how your tasks went: how
          many, how well, with which tools, and with how many tokens.
        </p>
      </header>

      <Placeholder
        ready={ready}
        skeleton={
          <OverviewSkeleton
            taskBand={lastTaskBand()}
            setupCard={lastSetupCard()}
            briefing={lastBriefing()}
          />
        }
      >
        {/* Measured, so the next time it shows the skeleton holds its place */}
        <div
          ref={(element) => {
            // How tall the setup card is, with its margin (0 for none)
            if (element) rememberSetupCard(element.offsetHeight)
          }}
          className="flow-root"
        >
          {setupOpen && setup.view ? (
            <ResumeSetup
              view={setup.view}
              onFinish={() =>
                void setup.save({ finished: true }).then(() => {
                  window.location.hash = setupSettingsRoute(supervisor?.issues)
                })
              }
            />
          ) : (
            supervisor?.phase === 'setup' && (
              <SetupCard
                message={supervisor.message}
                issues={supervisor.issues}
                onGuide={
                  setup.view
                    ? () =>
                        void setup.save({ finished: false }).then(() => {
                          window.location.hash = '#/setup'
                        })
                    : undefined
                }
              />
            )
          )}
        </div>

        {setupOpen && !data?.total ? (
          <SetupFacts />
        ) : (
          <>
            <Briefing open={trend.data?.open} />
            <section
              aria-label="Totals"
              className="mt-9 grid grid-cols-2 gap-y-8 @min-[46rem]:grid-cols-4"
            >
              <Metric
                icon={<Activity className="text-primary" />}
                label="Total runs"
                value={data ? formatNumber(data.total) : '-'}
                unit={data?.total === 1 ? 'run' : 'runs'}
                hint={data ? `${formatNumber(today)} today` : undefined}
              />
              <Metric
                icon={<CircleCheck className="text-status-succeeded" />}
                label="Success rate"
                value={successRate === undefined ? '-' : String(successRate)}
                unit="%"
                hint={
                  data
                    ? `${data.byStatus.failed} failed / ${data.byStatus.interrupted} interrupted`
                    : undefined
                }
              />
              <Metric
                icon={<Timer className="text-chart-1" />}
                label="Average duration"
                value={avgValue}
                unit={avgUnit}
                hint="Time to finish one request"
              />
              <Metric
                icon={
                  <LoaderCircle
                    className={cn(
                      'text-status-running',
                      running > 0 && 'animate-spin'
                    )}
                  />
                }
                label="Running"
                value={data ? String(running) : '-'}
                unit={running === 1 ? 'run' : 'runs'}
                hint={
                  running > 0 ? 'Generating replies now' : 'No active requests'
                }
                accent={running > 0}
              />
            </section>

            <div className="mt-10 grid gap-10 border-t border-border pt-9 @min-[46rem]:grid-cols-2">
              <section className="flex flex-col">
                <CardHeader
                  icon={<BarChart3 className="text-primary" />}
                  label="Last 14 days"
                  meta="Runs per day"
                />
                <ChartTotal
                  value={formatNumber(recentRuns)}
                  unit={recentRuns === 1 ? 'run' : 'runs'}
                  hint={
                    recentFailed > 0 ? `${recentFailed} failed` : 'No failures'
                  }
                />
                <div className="mt-4 flex min-h-32 flex-1">
                  <DayBars
                    label="Runs per day for the last 14 days, failures at the top"
                    topClassNames={['bg-status-failed']}
                    days={daily.map((day) => ({
                      day: day.day,
                      value: day.runs,
                      tops: [day.failed],
                      hover: String(day.runs),
                      title: `${day.day}: ${day.runs} ${day.runs === 1 ? 'run' : 'runs'}${day.failed ? `, ${day.failed} failed` : ''}`,
                    }))}
                  />
                </div>
              </section>

              <section>
                <CardHeader
                  icon={<Wrench className="text-chart-1" />}
                  label="Top tools"
                  meta="Calls"
                />
                {data?.topTools.length ? (
                  <ul className="mt-5 space-y-3">
                    {data.topTools.slice(0, 5).map((tool) => (
                      <li key={tool.name} className="text-xs">
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                          <span className="truncate font-mono">
                            {tool.name}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">
                            {tool.calls}
                          </span>
                        </div>
                        <LineBar
                          share={tool.calls / maxTool}
                          className="pacenote-gradient"
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-8 text-sm text-muted-foreground">
                    No tool calls recorded.
                  </p>
                )}
              </section>
            </div>

            <TaskBand trend={trend.data ?? undefined} />

            <TokenBand tokens={data?.tokens} />
          </>
        )}
      </Placeholder>
    </div>
  )
}

/** How tall the setup card was last time, with its margin; 0 for none */
const SETUP_CARD_KEY = 'pacenote.overview.setup-card'

function lastSetupCard(): number {
  try {
    return Number(localStorage.getItem(SETUP_CARD_KEY)) || 0
  } catch {
    return 0
  }
}

function rememberSetupCard(height: number) {
  try {
    localStorage.setItem(SETUP_CARD_KEY, String(height))
  } catch {
    // Without storage the skeleton leaves the setup card out.
  }
}

/** Whether the tasks band showed last time: the skeleton holds its place */
const TASK_BAND_KEY = 'pacenote.overview.task-band'

function lastTaskBand(): boolean {
  try {
    return localStorage.getItem(TASK_BAND_KEY) === '1'
  } catch {
    return false
  }
}

function rememberTaskBand(shown: boolean) {
  try {
    localStorage.setItem(TASK_BAND_KEY, shown ? '1' : '0')
  } catch {
    // Without storage the skeleton leaves the tasks band out.
  }
}

/** A figure's place: its label as it is, its number and line as bars */
function MetricSkeleton({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <div className="min-w-0 px-6 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border @max-[46rem]:[&:nth-child(3)]:border-l-0 @max-[46rem]:[&:nth-child(3)]:pl-0">
      <CardHeader icon={icon} label={label} />
      <SkeletonText
        className="mt-3 text-3xl font-semibold tracking-tight"
        width="46%"
      />
      <SkeletonText className="mt-1 text-xs" width="66%" />
    </div>
  )
}

/**
 * A band's place: on the left its total and its 14 days, on the right its
 * list, the left as tall as it will be (it sets the band's height)
 */
function BandSkeleton({
  left,
  right,
  rows,
}: {
  left: { icon: React.ReactNode; label: string; meta: string }
  right: { icon: React.ReactNode; label: string; meta: string }
  rows: number
}) {
  return (
    <div className="mt-10 grid gap-10 border-t border-border pt-9 @min-[46rem]:grid-cols-2">
      <section className="flex flex-col">
        <CardHeader {...left} />
        <div className="mt-5">
          <SkeletonText
            className="text-3xl font-semibold tracking-tight"
            width="34%"
          />
          <SkeletonText className="mt-1 text-xs" width="28%" />
        </div>
        <SkeletonBlock className="mt-4 min-h-32 flex-1 rounded-xl" />
      </section>
      <section>
        <CardHeader {...right} />
        <ul className="mt-5 space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className="text-xs">
              <SkeletonText className="mb-1.5" width={`${44 - i * 6}%`} />
              <SkeletonBlock className="h-1.5 rounded-full" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** The page below the title while its figures come, drawn to its measure */
function OverviewSkeleton({
  taskBand,
  setupCard,
  briefing,
}: {
  taskBand: boolean
  /** The setup card's height last time, with its 1.5rem margin */
  setupCard: number
  /** The briefing's lines last time */
  briefing: number
}) {
  return (
    <>
      {setupCard > 0 && (
        <SkeletonBlock
          className="mt-6 rounded-2xl"
          style={{ height: setupCard - 24 }}
        />
      )}
      <BriefingSkeleton lines={briefing} />
      <section className="mt-9 grid grid-cols-2 gap-y-8 @min-[46rem]:grid-cols-4">
        <MetricSkeleton
          icon={<Activity className="text-primary" />}
          label="Total runs"
        />
        <MetricSkeleton
          icon={<CircleCheck className="text-status-succeeded" />}
          label="Success rate"
        />
        <MetricSkeleton
          icon={<Timer className="text-chart-1" />}
          label="Average duration"
        />
        <MetricSkeleton
          icon={<LoaderCircle className="text-status-running" />}
          label="Running"
        />
      </section>
      <BandSkeleton
        left={{
          icon: <BarChart3 className="text-primary" />,
          label: 'Last 14 days',
          meta: 'Runs per day',
        }}
        right={{
          icon: <Wrench className="text-chart-1" />,
          label: 'Top tools',
          meta: 'Calls',
        }}
        rows={5}
      />
      {taskBand && (
        <BandSkeleton
          left={{
            icon: <ListChecks className="text-primary" />,
            label: 'Tasks handled',
            meta: 'Per day',
          }}
          right={{
            icon: <Flag className="text-chart-1" />,
            label: 'How they ended',
            meta: 'Last 14 days',
          }}
          rows={3}
        />
      )}
      <BandSkeleton
        left={{
          icon: <Coins className="text-primary" />,
          label: 'Tokens per day',
          meta: 'New tokens',
        }}
        right={{
          icon: <Layers className="text-chart-1" />,
          label: 'By source',
          meta: 'Last 14 days',
        }}
        rows={3}
      />
    </>
  )
}

const HOW: { how: HandledHow; label: string }[] = [
  { how: 'tool', label: 'In Claude Code or Codex' },
  { how: 'slack', label: 'Closed in Slack' },
  { how: 'you', label: 'Marked done' },
]

/**
 * Your tasks over the same 14 days, with Todo on: how many you handled each
 * day and how they ended. With none handled, a line says so.
 */
function TaskBand({ trend }: { trend?: TaskTrend }) {
  if (!trend) return null
  const handled = trend.daily.reduce((sum, day) => sum + day.handled, 0)
  if (handled === 0)
    return (
      <section className="mt-10 border-t border-border pt-9">
        <CardHeader
          icon={<ListChecks className="text-primary" />}
          label="Tasks handled"
        />
        <p className="mt-3 text-sm text-muted-foreground">
          None handled in the last 14 days.
          {trend.open > 0 && ` ${trend.open} still open.`}
        </p>
      </section>
    )
  const top = Math.max(1, ...Object.values(trend.how))
  return (
    <div className="mt-10 grid gap-10 border-t border-border pt-9 @min-[46rem]:grid-cols-2">
      <section className="flex flex-col">
        <CardHeader
          icon={<ListChecks className="text-primary" />}
          label="Tasks handled"
          meta="Per day"
        />
        <ChartTotal
          value={formatNumber(handled)}
          unit="handled"
          hint={trend.open ? `${trend.open} still open` : 'None open'}
        />
        <div className="mt-4 flex min-h-32 flex-1">
          <DayBars
            label="Tasks you handled per day for the last 14 days"
            topClassNames={[]}
            days={trend.daily.map((day) => ({
              day: day.day,
              value: day.handled,
              tops: [],
              hover: String(day.handled),
              title: `${day.day}: ${day.handled} handled`,
            }))}
          />
        </div>
      </section>

      <section>
        <CardHeader
          icon={<Flag className="text-chart-1" />}
          label="How they ended"
          meta="Last 14 days"
        />
        <ul className="mt-5 space-y-3">
          {HOW.map(({ how, label }) => (
            <li key={how} className="text-xs">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{label}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {trend.how[how]}
                </span>
              </div>
              <LineBar
                share={trend.how[how] / top}
                className="pacenote-gradient"
              />
            </li>
          ))}
        </ul>
        {trend.medianMs !== undefined && (
          <div
            className="mt-3.5 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"
            title="The median, from a task's message to when it was handled"
          >
            <span className="font-medium">Usually handled within</span>
            <span className="ml-auto font-medium tabular-nums">
              {formatWait(trend.medianMs)}
            </span>
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Tokens over the same 14 days, and where they went. New tokens per day stack
 * mentions at the bottom of each bar, task collections above them and recap
 * write-ups on top. Input read back from the cache is counted apart: it is
 * most of the input and costs far less.
 */
function TokenBand({ tokens }: { tokens?: TokenStats }) {
  const mentions = tokens ? newTokens(tokens.mentions.usage) : 0
  const collections = tokens ? newTokens(tokens.collections.usage) : 0
  const recaps = tokens ? newTokens(tokens.recaps.usage) : 0
  const cacheRead = tokens
    ? tokens.mentions.usage.cacheRead +
      tokens.collections.usage.cacheRead +
      tokens.recaps.usage.cacheRead
    : 0
  const all = mentions + collections + recaps
  const top = Math.max(1, mentions, collections, recaps)
  const runs = tokens?.mentions.runs ?? 0
  const count = tokens?.collections.count ?? 0
  const found = tokens?.collections.found ?? 0
  const written = tokens?.recaps.count ?? 0

  return (
    <div className="mt-10 grid gap-10 border-t border-border pt-9 @min-[46rem]:grid-cols-2">
      <section className="flex flex-col">
        <CardHeader
          icon={<Coins className="text-primary" />}
          label="Tokens per day"
          meta="New tokens"
        />
        <ChartTotal
          value={tokens ? formatTokens(all) : '-'}
          unit={tokens ? 'new' : undefined}
          hint={
            cacheRead > 0
              ? `+${formatTokens(cacheRead)} from cache`
              : 'None from cache'
          }
        />
        <div className="mt-4 flex min-h-32 flex-1">
          <DayBars
            label="New tokens per day for the last 14 days: mentions at the bottom of each bar, task collections above them, recap write-ups on top"
            topClassNames={['bg-chart-5', 'bg-chart-4']}
            days={(tokens?.daily ?? []).map((day) => {
              const fromMentions = newTokens(day.mentions)
              const fromCollections = newTokens(day.collections)
              const fromRecaps = newTokens(day.recaps)
              const total = fromMentions + fromCollections + fromRecaps
              const cached =
                day.mentions.cacheRead +
                day.collections.cacheRead +
                day.recaps.cacheRead
              return {
                day: day.day,
                value: total,
                tops: [fromRecaps, fromCollections],
                hover: formatTokens(total),
                title: `${day.day}: ${formatTokens(total)} new (mentions ${formatTokens(fromMentions)}, task collections ${formatTokens(fromCollections)}, recaps ${formatTokens(fromRecaps)}), ${formatTokens(cached)} from cache`,
              }
            })}
          />
        </div>
      </section>

      <section>
        <CardHeader
          icon={<Layers className="text-chart-1" />}
          label="By source"
          meta="Last 14 days"
        />
        <ul className="mt-5 space-y-3 text-xs">
          <SourceRow
            label="Mentions"
            className="pacenote-gradient"
            value={mentions}
            share={mentions / top}
            hint={
              runs
                ? `${runs} ${runs === 1 ? 'run' : 'runs'} · ${formatTokens(mentions / runs)} per run`
                : 'No runs with tokens yet'
            }
          />
          <SourceRow
            label="Task collections"
            className="bg-chart-4"
            value={collections}
            share={collections / top}
            hint={
              count
                ? [
                    `${count} ${count === 1 ? 'collection' : 'collections'}`,
                    `${formatTokens(collections / count)} each`,
                    found
                      ? `${formatTokens(collections / found)} per task found`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'None run from the app yet'
            }
          />
          <SourceRow
            label="Recaps"
            className="bg-chart-5"
            value={recaps}
            share={recaps / top}
            hint={
              written
                ? `${written} ${written === 1 ? 'write-up' : 'write-ups'} · ${formatTokens(recaps / written)} each`
                : 'None written up yet'
            }
          />
        </ul>
        <div className="mt-3.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full border border-input bg-well" />
            <span className="font-medium">Read from cache</span>
            <span className="ml-auto font-medium tabular-nums">
              {formatTokens(cacheRead)}
            </span>
          </div>
          <p className="mt-1.5">
            {cacheRead > 0
              ? `Context reused from earlier turns: ${Math.round((cacheRead / (all + cacheRead)) * 100)}% of all tokens.`
              : 'Context reused from earlier turns.'}
          </p>
        </div>
      </section>
    </div>
  )
}

/** A source in By source: its new tokens, against the largest of them */
function SourceRow({
  label,
  className,
  value,
  share,
  hint,
}: {
  label: string
  /** The source's color, as in the chart */
  className: string
  value: number
  share: number
  hint: string
}) {
  return (
    <li>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', className)} />
        <span className="font-medium">{label}</span>
        <span className="ml-auto font-medium tabular-nums">
          {formatTokens(value)}
        </span>
      </div>
      <LineBar share={share} className={className} />
      <p className="mt-1.5 text-muted-foreground">{hint}</p>
    </li>
  )
}

/**
 * A thin bar over the well, filled by share (0 to 1). A fill is never
 * narrower than it is tall, so both ends stay round.
 */
function LineBar({ share, className }: { share: number; className: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-well">
      {share > 0 && (
        <div
          className={cn('h-full min-w-1.5 rounded-full', className)}
          style={{ width: `${Math.min(1, share) * 100}%` }}
        />
      )}
    </div>
  )
}

/**
 * The total over a day chart. Above it rather than beside it, so every chart
 * spans its section and they all line up with each other and the bars beside
 * them, whatever the totals say.
 */
function ChartTotal({
  value,
  unit,
  hint,
}: {
  value: string
  unit?: string
  hint: string
}) {
  return (
    <div className="mt-5">
      <Value value={value} unit={unit} />
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

interface DayBar {
  day: string
  /** The bar's height, against the tallest day */
  value: number
  /**
   * The parts of value painted at the top, topmost first (failures; recap
   * write-ups, then task collections)
   */
  tops: number[]
  /** Shown over the bar on hover */
  hover: string
  title: string
}

/**
 * Pill-shaped bars: filled over the background (well) by value, never under
 * 12% so a small day still shows. Each part on top is a pill of its own,
 * at least as tall as the bar is wide, so every end stays round. The columns
 * share the width, so the chart never grows past its section; when they get
 * too narrow for every date, every other date (counting back from today) is
 * hidden.
 */
function DayBars({
  days,
  label,
  topClassNames,
}: {
  days: DayBar[]
  label: string
  /** The colors of the parts on top, topmost first */
  topClassNames: string[]
}) {
  const max = Math.max(1, ...days.map((day) => day.value))
  return (
    <div
      role="img"
      aria-label={label}
      className="@container/bars flex min-w-0 flex-1 items-end gap-1"
    >
      {days.map((day, index) => (
        <div
          key={day.day}
          className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
          title={day.title}
        >
          <span className="text-2xs text-muted-foreground tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
            {day.hover}
          </span>
          <div className="relative flex w-2 flex-1 flex-col justify-end overflow-hidden rounded-full bg-well">
            {day.value > 0 && (
              <div
                className="pacenote-gradient relative w-full rounded-full"
                style={{
                  height: `${Math.max(12, (day.value / max) * 100)}%`,
                }}
              >
                {/* Each part reaches down past the ones above it; the
                    topmost is painted last */}
                {day.tops
                  .map((value, index) => {
                    const above = day.tops.slice(0, index + 1)
                    return {
                      index,
                      value,
                      reach: above.reduce((sum, part) => sum + part, 0),
                      pills: above.filter((part) => part > 0).length,
                    }
                  })
                  .filter((part) => part.value > 0)
                  .reverse()
                  .map((part) => (
                    <div
                      key={part.index}
                      className={cn(
                        'absolute inset-x-0 top-0 rounded-full',
                        topClassNames[part.index]
                      )}
                      style={{
                        height: `min(100%, max(${part.pills * 0.5}rem, ${(part.reach / day.value) * 100}%))`,
                      }}
                    />
                  ))}
              </div>
            )}
          </div>
          <span
            className={cn(
              'text-2xs text-muted-foreground tabular-nums',
              (days.length - 1 - index) % 2 === 1 &&
                '@max-[16rem]/bars:invisible'
            )}
          >
            {day.day.slice(8)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Section header: colored icon and title, with secondary text such as the range
 * on the right
 */
function CardHeader({
  icon,
  label,
  meta,
}: {
  icon: React.ReactNode
  label: string
  meta?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex shrink-0 [&_svg]:size-4">{icon}</span>
      <h2 className="truncate text-sm font-semibold">{label}</h2>
      {meta && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {meta}
        </span>
      )}
    </div>
  )
}

/** Large number with a faint unit */
function Value({
  value,
  unit,
  accent,
}: {
  value: string
  unit?: string
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-1 tabular-nums',
        accent && 'text-status-running'
      )}
    >
      <span className="text-3xl font-semibold tracking-tight">{value}</span>
      {unit && (
        <span className="text-sm font-medium text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  )
}

/**
 * One figure in the totals row. Figures after the first are set off by a
 * hairline on their left, so the row reads as one band.
 */
function Metric({
  icon,
  label,
  value,
  unit,
  hint,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
  hint?: string
  accent?: boolean
}) {
  return (
    <div className="min-w-0 px-6 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border @max-[46rem]:[&:nth-child(3)]:border-l-0 @max-[46rem]:[&:nth-child(3)]:pl-0">
      <CardHeader icon={icon} label={label} />
      <div className="mt-3">
        <Value
          value={value}
          unit={value === '-' ? undefined : unit}
          accent={accent}
        />
      </div>
      {hint && (
        <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
