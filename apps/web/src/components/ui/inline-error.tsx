import { cn } from '@/lib/utils'

/**
 * Why what was just tried did not work, under it: read out as it shows
 * (role alert), and nothing without an error
 */
export function InlineError({
  error,
  className,
}: {
  error?: string | null
  className?: string
}) {
  if (!error) return null
  return (
    <p role="alert" className={cn('text-copy text-status-failed', className)}>
      {error}
    </p>
  )
}
