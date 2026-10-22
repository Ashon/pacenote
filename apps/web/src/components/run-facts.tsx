import type { HistoryRecord } from '@history/types'
import type { TokenUsage } from '@history/usage'
import { newTokens, runUsage, totalTokens } from '@history/usage'
import { Coins, Timer } from 'lucide-react'
import { Fragment } from 'react'
import type * as React from 'react'
import { Tooltip } from '@/components/ui/tooltip'
import { formatDuration, formatNumber, formatTokens } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { CodeBlock } from './code-block'
import { text } from './run-facts.text'

/**
 * Parts both run details use: figures in the facts row, empty tabs, and the
 * record as JSON
 */
export function Fact({
  icon,
  label,
  value,
  hint,
  tip,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  /** More on hover over the value */
  tip?: React.ReactNode
}) {
  const shown = (
    <div className="mt-1 truncate text-section tabular-nums">{value}</div>
  )
  return (
    <div className="min-w-0 px-4 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border @max-[40rem]:[&:nth-child(3)]:border-l-0 @max-[40rem]:[&:nth-child(3)]:pl-0">
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      {tip ? <Tooltip content={tip}>{shown}</Tooltip> : shown}
      {/* Its line keeps its place without a hint, so runs with and without
          one are as tall */}
      <div className="truncate text-caption text-muted-foreground">
        {hint || '\u00a0'}
      </div>
    </div>
  )
}

/** How long a run took, or has run so far; label names a finished one's */
export function DurationFact({
  run,
  label,
}: {
  run: HistoryRecord
  label: string
}) {
  const t = useText(text)
  const duration = run.durationMs ?? Date.now() - Date.parse(run.startedAt)
  return (
    <Fact
      icon={<Timer />}
      label={run.status === 'running' ? t.elapsed : label}
      value={formatDuration(duration)}
    />
  )
}

/** The tokens a run spent: new ones, those from the cache, all on hover */
export function TokensFact({
  run,
  cacheWrite,
}: {
  run: HistoryRecord
  /** The reasoner reports cache writes (claude does, codex does not) */
  cacheWrite: boolean
}) {
  const t = useText(text)
  const usage = runUsage(run.events)
  return (
    <Fact
      icon={<Coins />}
      label={t.tokens}
      value={usage ? t.newTokens(formatTokens(newTokens(usage))) : '-'}
      hint={
        usage?.cacheRead
          ? t.fromCache(formatTokens(usage.cacheRead))
          : undefined
      }
      tip={usage && <UsageTip usage={usage} cacheWrite={cacheWrite} />}
    />
  )
}

/**
 * A run's tokens in their four parts, with the total and the cached share.
 * The cost, when claude reported one, is at API prices: what the run would
 * cost with an API key.
 */
export function UsageTip({
  usage,
  cacheWrite,
}: {
  usage: TokenUsage
  /** The reasoner reports cache writes (claude does, codex does not) */
  cacheWrite: boolean
}) {
  const t = useText(text)
  const total = totalTokens(usage)
  const rows: [string, string][] = [
    [t.newInput, formatNumber(usage.input)],
    [t.cacheRead, formatNumber(usage.cacheRead)],
    [t.cacheWrite, cacheWrite ? formatNumber(usage.cacheWrite) : '-'],
    [t.output, formatNumber(usage.output)],
  ]
  return (
    <div className="w-48 tabular-nums">
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
        {rows.map(([name, count]) => (
          <Fragment key={name}>
            <span className={cn(count === '-' && 'opacity-65')}>{name}</span>
            <span
              className={cn(
                'text-right font-medium',
                count === '-' && 'opacity-65'
              )}
            >
              {count}
            </span>
          </Fragment>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between border-t border-background/15 pt-1.5 opacity-65">
        <span>{t.total(formatNumber(total))}</span>
        {total > 0 && (
          <span>{t.cached(Math.round((usage.cacheRead / total) * 100))}</span>
        )}
      </div>
      {usage.costUsd !== undefined && usage.costUsd > 0 && (
        <div className="mt-0.5 opacity-65">
          {t.apiPrice(usage.costUsd.toFixed(3))}
        </div>
      )}
    </div>
  )
}

/** The record as saved, made only when its tab shows */
export function RawJson({ run }: { run: HistoryRecord }) {
  return (
    <CodeBlock code={JSON.stringify(run, null, 2)} maxHeight="max-h-[70vh]" />
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-16 text-center text-copy text-muted-foreground">
      {children}
    </p>
  )
}
