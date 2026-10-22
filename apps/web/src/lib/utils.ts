import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Merges class names, the later winning a conflict. It knows the type roles
 * (index.css), so text-meta is a size beside a text color, not a color that
 * one replaces.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'number',
        'title',
        'heading',
        'section',
        'row',
        'copy',
        'body',
        'meta',
        'caption',
      ],
    },
  },
})

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/** Opens a route: go('#/tasks') */
export const go = (hash: string) => {
  window.location.hash = hash
}
