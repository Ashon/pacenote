import { Dialog as DialogPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTitle = DialogPrimitive.Title
const DialogDescription = DialogPrimitive.Description
const DialogClose = DialogPrimitive.Close

const VARIANT = {
  // A question over the window: it lifts in and sinks back out (dialog)
  center: {
    overlay: 'motion-dialog-overlay bg-foreground/25',
    content:
      'motion-dialog top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[20px]',
  },
  // A panel over the window's right side: it slides in (sheet)
  sheet: {
    overlay: 'motion-sheet-overlay bg-foreground/15',
    content: 'motion-sheet inset-y-2 right-2 overflow-hidden rounded-[18px]',
  },
}

/**
 * A dialog's layer and its backdrop. Keep the Dialog mounted and drive its
 * `open`, so it can leave with motion; what it shows can live in a component
 * inside, which mounts while it is open.
 */
function DialogContent({
  variant = 'center',
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  variant?: keyof typeof VARIANT
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn('fixed inset-0 z-50', VARIANT[variant].overlay)}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col bg-card shadow-float outline-none',
          VARIANT[variant].content,
          className
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  )
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle }
