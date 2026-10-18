import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { useState } from 'react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider

/**
 * A tooltip that slides out of what it describes (pop). `disabled` keeps it
 * from opening while leaving the trigger in place, so a trigger that only
 * sometimes needs one (an icon without its label) is not remounted.
 */
function Tooltip({
  content,
  children,
  side = 'top',
  disabled = false,
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <TooltipPrimitive.Root open={open && !disabled} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'motion-pop z-50 max-w-xs rounded-md bg-foreground px-2 py-1 text-meta text-background shadow-float'
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip, TooltipProvider }
