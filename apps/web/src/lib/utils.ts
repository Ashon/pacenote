import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Merges class names, the later winning a conflict. It knows the type scale's
 * own sizes (index.css), so text-body is a size beside a text color, not a
 * color that one replaces.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['2xs', 'body'] } },
})

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
