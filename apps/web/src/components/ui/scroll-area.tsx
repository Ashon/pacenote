import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import type * as React from 'react'
import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  THUMB_WIDTH,
  thumbDash,
  thumbTrack,
  type ThumbTrack,
} from './scroll-thumb'

function ScrollArea({
  className,
  children,
  viewportClassName,
  viewportRef,
  scrollbarClassName,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportClassName?: string
  /** The element that scrolls, for code that scrolls it (to follow output) */
  viewportRef?: React.Ref<HTMLDivElement>
  /** Its scrollbar, kept above what floats over the content (z-10) */
  scrollbarClassName?: string
}) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        className={cn(
          'h-full w-full rounded-[inherit] [&>div]:!block',
          viewportClassName
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar className={scrollbarClassName} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

/**
 * The one scrollbar any scroll area here has: vertical. Radix's thumb stays
 * as the handle you drag, unpainted; the thumb you see is drawn over it, so
 * it can bend round the surface's rounded corners.
 */
function ScrollBar({ className }: { className?: string }) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      orientation="vertical"
      className={cn(
        'flex h-full w-2.5 touch-none border-l border-l-transparent p-px transition-colors select-none',
        className
      )}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full" />
      <CornerThumb />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

/**
 * The thumb as you see it. Where the scroll area's right side meets a
 * rounded corner of the surface it is on (.content-surface), it bends round
 * that corner rather than run into it and be cut off.
 */
function CornerThumb() {
  const svg = useRef<SVGSVGElement>(null)
  const line = useRef<SVGPathElement>(null)
  useLayoutEffect(() => {
    const bar = svg.current?.parentElement
    const root = bar?.parentElement
    const viewport = root?.querySelector<HTMLElement>(
      ':scope > [data-radix-scroll-area-viewport]'
    )
    const path = line.current
    if (!bar || !root || !viewport || !path) return
    const surface = root.closest<HTMLElement>('.content-surface')
    let track: ThumbTrack = { d: '', length: 0 }
    const place = () => {
      const { dash, offset } = thumbDash(track, {
        viewport: viewport.offsetHeight,
        content: viewport.scrollHeight,
        scrollTop: viewport.scrollTop,
      })
      path.style.strokeDasharray = `${dash} ${track.length + THUMB_WIDTH}`
      path.style.strokeDashoffset = `${-offset}`
    }
    const measure = () => {
      track = thumbTrack({
        width: bar.clientWidth,
        height: bar.clientHeight,
        ...corners(root, surface),
      })
      path.setAttribute('d', track.d)
      place()
    }
    measure()
    const sizes = new ResizeObserver(measure)
    sizes.observe(bar)
    sizes.observe(viewport)
    if (viewport.firstElementChild) sizes.observe(viewport.firstElementChild)
    viewport.addEventListener('scroll', place, { passive: true })
    // A page coming in rises into place: measure where it settled
    surface?.addEventListener('animationend', measure)
    return () => {
      sizes.disconnect()
      viewport.removeEventListener('scroll', place)
      surface?.removeEventListener('animationend', measure)
    }
  }, [])
  return (
    <svg
      ref={svg}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full overflow-visible text-border"
    >
      <path
        ref={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={THUMB_WIDTH}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** The radii of the surface's corners the scroll area's right side meets */
function corners(root: HTMLElement, surface: HTMLElement | null) {
  if (!surface) return { top: 0, bottom: 0 }
  const area = root.getBoundingClientRect()
  const box = surface.getBoundingClientRect()
  const meets = (a: number, b: number) => Math.abs(a - b) < 1.5
  if (!meets(area.right, box.right)) return { top: 0, bottom: 0 }
  const style = getComputedStyle(surface)
  return {
    top: meets(area.top, box.top)
      ? parseFloat(style.borderTopRightRadius) || 0
      : 0,
    bottom: meets(area.bottom, box.bottom)
      ? parseFloat(style.borderBottomRightRadius) || 0
      : 0,
  }
}

export { ScrollArea }
