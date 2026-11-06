import type { LucideIcon } from 'lucide-react'
import { useContext } from 'react'
import { cn } from '@/lib/utils'
import { FieldLabel } from './switch'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  /** Written in a language of its own (a language's name) */
  lang?: string
  /** Shown before its label */
  icon?: LucideIcon
}

/**
 * A few short options side by side, one of them chosen: the theme, the
 * language, a setting of two or three, a filter. Named by its label or the
 * row it sits in. stretch: the options share the width it is given.
 */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  stretch,
  className,
}: {
  label?: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  stretch?: boolean
  className?: string
}) {
  const labelledBy = useContext(FieldLabel)
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={label ? undefined : labelledBy}
      className={cn('flex rounded-lg bg-muted p-0.5', className)}
    >
      {options.map(({ icon: Icon, ...option }) => (
        <button
          key={option.value}
          type="button"
          lang={option.lang}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-6 items-center justify-center gap-1.5 rounded-md text-meta font-medium whitespace-nowrap tabular-nums transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
            stretch ? 'flex-auto px-1.5' : 'px-2.5',
            value === option.value
              ? 'bg-card text-foreground shadow-xs dark:bg-selected'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {Icon && <Icon className="size-3.5" />}
          {option.label}
        </button>
      ))}
    </div>
  )
}
