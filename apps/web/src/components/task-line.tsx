import type * as React from 'react'

/**
 * One line of an opened task: what it is on the left, then the line itself
 * and its buttons at the right
 */
export function Line({
  label,
  actions,
  children,
}: {
  label: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-[30px] grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3 text-body">
      <span className="text-meta text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1">
        {children}
      </span>
      <span className="flex items-center gap-0.5">{actions}</span>
    </div>
  )
}
