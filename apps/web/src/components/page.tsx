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
        {/* In a narrow window what it counts, then the action, go to a line
            of their own rather than squeeze beside the title */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 data-page-title className="text-title">
            {title}
          </h1>
          {meta && (
            <span className="text-copy text-muted-foreground">{meta}</span>
          )}
          {action && (
            <>
              <span className="flex-1" />
              <div className="flex items-center gap-3">{action}</div>
            </>
          )}
        </header>
        {children}
      </div>
    </ScrollArea>
  )
}
