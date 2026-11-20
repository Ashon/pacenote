import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

function ScrollArea({
  className,
  children,
  viewportClassName,
  viewportRef,
  scrollbarClassName,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportClassName?: string
  /** The element that scrolls, for code that scrolls it (to follow output) */
  viewportRef?: React.Ref<HTMLDivElement>
  /** Its scrollbar, kept above what floats over the content (z-10) */
  scrollbarClassName?: string
}) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        className={cn(
          'h-full w-full rounded-[inherit] [&>div]:!block',
          viewportClassName
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar className={scrollbarClassName} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

/** The one scrollbar any scroll area here has: vertical */
function ScrollBar({ className }: { className?: string }) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      orientation="vertical"
      className={cn(
        'flex h-full w-2.5 touch-none border-l border-l-transparent p-px transition-colors select-none',
        className
      )}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea }
