import type { RunStatus } from '@history/types'
import { CircleCheck, CirclePause, CircleX, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export const STATUS_META: Record<
  RunStatus,
  {
    label: string
    text: string
    bg: string
    dot: string
    Icon: typeof CircleCheck
  }
> = {
  running: {
    label: 'Running',
    text: 'text-status-running',
    bg: 'bg-status-running/12 border-status-running/30',
    dot: 'bg-status-running',
    Icon: LoaderCircle,
  },
  succeeded: {
    label: 'Succeeded',
    text: 'text-status-succeeded',
    bg: 'bg-status-succeeded/10 border-status-succeeded/25',
    dot: 'bg-status-succeeded',
    Icon: CircleCheck,
  },
  failed: {
    label: 'Failed',
    text: 'text-status-failed',
    bg: 'bg-status-failed/10 border-status-failed/30',
    dot: 'bg-status-failed',
    Icon: CircleX,
  },
  interrupted: {
    label: 'Interrupted',
    text: 'text-status-interrupted',
    bg: 'bg-status-interrupted/10 border-status-interrupted/30',
    dot: 'bg-status-interrupted',
    Icon: CirclePause,
  },
}

/**
 * A run's status in a list, told by its shape as well as its color: a quiet dot
 * for succeeded, which most runs are, and the status's icon for the others
 */
export function StatusMark({
  status,
  className,
}: {
  status: RunStatus
  className?: string
}) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center',
        meta.text,
        className
      )}
    >
      {status === 'succeeded' ? (
        <span className={cn('size-2 rounded-full', meta.dot)} />
      ) : (
        <meta.Icon
          aria-hidden
          className={cn('size-3.5', status === 'running' && 'animate-spin')}
        />
      )}
      <span className="sr-only">{meta.label}</span>
    </span>
  )
}

export function StatusBadge({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-meta font-medium',
        meta.text,
        meta.bg
      )}
    >
      <meta.Icon
        className={cn('size-3.5', status === 'running' && 'animate-spin')}
      />
      {meta.label}
    </span>
  )
}
