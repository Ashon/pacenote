import { useCallback, useEffect, useState } from 'react'

/** Whether the last copy went: copied, or the clipboard refused it */
export type Copied = 'yes' | 'failed' | undefined

/**
 * Copying text for the person, and whether it went. Copied goes back to
 * nothing after resetMs (it stays when none is given); a failure stays until
 * the next try. copy takes the text, or the promise of it.
 */
export function useCopy(resetMs?: number): {
  copied: Copied
  copy: (text: string | Promise<string>) => Promise<boolean>
} {
  const [copied, setCopied] = useState<Copied>()
  useEffect(() => {
    if (copied !== 'yes' || resetMs === undefined) return
    const timer = setTimeout(() => setCopied(undefined), resetMs)
    return () => clearTimeout(timer)
  }, [copied, resetMs])
  const copy = useCallback(async (text: string | Promise<string>) => {
    try {
      await navigator.clipboard.writeText(await text)
      setCopied('yes')
      return true
    } catch {
      setCopied('failed')
      return false
    }
  }, [])
  return { copied, copy }
}
