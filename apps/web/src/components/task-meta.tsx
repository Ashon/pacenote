import type { Locale } from '@src/i18n/locale'
import { ADDED_BY_YOU, LOCAL } from '@src/tasks/sources'
import type { TaskStage } from '@src/tasks/stage'
import type { TaskView } from '@src/tasks/types'
import type { TaskArea } from '@src/you/types'
import { Clock } from 'lucide-react'
import type * as React from 'react'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { daysSince } from '@/lib/today'
import { cn } from '@/lib/utils'
import { text } from './task-row.text'

/**
 * The line under a task's title: who it is from, where and when, then its
 * pills. The Mac's Todo row (task-row.tsx) and a phone's or an iPad's draw it
 * from here, so it reads the same on each; each adds the pills it shows.
 */

type RowWords = (typeof text)[Locale]

/**
 * Who it is from: you, a session (follows: the title of the task it carries
 * on from), or who asked
 */
export function whoOf(
  task: TaskView,
  t: RowWords,
  follows?: string
): string | undefined {
  if (task.source.app === 'local') {
    if (task.addedBy === ADDED_BY_YOU) return t.addedByYou
    return follows ? t.leftAfter(follows) : t.keptFromSession
  }
  if (task.kind === 'promised') return t.promised
  if (task.askedBy) return t.askedBy(task.askedBy, task.group)
  return task.group ? t.askedOf(task.group) : undefined
}

/** Where it was asked: this Mac, or its channel */
export function whereOf(task: TaskView, t: RowWords): string | undefined {
  return task.source.app === 'local' && task.source.label === LOCAL.label
    ? t.thisMac
    : task.source.label
}

export function TaskMeta({
  task,
  follows,
  children,
}: {
  task: TaskView
  /** The title of the task it carries on from, for one a session left */
  follows?: string
  /** Its pills, in the order the screen shows them */
  children?: React.ReactNode
}) {
  const t = useText(text)
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
      {[
        whoOf(task, t, follows),
        whereOf(task, t),
        formatRelative(task.postedAt),
      ]
        .filter(Boolean)
        .join(' · ')}
      {children}
    </p>
  )
}

const TONE = {
  muted: 'bg-muted',
  due: 'bg-status-interrupted/12 text-status-interrupted',
  primary: 'bg-primary/12 text-primary',
}

const pill = (tone: keyof typeof TONE) =>
  cn(
    'inline-flex items-center gap-1 rounded-full px-2 py-px font-medium',
    TONE[tone]
  )

/** A pill on that line: when it is due, how it was settled, its stage */
export function Pill({
  tone = 'muted',
  className,
  ...props
}: React.ComponentProps<'span'> & { tone?: keyof typeof TONE }) {
  return <span {...props} className={cn(pill(tone), className)} />
}

/** In progress, or waiting on someone else and for how long (stage.ts) */
export function StagePill({ stage }: { stage?: TaskStage }) {
  const t = useText(text)
  if (stage?.stage === 'started')
    return (
      <Pill tone="primary" className="gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
        {t.inProgress}
      </Pill>
    )
  if (stage?.stage === 'waiting')
    return (
      <Pill>
        <Clock aria-hidden="true" className="size-3" />
        {t.waitingFor(daysSince(stage.at))}
      </Pill>
    )
  return null
}

/** The area of your work it is in (You), a link to the area where given */
export function AreaPill({ area, href }: { area: TaskArea; href?: string }) {
  const t = useText(text)
  if (!href) return <Pill title={t.inArea(area.name)}>{area.name}</Pill>
  return (
    <a
      href={href}
      title={t.inArea(area.name)}
      className={cn(pill('muted'), 'hover:text-foreground')}
    >
      {area.name}
    </a>
  )
}
