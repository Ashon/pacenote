import type * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * A screen of its own (Todo, You): its title, what it counts beside it, and
 * an action at the right
 */
export function Page({
  title,
  meta,
  action,
  children,
}: {
  title: string
  meta?: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <ScrollArea className="h-full">
      <div className="@container mx-auto max-w-4xl px-10 py-9">
        <header className="flex items-center gap-3">
          <h1 className="text-title">{title}</h1>
          {meta && (
            <span className="text-copy text-muted-foreground">{meta}</span>
          )}
          {action && (
            <>
              <span className="flex-1" />
              {action}
            </>
          )}
        </header>
        {children}
      </div>
    </ScrollArea>
  )
}
