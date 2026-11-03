import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * The mark (public/pacenote.svg), drawn inline so its gradient takes the
 * accent's three stops (--mark-1 to 3). The app icon, the menu bar and the
 * site keep the green file.
 */
export function PacenoteMark({ className }: { className?: string }) {
  const id = `${useId().replace(/[^\w-]/g, '')}-mark`
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden
      className={cn('size-6 shrink-0 select-none', className)}
    >
      <defs>
        <linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1="54"
          y1="314"
          x2="458"
          y2="198"
        >
          <MarkStops />
        </linearGradient>
      </defs>
      <path
        d="M273.1 92.9A164 164 0 1 0 419.1 238.9"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="84"
        strokeLinecap="round"
      />
      <circle cx="372" cy="140" r="42" fill={`url(#${id})`} />
    </svg>
  )
}

/** The mark's gradient, in the accent's colors */
export function MarkStops() {
  return (
    <>
      <stop offset="0" style={{ stopColor: 'var(--mark-1)' }} />
      <stop offset="0.46" style={{ stopColor: 'var(--mark-2)' }} />
      <stop offset="1" style={{ stopColor: 'var(--mark-3)' }} />
    </>
  )
}
