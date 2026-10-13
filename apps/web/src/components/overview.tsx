import { setupSettingsRoute } from '@src/settings/fields'
import type { TokenStats } from '@history/types'
import { newTokens } from '@history/usage'
import {
  Activity,
  BarChart3,
  CircleCheck,
  Coins,
  Layers,
  LoaderCircle,
  Settings,
  Timer,
  Wrench,
} from 'lucide-react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { useStats } from '@/lib/api'
import { useSupervisor } from '@/lib/desktop'
import { formatDuration, formatNumber, formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The first thing to do when the bot cannot start yet, usually connecting Slack
 * on a first run. It names what is missing and leads to Settings, where the
 * tokens are entered and checked.
 */
function SetupCard({
  message,
  issues,
}: {
  message?: string
  issues?: { key?: string }[]
}) {
  return (
    <div className="mt-6 flex items-center gap-4 rounded-2xl bg-card-accent px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">Set up Pace</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {message ?? 'Some settings are missing before Pace can start.'}
        </p>
      </div>
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

  return (
    // One surface, no cards: the figures share a row split by hairlines, and
    // each band below a divider holds two sections side by side. The row wraps
    // to two columns, and the bands to one, when the surface is narrow.
    <div className="@container mx-auto max-w-4xl px-10 py-9">
      {/* A page title like the other screens'; the brand is the sidebar's. */}
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How Pace has answered your Slack mentions and collected your tasks:
          how many, how well, with which tools, and with how many tokens.
        </p>
      </header>

      {supervisor?.phase === 'setup' && (
        <SetupCard message={supervisor.message} issues={supervisor.issues} />
      )}

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
          hint={running > 0 ? 'Generating replies now' : 'No active requests'}
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
            hint={recentFailed > 0 ? `${recentFailed} failed` : 'No failures'}
          />
          <div className="mt-4 flex min-h-32 flex-1">
            <DayBars
              label="Runs per day for the last 14 days, failures at the top"
              topClassName="bg-status-failed"
              days={daily.map((day) => ({
                day: day.day,
                value: day.runs,
                top: day.failed,
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
                    <span className="truncate font-mono">{tool.name}</span>
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

      <TokenBand tokens={data?.tokens} />
    </div>
  )
}

/**
 * Tokens over the same 14 days, and where they went. New tokens per day stack
 * mentions at the bottom of each bar and task collections on top. Input read
 * back from the cache is counted apart: it is most of the input and costs far
 * less.
 */
function TokenBand({ tokens }: { tokens?: TokenStats }) {
  const mentions = tokens ? newTokens(tokens.mentions.usage) : 0
  const collections = tokens ? newTokens(tokens.collections.usage) : 0
  const cacheRead = tokens
    ? tokens.mentions.usage.cacheRead + tokens.collections.usage.cacheRead
    : 0
  const all = mentions + collections
  const top = Math.max(1, mentions, collections)
  const runs = tokens?.mentions.runs ?? 0
  const count = tokens?.collections.count ?? 0
  const found = tokens?.collections.found ?? 0

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
            label="New tokens per day for the last 14 days: mentions at the bottom of each bar, task collections on top"
            topClassName="bg-chart-4"
            days={(tokens?.daily ?? []).map((day) => {
              const fromMentions = newTokens(day.mentions)
              const fromCollections = newTokens(day.collections)
              const total = fromMentions + fromCollections
              const cached = day.mentions.cacheRead + day.collections.cacheRead
              return {
                day: day.day,
                value: total,
                top: fromCollections,
                hover: formatTokens(total),
                title: `${day.day}: ${formatTokens(total)} new (mentions ${formatTokens(fromMentions)}, task collections ${formatTokens(fromCollections)}), ${formatTokens(cached)} from cache`,
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

/** A source in By source: its new tokens, against the larger of the two */
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
  /** The part of value painted at the top (failures, task collections) */
  top: number
  /** Shown over the bar on hover */
  hover: string
  title: string
}

/**
 * Pill-shaped bars: filled over the background (well) by value, never under
 * 12% so a small day still shows. The part on top is a pill of its own, at
 * least as tall as the bar is wide, so every end stays round. The columns share
 * the width, so the chart never grows past its section; when they get too
 * narrow for every date, every other date (counting back from today) is
 * hidden.
 */
function DayBars({
  days,
  label,
  topClassName,
}: {
  days: DayBar[]
  label: string
  /** The color of the part on top */
  topClassName: string
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
          <span className="text-[10px] text-muted-foreground tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
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
                {day.top > 0 && (
                  <div
                    className={cn(
                      'absolute inset-x-0 top-0 rounded-full',
                      topClassName
                    )}
                    style={{
                      height: `min(100%, max(0.5rem, ${(day.top / day.value) * 100}%))`,
                    }}
                  />
                )}
              </div>
            )}
          </div>
          <span
            className={cn(
              'text-[10px] text-muted-foreground tabular-nums',
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
