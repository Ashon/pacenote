import type { TokenUsage } from '@history/usage'
import { totalTokens } from '@history/usage'
import { Fragment } from 'react'
import type * as React from 'react'
import { Tooltip } from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Parts both run details use: a figure in the facts row, and empty tabs */
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
    <div className="mt-1 truncate text-sm font-semibold tabular-nums">
      {value}
    </div>
  )
  return (
    <div className="min-w-0 px-4 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border @max-[40rem]:[&:nth-child(3)]:border-l-0 @max-[40rem]:[&:nth-child(3)]:pl-0">
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      {tip ? <Tooltip content={tip}>{shown}</Tooltip> : shown}
      {hint && (
        <div className="truncate text-2xs text-muted-foreground">{hint}</div>
      )}
    </div>
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
  const total = totalTokens(usage)
  const rows: [string, string][] = [
    ['New input', formatNumber(usage.input)],
    ['Cache read', formatNumber(usage.cacheRead)],
    ['Cache write', cacheWrite ? formatNumber(usage.cacheWrite) : '-'],
    ['Output', formatNumber(usage.output)],
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
        <span>{formatNumber(total)} in total</span>
        {total > 0 && (
          <span>{Math.round((usage.cacheRead / total) * 100)}% cached</span>
        )}
      </div>
      {usage.costUsd !== undefined && usage.costUsd > 0 && (
        <div className="mt-0.5 opacity-65">
          ${usage.costUsd.toFixed(3)} at API prices
        </div>
      )}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-16 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
