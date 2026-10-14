import { Tabs as TabsPrimitive } from 'radix-ui'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

/**
 * The tabs, with one pill under the selected tab that slides to the next one
 * (indicator). It is placed from the selected tab's box, again whenever the
 * selection or a tab's width changes.
 */
function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const list = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ x: number; width: number }>()
  // The pill slides once it has been placed, not into its first place
  const [placed, setPlaced] = useState(false)
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return
    const place = () => {
      const tab = element.querySelector<HTMLElement>(
        '[role="tab"][data-state="active"]'
      )
      setPill((was) =>
        !tab
          ? undefined
          : was?.x === tab.offsetLeft && was.width === tab.offsetWidth
            ? was
            : { x: tab.offsetLeft, width: tab.offsetWidth }
      )
    }
    place()
    const selection = new MutationObserver(place)
    selection.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    })
    const sizes = new ResizeObserver(place)
    for (const tab of element.querySelectorAll('[role="tab"]'))
      sizes.observe(tab)
    return () => {
      selection.disconnect()
      sizes.disconnect()
    }
  }, [])
  useEffect(() => {
    if (!pill || placed) return
    const frame = requestAnimationFrame(() => setPlaced(true))
    return () => cancelAnimationFrame(frame)
  }, [pill, placed])
  return (
    <TabsPrimitive.List
      ref={list}
      className={cn(
        'relative inline-flex h-8 items-center justify-center rounded-lg bg-muted p-0.5 text-muted-foreground',
        className
      )}
      {...props}
    >
      {pill && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 left-0 h-7 rounded-md bg-background shadow-sm dark:bg-accent',
            placed && 'motion-indicator'
          )}
          style={{ width: pill.width, translate: `${pill.x}px 0` }}
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
        'relative inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground',
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
