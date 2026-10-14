import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Motion for content that comes and goes on its own terms, beside what Radix
 * does for its primitives. The patterns themselves are in motion.css.
 */

/**
 * Calls back once the element's own finite animations have finished, at once
 * when it has none (no element, or reduced to nothing)
 */
function afterMotion(element: Element | null | undefined, done: () => void) {
  let live = true
  const running = (element?.getAnimations?.() ?? []).filter(
    (animation) =>
      animation.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY
  )
  void Promise.allSettled(running.map((animation) => animation.finished)).then(
    () => live && done()
  )
  return () => {
    live = false
  }
}

/**
 * swap: content giving way to other content, such as a screen. When `id`
 * changes, what was shown fades out (inert meanwhile), then the new content
 * rises in. The first content shows without motion.
 */
export function Swap({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: React.ReactNode
}) {
  const [shown, setShown] = useState({ id, swapped: false })
  const box = useRef<HTMLDivElement>(null)
  // What was on screen for the shown id, kept while it leaves
  const last = useRef(children)
  const leaving = id !== shown.id
  useLayoutEffect(() => {
    if (!leaving) last.current = children
  })
  useEffect(() => {
    if (!leaving) return
    return afterMotion(box.current, () => setShown({ id, swapped: true }))
  }, [leaving, id])
  return (
    <div
      key={shown.id}
      ref={box}
      inert={leaving || undefined}
      data-motion={leaving ? 'out' : shown.swapped ? 'in' : undefined}
      className={cn('motion-swap', className)}
    >
      {leaving ? last.current : children}
    </div>
  )
}

type ItemMotion = 'enter' | 'exit'

export type ListEntry<T> = { key: string; item: T; motion?: ItemMotion }

/**
 * The items as they are now and the ones still leaving, each where it was. An
 * item that was not there before enters (one that comes back while leaving,
 * too); one that has entered stays marked so its animation is not cut off.
 */
function mergeEntries<T>(
  before: ListEntry<T>[],
  items: readonly T[],
  keyOf: (item: T) => string
): ListEntry<T>[] {
  const was = new Map(before.map((entry) => [entry.key, entry]))
  const result: ListEntry<T>[] = items.map((item) => {
    const key = keyOf(item)
    const prior = was.get(key)
    const motion =
      !prior || prior.motion === 'exit' ? ('enter' as const) : prior.motion
    return { key, item, motion }
  })
  const present = new Set(result.map((entry) => entry.key))
  let at = 0
  for (const entry of before) {
    if (present.has(entry.key)) {
      at = result.findIndex((each) => each.key === entry.key) + 1
      continue
    }
    result.splice(
      at,
      0,
      entry.motion === 'exit' ? entry : { ...entry, motion: 'exit' }
    )
    at += 1
  }
  return result
}

/**
 * arrive and settle: a list whose items come and go with motion. An item added
 * after the first render enters; one that is no longer there stays, inert,
 * until it has settled out. Put `ref` on the list and spread
 * `motionItem(entry)` on each item's root element.
 */
export function useListMotion<T, E extends HTMLElement = HTMLUListElement>(
  items: readonly T[],
  keyOf: (item: T) => string
) {
  const list = useRef<E>(null)
  const committed = useRef<ListEntry<T>[]>(undefined)
  const [, rerender] = useReducer((count: number) => count + 1, 0)
  const entries = committed.current
    ? mergeEntries(committed.current, items, keyOf)
    : items.map((item) => ({ key: keyOf(item), item }) as ListEntry<T>)
  useLayoutEffect(() => {
    committed.current = entries
  })
  useEffect(() => {
    const stops = entries
      .filter((entry) => entry.motion === 'exit')
      .map((entry) =>
        afterMotion(
          list.current?.querySelector(
            `[data-motion-item="${CSS.escape(entry.key)}"]`
          ),
          () => {
            committed.current = committed.current?.filter(
              (each) => each !== entry
            )
            rerender()
          }
        )
      )
    return () => stops.forEach((stop) => stop())
  })
  return { ref: list, entries }
}

/** The attributes an item of useListMotion's list carries */
export const motionItem = (entry: { key: string; motion?: ItemMotion }) => ({
  'data-motion-item': entry.key,
  'data-motion': entry.motion,
  inert: entry.motion === 'exit' || undefined,
})

/**
 * One element that leaves with motion: it stays mounted, with
 * data-state="closed", until its animations have finished. Put `ref` on it.
 */
export function usePresence<E extends HTMLElement = HTMLDivElement>(
  present: boolean
) {
  const ref = useRef<E>(null)
  const [mounted, setMounted] = useState(present)
  if (present && !mounted) setMounted(true)
  useEffect(() => {
    if (present || !mounted) return
    return afterMotion(ref.current, () => setMounted(false))
  }, [present, mounted])
  return {
    ref,
    mounted: present || mounted,
    state: present ? ('open' as const) : ('closed' as const),
  }
}

/**
 * indicator: one mark under what is selected, sliding to the next choice (the
 * tabs' pill, the setup step you are on). It is placed from the box of the
 * element `selected` finds in `ref`, again whenever `attribute` changes on one
 * of them or an `items` element's size does, and slides only once placed. Put
 * `ref` on the container (positioned) and `box`, `className` on the mark.
 */
export function useIndicator<E extends HTMLElement = HTMLDivElement>({
  selected,
  items,
  attribute,
}: {
  selected: string
  items: string
  attribute: string
}) {
  const ref = useRef<E>(null)
  const [box, setBox] = useState<{
    x: number
    y: number
    width: number
    height: number
  }>()
  const [placed, setPlaced] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const place = () => {
      const item = element.querySelector<HTMLElement>(selected)
      setBox((was) =>
        !item
          ? undefined
          : was?.x === item.offsetLeft &&
              was.y === item.offsetTop &&
              was.width === item.offsetWidth &&
              was.height === item.offsetHeight
            ? was
            : {
                x: item.offsetLeft,
                y: item.offsetTop,
                width: item.offsetWidth,
                height: item.offsetHeight,
              }
      )
    }
    place()
    // The selection moves when the attribute changes, or when the selected
    // element is put in place of another (a step that becomes a link).
    const selection = new MutationObserver(place)
    selection.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [attribute],
    })
    const sizes = new ResizeObserver(place)
    for (const item of element.querySelectorAll(items)) sizes.observe(item)
    return () => {
      selection.disconnect()
      sizes.disconnect()
    }
  }, [selected, items, attribute])
  useEffect(() => {
    if (!box || placed) return
    const frame = requestAnimationFrame(() => setPlaced(true))
    return () => cancelAnimationFrame(frame)
  }, [box, placed])
  return { ref, box, className: placed ? 'motion-indicator' : undefined }
}
