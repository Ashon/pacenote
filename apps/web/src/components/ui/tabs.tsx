import { Tabs as TabsPrimitive } from 'radix-ui'
import type * as React from 'react'
import { useIndicator } from '@/components/ui/motion'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

/**
 * The tabs, with one pill under the selected tab that slides to the next one
 * (useIndicator).
 */
function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const pill = useIndicator({
    selected: '[role="tab"][data-state="active"]',
    items: '[role="tab"]',
    attribute: 'data-state',
  })
  return (
    <TabsPrimitive.List
      ref={pill.ref}
      className={cn(
        'relative inline-flex h-8 items-center justify-center rounded-lg bg-muted p-0.5 text-muted-foreground',
        className
      )}
      {...props}
    >
      {pill.box && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 left-0 h-7 rounded-md bg-background shadow-sm dark:bg-accent',
            pill.className
          )}
          style={{ width: pill.box.width, translate: `${pill.box.x}px 0` }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-meta font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground',
        className
      )}
      {...props}
    />
  )
}

/** A tab's content: it rises in when its tab is chosen (swap) */
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('motion-swap focus-visible:outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
