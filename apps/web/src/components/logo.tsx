import { useId } from 'react'
import { cn } from '@/lib/utils'

/** The mark's open ring and the dot in its gap (public/pacenote.svg) */
const ARC = 'M273.1 92.9A164 164 0 1 0 419.1 238.9'
const DOT = { cx: 372, cy: 140, r: 42 }

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
        d={ARC}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="84"
        strokeLinecap="round"
      />
      <circle {...DOT} fill={`url(#${id})`} />
    </svg>
  )
}

/**
 * The mark in one color, as the tools' own marks are drawn beside it (the
 * size and color of the button or menu it is in): where the work goes on here
 * in Pacenote, next to the tools it could go on in instead. Its box is the
 * ring's own, as theirs fill theirs.
 */
export function PacenoteMonoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="40 40 432 432"
      aria-hidden="true"
      data-tool-mark="pacenote"
      className={cn('shrink-0', className)}
    >
      <path
        d={ARC}
        fill="none"
        stroke="currentColor"
        strokeWidth="84"
        strokeLinecap="round"
      />
      <circle {...DOT} fill="currentColor" />
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
