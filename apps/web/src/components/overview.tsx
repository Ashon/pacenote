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
import { remoteMac, useSupervisor } from '@/lib/desktop'
import { useSetup } from '@/lib/setup'
import { readStored, writeStored } from '@/lib/storage'
import {
  formatDuration,
  formatNumber,
  formatTokens,
  formatWait,
} from '@/lib/format'
import { useText } from '@/lib/i18n'
import { useTaskTrend } from '@/lib/tasks'
import { cn, go } from '@/lib/utils'
import { Briefing, BriefingSkeleton, lastBriefing } from './briefing'
import { text } from './overview.text'
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
  const t = useText(text)
  return (
    <div className="mt-6 flex items-center gap-4 rounded-xl bg-card-accent px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-section">{t.setUpPace}</h2>
        <p className="mt-0.5 text-copy text-muted-foreground">
          {message ?? t.missingSettings}
        </p>
      </div>
      {onGuide && (
        <Button size="sm" variant="ghost" onClick={onGuide}>
          {t.stepByStep}
        </Button>
      )}
      <Button size="sm" onClick={() => go(setupSettingsRoute(issues))}>
        <Settings />
        {t.openSettings}
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
  const t = useText(text)
  const stats = useStats()
  const supervisor = useSupervisor()
  const setup = useSetup()
  const trend = useTaskTrend()
  const remote = remoteMac()
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
  if (ready && desktop) writeStored(TASK_BAND_KEY, trend.data ? '1' : '0')

  return (
    // One surface, no cards: the figures share a row split by hairlines, and
    // each band below a divider holds two sections side by side. The row wraps
    // to two columns, and the bands to one, when the surface is narrow.
    <div className="@container mx-auto max-w-4xl px-10 py-9">
      {/* A page title like the other screens'; the brand is the sidebar's. */}
      <header>
        <h1 data-page-title className="text-title">
          {t.title}
        </h1>
        <p className="mt-1 text-copy text-muted-foreground">{t.intro}</p>
      </header>

      <Placeholder
        ready={ready}
        skeleton={
          <OverviewSkeleton
            taskBand={readStored(TASK_BAND_KEY) === '1'}
            setupCard={Number(readStored(SETUP_CARD_KEY)) || 0}
            briefing={lastBriefing()}
          />
        }
      >
        {/* Measured, so the next time it shows the skeleton holds its place */}
        <div
          ref={(element) => {
            // How tall the setup card is, with its margin (0 for none)
            if (element)
              writeStored(SETUP_CARD_KEY, String(element.offsetHeight))
          }}
          className="flow-root"
        >
          {/* Setup's steps are taken on the Mac, not on a device of yours */}
          {setupOpen && setup.view && !remote ? (
            <ResumeSetup
              view={setup.view}
              onFinish={() =>
                void setup
                  .save({ finished: true })
                  .then(() => go(setupSettingsRoute(supervisor?.issues)))
              }
            />
          ) : (
            supervisor?.phase === 'setup' && (
              <SetupCard
                message={supervisor.message}
                issues={supervisor.issues}
                onGuide={
                  setup.view && !remote
                    ? () =>
                        void setup
                          .save({ finished: false })
                          .then(() => go('#/setup'))
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
              aria-label={t.totals}
              className="mt-9 grid grid-cols-2 gap-y-8 @min-[46rem]:grid-cols-4"
            >
              <Metric
                icon={<Activity className="text-primary" />}
                label={t.totalRuns}
                value={data ? formatNumber(data.total) : '-'}
                unit={t.runsUnit(data?.total ?? 0)}
                hint={data ? t.today(formatNumber(today)) : undefined}
              />
              <Metric
                icon={<CircleCheck className="text-status-succeeded" />}
                label={t.successRate}
                value={successRate === undefined ? '-' : String(successRate)}
                unit="%"
                hint={
                  data
                    ? t.failedInterrupted(
                        data.byStatus.failed,
                        data.byStatus.interrupted
                      )
                    : undefined
                }
              />
              <Metric
                icon={<Timer className="text-primary" />}
                label={t.averageDuration}
                value={avgValue}
                unit={avgUnit}
                hint={t.averageHint}
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
                label={t.running}
                value={data ? String(running) : '-'}
                unit={t.runsUnit(running)}
                hint={running > 0 ? t.generating : t.noActive}
                accent={running > 0}
              />
            </section>

            <div className="mt-10 grid gap-10 border-t border-border pt-9 @min-[46rem]:grid-cols-2">
              <section className="flex flex-col">
                <CardHeader
                  icon={<BarChart3 className="text-primary" />}
                  label={t.last14Days}
                  meta={t.runsPerDay}
                />
                <ChartTotal
                  value={formatNumber(recentRuns)}
                  unit={t.runsUnit(recentRuns)}
                  hint={
                    recentFailed > 0 ? t.failed(recentFailed) : t.noFailures
                  }
                />
                <div className="mt-4 flex min-h-32 flex-1">
                  <DayBars
                    label={t.runsChart}
                    topClassNames={['bg-status-failed']}
                    days={daily.map((day) => ({
                      day: day.day,
                      value: day.runs,
                      tops: [day.failed],
                      hover: String(day.runs),
                      title: t.runsDay(day.day, day.runs, day.failed),
                    }))}
                  />
                </div>
              </section>

              <section>
                <CardHeader
                  icon={<Wrench className="text-primary" />}
                  label={t.topTools}
                  meta={t.calls}
                />
                {data?.topTools.length ? (
                  <ul className="mt-5 space-y-3">
                    {data.topTools.slice(0, 5).map((tool) => (
                      <BarItem
                        key={tool.name}
                        name={tool.name}
                        mono
                        count={tool.calls}
                        share={tool.calls / maxTool}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="py-8 text-copy text-muted-foreground">
                    {t.noToolCalls}
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

/** Whether the tasks band showed last time: the skeleton holds its place */
const TASK_BAND_KEY = 'pacenote.overview.task-band'

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
      <SkeletonText className="mt-3 text-number tabular-nums" width="46%" />
      <SkeletonText className="mt-1 text-meta" width="66%" />
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
          <SkeletonText className="text-number tabular-nums" width="34%" />
          <SkeletonText className="mt-1 text-meta" width="28%" />
        </div>
        <SkeletonBlock className="mt-4 min-h-32 flex-1 rounded-xl" />
      </section>
      <section>
        <CardHeader {...right} />
        <ul className="mt-5 space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className="text-meta">
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
  const t = useText(text)
  return (
    <>
      {setupCard > 0 && (
        <SkeletonBlock
          className="mt-6 rounded-xl"
          style={{ height: setupCard - 24 }}
        />
      )}
      <BriefingSkeleton lines={briefing} />
      <section className="mt-9 grid grid-cols-2 gap-y-8 @min-[46rem]:grid-cols-4">
        <MetricSkeleton
          icon={<Activity className="text-primary" />}
          label={t.totalRuns}
        />
        <MetricSkeleton
          icon={<CircleCheck className="text-status-succeeded" />}
          label={t.successRate}
        />
        <MetricSkeleton
          icon={<Timer className="text-primary" />}
          label={t.averageDuration}
        />
        <MetricSkeleton
          icon={<LoaderCircle className="text-status-running" />}
          label={t.running}
        />
      </section>
      <BandSkeleton
        left={{
          icon: <BarChart3 className="text-primary" />,
          label: t.last14Days,
          meta: t.runsPerDay,
        }}
        right={{
          icon: <Wrench className="text-primary" />,
          label: t.topTools,
          meta: t.calls,
        }}
        rows={5}
      />
      {taskBand && (
        <BandSkeleton
          left={{
            icon: <ListChecks className="text-primary" />,
            label: t.tasksHandled,
            meta: t.perDay,
          }}
          right={{
            icon: <Flag className="text-primary" />,
            label: t.howTheyEnded,
            meta: t.last14Days,
          }}
          rows={3}
        />
      )}
      <BandSkeleton
        left={{
          icon: <Coins className="text-primary" />,
          label: t.tokensPerDay,
          meta: t.newTokens,
        }}
        right={{
          icon: <Layers className="text-primary" />,
          label: t.bySource,
          meta: t.last14Days,
        }}
        rows={3}
      />
    </>
  )
}

/** How tasks ended, in the order the list shows them */
const HOW: HandledHow[] = ['tool', 'slack', 'you']

/**
 * Your tasks over the same 14 days, with Todo on: how many you handled each
 * day and how they ended. With none handled, a line says so.
 */
function TaskBand({ trend }: { trend?: TaskTrend }) {
  const t = useText(text)
  if (!trend) return null
  const handled = trend.daily.reduce((sum, day) => sum + day.handled, 0)
  if (handled === 0)
    return (
      <section className="mt-10 border-t border-border pt-9">
        <CardHeader
          icon={<ListChecks className="text-primary" />}
          label={t.tasksHandled}
        />
        <p className="mt-3 text-copy text-muted-foreground">
          {t.noneHandled(trend.open)}
        </p>
      </section>
    )
  const top = Math.max(1, ...Object.values(trend.how))
  return (
    <div className="mt-10 grid gap-10 border-t border-border pt-9 @min-[46rem]:grid-cols-2">
      <section className="flex flex-col">
        <CardHeader
          icon={<ListChecks className="text-primary" />}
          label={t.tasksHandled}
          meta={t.perDay}
        />
        <ChartTotal
          value={formatNumber(handled)}
          unit={t.handledUnit}
          hint={trend.open ? t.stillOpen(trend.open) : t.noneOpen}
        />
        <div className="mt-4 flex min-h-32 flex-1">
          <DayBars
            label={t.tasksChart}
            topClassNames={[]}
            days={trend.daily.map((day) => ({
              day: day.day,
              value: day.handled,
              tops: [],
              hover: String(day.handled),
              title: t.tasksDay(day.day, day.handled),
            }))}
          />
        </div>
      </section>

      <section>
        <CardHeader
          icon={<Flag className="text-primary" />}
          label={t.howTheyEnded}
          meta={t.last14Days}
        />
        <ul className="mt-5 space-y-3">
          {HOW.map((how) => (
            <BarItem
              key={how}
              name={t.how[how]}
              count={trend.how[how]}
              share={trend.how[how] / top}
            />
          ))}
        </ul>
        {trend.medianMs !== undefined && (
          <div
            className="mt-3.5 flex items-center gap-2 border-t border-border pt-3 text-meta text-muted-foreground"
            title={t.medianTitle}
          >
            <span className="font-medium">{t.usuallyWithin}</span>
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
  const t = useText(text)
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
          label={t.tokensPerDay}
          meta={t.newTokens}
        />
        <ChartTotal
          value={tokens ? formatTokens(all) : '-'}
          unit={tokens ? t.newUnit : undefined}
          hint={
            cacheRead > 0
              ? t.fromCache(formatTokens(cacheRead))
              : t.noneFromCache
          }
        />
        <div className="mt-4 flex min-h-32 flex-1">
          <DayBars
            label={t.tokensChart}
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
                title: t.tokensDay(
                  day.day,
                  formatTokens(total),
                  formatTokens(fromMentions),
                  formatTokens(fromCollections),
                  formatTokens(fromRecaps),
                  formatTokens(cached)
                ),
              }
            })}
          />
        </div>
      </section>

      <section>
        <CardHeader
          icon={<Layers className="text-primary" />}
          label={t.bySource}
          meta={t.last14Days}
        />
        <ul className="mt-5 space-y-3 text-meta">
          <SourceRow
            label={t.mentions}
            className="pacenote-gradient"
            value={mentions}
            share={mentions / top}
            hint={
              runs
                ? t.mentionsHint(runs, formatTokens(mentions / runs))
                : t.noRunsWithTokens
            }
          />
          <SourceRow
            label={t.collections}
            className="bg-chart-4"
            value={collections}
            share={collections / top}
            hint={
              count
                ? [
                    t.collectionsCount(count),
                    t.each(formatTokens(collections / count)),
                    found
                      ? t.perTaskFound(formatTokens(collections / found))
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : t.noCollections
            }
          />
          <SourceRow
            label={t.recaps}
            className="bg-chart-5"
            value={recaps}
            share={recaps / top}
            hint={
              written
                ? t.recapsHint(written, formatTokens(recaps / written))
                : t.noRecaps
            }
          />
        </ul>
        <div className="mt-3.5 border-t border-border pt-3 text-meta text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full border border-input bg-well" />
            <span className="font-medium">{t.readFromCache}</span>
            <span className="ml-auto font-medium tabular-nums">
              {formatTokens(cacheRead)}
            </span>
          </div>
          <p className="mt-1.5">
            {cacheRead > 0
              ? t.reusedShare(Math.round((cacheRead / (all + cacheRead)) * 100))
              : t.reused}
          </p>
        </div>
      </section>
    </div>
  )
}

/** A row of a ranked list: its name and count, and a bar of its share */
function BarItem({
  name,
  mono,
  count,
  share,
}: {
  name: string
  /** A tool's name, in the code face */
  mono?: boolean
  count: number
  share: number
}) {
  return (
    <li className="text-meta">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={cn('truncate', mono ? 'font-mono' : 'font-medium')}>
          {name}
        </span>
        <span className="shrink-0 font-medium tabular-nums">{count}</span>
      </div>
      <LineBar share={share} className="pacenote-gradient" />
    </li>
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
      <p className="mt-1 text-meta text-muted-foreground">{hint}</p>
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
          <span className="text-caption text-muted-foreground tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
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
              'text-caption text-muted-foreground tabular-nums',
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
      {/* One line, but for a phone's narrow columns */}
      <h2 className="truncate text-section @max-[30rem]:whitespace-normal">
        {label}
      </h2>
      {meta && (
        <span className="ml-auto shrink-0 text-meta text-muted-foreground">
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
      <span className="text-number tabular-nums">{value}</span>
      {unit && <span className="text-row text-muted-foreground">{unit}</span>}
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
    <div className="min-w-0 px-6 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border @max-[46rem]:[&:nth-child(3)]:border-l-0 @max-[46rem]:[&:nth-child(3)]:pl-0 @max-[30rem]:px-4">
      <CardHeader icon={icon} label={label} />
      <div className="mt-3">
        <Value
          value={value}
          unit={value === '-' ? undefined : unit}
          accent={accent}
        />
      </div>
      {hint && (
        <p className="mt-1 truncate text-meta text-muted-foreground @max-[30rem]:whitespace-normal">
          {hint}
        </p>
      )}
    </div>
  )
}
