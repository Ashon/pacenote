import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A line of text still to come: a bar in the text's own line box, so it is
 * exactly as tall as the line will be and starts where the text will. Give
 * it the text's classes (size, leading, margins) and a width. Inside a
 * Placeholder it shows, and breathes, only while the data takes its time
 * (motion.css, skeleton).
 */
export function SkeletonText({
  className,
  width = '60%',
}: {
  className?: string
  /** The bar's width: a share of the line ("60%") or pixels */
  width?: string | number
}) {
  return (
    <span
      aria-hidden
      className={cn('skeleton-text block', className)}
      style={
        {
          '--skeleton-w': typeof width === 'number' ? `${width}px` : width,
        } as React.CSSProperties
      }
    />
  )
}

/**
 * Something still to come that is not text (a chart, a badge, a switch), or
 * whose height was measured the last time it showed (style)
 */
export function SkeletonBlock({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      aria-hidden
      className={cn('skeleton-block block', className)}
      style={style}
    />
  )
}

/**
 * A word or a number still to come, inline in text that is already there (a
 * tab's count, a header's meta): it shows and breathes like a skeleton's
 * bars, after the same moment, and takes no more height than the line
 */
export function SkeletonWord({
  className,
  width = '1ch',
}: {
  className?: string
  width?: string | number
}) {
  return (
    <span
      className={cn('motion-skeleton inline-block align-top', className)}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      <SkeletonText width="100%" />
    </span>
  )
}
