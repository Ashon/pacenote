import type { TaskView } from '@src/tasks/types'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  type ListEntry,
  useListMotion,
  usePresence,
} from '@/components/ui/motion'
import { SkeletonText, SkeletonWord } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useText } from '@/lib/i18n'
import { taskHash } from '@/lib/tasks'
import { ROWS_AT_ONCE, type Tab } from '@/lib/todo-list'
import { go } from '@/lib/utils'
import { text } from './tasks-page.text'

/**
 * Todo's tabs and the list under them (tasks-page.tsx): the tabs with their
 * counts, the rows, their place while the tasks come, Show more, and the
 * notice for tasks that came in while you looked.
 */

/**
 * Open, Waiting (once a task waits on someone), Maybe and Done, with their
 * counts once the tasks are in, and the collections that found them
 */
export function TaskTabs({
  tab,
  onTab,
  counts,
}: {
  tab: Tab
  onTab: (tab: Tab) => void
  counts?: { open: number; waiting: number; maybe: number }
}) {
  const t = useText(text)
  return (
    <Tabs value={tab} onValueChange={(value) => onTab(value as Tab)}>
      <TabsList className="mt-5">
        <TabsTrigger value="open">
          {t.tabOpen} {counts ? counts.open : <SkeletonWord />}
        </TabsTrigger>
        {(counts?.waiting || tab === 'waiting') && (
          <TabsTrigger value="waiting">
            {t.tabWaiting} {counts?.waiting ?? 0}
          </TabsTrigger>
        )}
        <TabsTrigger value="maybe">
          {t.tabMaybe} {counts ? counts.maybe : <SkeletonWord />}
        </TabsTrigger>
        <TabsTrigger value="done">{t.tabDone}</TabsTrigger>
        <TabsTrigger value="collections">{t.tabCollections}</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

/** Widths for skeleton rows, so they do not read as one block */
const TITLE_WIDTHS = ['62%', '48%', '56%', '42%']
const META_WIDTHS = ['38%', '30%', '44%', '34%']

/**
 * The list's place while the tasks come: rows as tall as a task's row (its
 * title, and its line of who, where and when with a chip on it)
 */
export function TaskRowsSkeleton({ count }: { count: number }) {
  return (
    <ul className="mt-3">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="border-t border-border py-3.5">
          <div className="pl-6">
            <SkeletonText
              className="text-copy leading-snug"
              width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]}
            />
            {/* the meta line, as tall as its chips: 17px and 1px each side */}
            <SkeletonText
              className="mt-1 text-meta leading-[1.1875rem]"
              width={META_WIDTHS[i % META_WIDTHS.length]}
            />
            {/* a narrow window's buttons, under the title (task-row.tsx) */}
            <div
              aria-hidden="true"
              className="mt-2.5 hidden h-7 @max-[44rem]:block"
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * A tab's rows. A task that leaves the tab, settled, is pushed aside and the
 * rows below close up (settle); one that comes in unfolds (arrive).
 */
export function TaskList({
  tasks,
  revealed,
  onKeyDown,
  row,
}: {
  tasks: TaskView[]
  /** A task just shown: it is brought into view */
  revealed?: string
  onKeyDown: (event: React.KeyboardEvent<HTMLUListElement>) => void
  row: (task: TaskView, motion: ListEntry<TaskView>) => React.ReactNode
}) {
  const { ref, entries } = useListMotion(tasks, (task) => task.id)
  useEffect(() => {
    if (!revealed) return
    ref.current
      ?.querySelector(`[data-task-row="${CSS.escape(revealed)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [revealed, ref])
  return (
    <ul ref={ref} className="mt-3" onKeyDown={onKeyDown}>
      {entries.map((entry) => row(entry.item, entry))}
    </ul>
  )
}

/**
 * The list's keys, with a task open or none: up and down step through the
 * tasks (the open one follows); Esc closes it.
 */
export const stepThrough =
  (openId: string | undefined) =>
  (event: React.KeyboardEvent<HTMLUListElement>) => {
    const target = event.target as HTMLElement
    // Keys in a dialog or menu over the list, or while typing, are theirs.
    if (!event.currentTarget.contains(target)) return
    if (target.closest('textarea, input, select')) return
    // Not the rows on their way out
    const titles = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        '[data-task-row]:not([inert]) [data-task-title]'
      ),
    ]
    const rowOf = (element: Element) =>
      element.closest<HTMLElement>('[data-task-row]')?.dataset.taskRow
    if (event.key === 'Escape' && openId) {
      event.preventDefault()
      titles.find((title) => rowOf(title) === openId)?.focus()
      go('#/tasks')
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const at = titles.findIndex((title) => rowOf(title) === rowOf(target))
    const next = titles[at + (event.key === 'ArrowDown' ? 1 : -1)]
    if (at < 0 || !next) return
    event.preventDefault()
    next.focus()
    const id = rowOf(next)
    if (openId && id) go(taskHash(id))
  }

/** The rows a long list leaves out, ROWS_AT_ONCE more on each click */
export function ShowMore({
  hidden,
  onShow,
}: {
  hidden: number
  onShow: () => void
}) {
  const t = useText(text)
  if (hidden <= 0) return null
  return (
    <div className="border-t border-border pt-2">
      <Button
        size="sm"
        variant="ghost"
        // Its chevron under the rows' own
        className="-ml-2 text-muted-foreground"
        onClick={onShow}
      >
        <ChevronDown />
        {t.showMore(Math.min(hidden, ROWS_AT_ONCE))}
      </Button>
    </div>
  )
}

/**
 * Tasks that came in while you were looking, from a collection or an AI tool:
 * a notice on the tabs' line, clear of the rows, that shows them where they
 * belong. It slides in from above (pop) and stays in view as you scroll.
 */
export function NewTasks({
  count,
  onShow,
}: {
  count: number
  onShow: () => void
}) {
  const t = useText(text)
  const notice = usePresence<HTMLButtonElement>(count > 0)
  // Leaving, it still says how many it showed
  const said = useRef(count)
  if (count > 0) said.current = count
  return (
    <div
      aria-live="polite"
      // On the tabs' line above it; stuck, 12px below the top
      className="sticky top-[42px] z-10 flex h-0 justify-center"
    >
      {notice.mounted && (
        <button
          ref={notice.ref}
          type="button"
          data-state={notice.state}
          data-side="bottom"
          onClick={onShow}
          className="motion-pop -mt-[30px] h-7 rounded-full bg-primary px-3 text-meta font-semibold text-primary-foreground shadow-float outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {t.newTasks(said.current)}
        </button>
      )}
    </div>
  )
}
