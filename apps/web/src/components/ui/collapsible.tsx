import { Collapsible as CollapsiblePrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const Collapsible = CollapsiblePrimitive.Root
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

/** What a collapsible opens: it unfolds in place (reveal, motion.css) */
function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      className={cn('motion-reveal', className)}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
