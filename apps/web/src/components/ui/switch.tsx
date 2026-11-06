import { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'

/**
 * The id of the label a control sits beside (a settings row's), so a switch
 * or a segmented choice with no label of its own is named by it
 */
export const FieldLabel = createContext<string | undefined>(undefined)

/** An on/off setting, named by its label or the row it sits in */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  /** Its name, when no row names it */
  label?: string
  className?: string
}) {
  const labelledBy = useContext(FieldLabel)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={label ? undefined : labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
        className
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform',
          checked && 'translate-x-4'
        )}
      />
    </button>
  )
}
