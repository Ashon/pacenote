import type * as React from 'react'
import { cn } from '@/lib/utils'

/** Read or Write, beside a connection's or a server's name */
export function Access({
  write,
  children,
}: {
  write?: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2 text-caption leading-5',
        write
          ? 'bg-card text-primary ring-1 ring-primary/35 ring-inset'
          : 'bg-secondary text-secondary-foreground'
      )}
    >
      {children}
    </span>
  )
}
