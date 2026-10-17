import type {
  RecapArea,
  RecapItem,
  RecapPeriod,
  RecapView,
} from '@src/you/types'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Copy,
  GitCommitHorizontal,
  MessageCircle,
  PenLine,
} from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Placeholder, Swap } from '@/components/ui/motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  SkeletonBlock,
  SkeletonText,
  SkeletonWord,
} from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatHourMinute, formatRelative, formatShortDay } from '@/lib/format'
import {
  areaCounts,
  type CopyFormat,
  recapHash,
  recapText,
  recapTitle,
  recapWhen,
  totalsLine,
  useRecap,
  useWriteRecap,
} from '@/lib/recap'
import { cn } from '@/lib/utils'
import { areaHash } from '@/lib/you'
import { taskHash } from '@/lib/tasks'
import { PaceSpinner } from './pace-spinner'

const PERIODS: { value: RecapPeriod; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

const COPY: Record<RecapPeriod, string> = {
  day: 'Copy as standup',
  week: 'Copy as weekly update',
  month: 'Copy as monthly recap',
}

/** The period you looked at last, in this browser */
const PERIOD_KEY = 'pacenote.recap.period'

export function lastPeriod(): RecapPeriod {
  try {
    const value = localStorage.getItem(PERIOD_KEY)
    return value === 'week' || value === 'month' ? value : 'day'
  } catch {
    return 'day'
  }
}

const go = (hash: string) => {
  window.location.hash = hash
}

/**
 * Recap: what you did, read at three distances (src/you/recap.ts). A day is
 * a standup (done, doing, next), a week what you did in each area and what
 * carries over, a month where it went and what changed. Each is counted from
 * your tasks, your own commits, your sessions and what you asked Pace; Write
 * it up has Claude Code sum it up in a few sentences, only when you click.
 * Nothing is sent: it copies as a standup, an update or for Slack.
 */
export function RecapPage({
  period,
  periodKey,
}: {
  period: RecapPeriod
  /** The period's key; the current one when none */
  periodKey?: string
}) {
  const bridge = window.pacenoteDesktop?.recap
  const recap = useRecap(period, periodKey)
  const write = useWriteRecap()
  const [writing, setWriting] = useState<string>()
  /** The recap whose text just came, which comes in as it is written */
  const [arrived, setArrived] = useState<string>()
  const [error, setError] = useState<string>()
  const view = recap.data
  const shownKey = view ? `${view.period}:${view.key}` : undefined
  // Back on a recap later, its text is simply there.
  useEffect(() => {
    if (arrived && arrived !== shownKey) setArrived(undefined)
  }, [arrived, shownKey])

  const choose = (next: RecapPeriod) => {
    try {
      localStorage.setItem(PERIOD_KEY, next)
    } catch {
      // Without storage the screen opens on Day next time.
    }
    go(recapHash(next))
  }
  const writeUp = async () => {
    if (!view) return
    const key = `${view.period}:${view.key}`
    setError(undefined)
    setWriting(key)
    const failed = await write(view)
    setError(failed)
    setArrived(failed ? undefined : key)
    setWriting(undefined)
  }

  return (
    <ScrollArea className="h-full">
      <div className="@container mx-auto max-w-4xl px-10 py-9">
        {/* As tall as its buttons before they come */}
        <header className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-lg font-semibold tracking-tight">Recap</h1>
          <span className="text-sm text-muted-foreground">
            What you did, by day, week and month
          </span>
          <span className="flex-1" />
          {view && view.areas.length > 0 && (
            <span className="flex items-center gap-1.5">
              {!view.written && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(writing)}
                  onClick={() => void writeUp()}
                >
                  <PenLine />
                  {writing ? 'Writing it up' : 'Write it up'}
                </Button>
              )}
              <CopyButton view={view} />
            </span>
          )}
        </header>
        {!bridge ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Recaps are counted by the desktop app.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
              <Tabs
                value={period}
                onValueChange={(value) => choose(value as RecapPeriod)}
              >
                <TabsList aria-label="Recap of">
                  {PERIODS.map(({ value, label }) => (
                    <TabsTrigger key={value} value={value}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-0.5">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`The ${period} before`}
                  disabled={!view}
                  onClick={() => view && go(recapHash(period, view.prev))}
                >
                  <ChevronLeft />
                </Button>
                <span className="px-1.5 text-sm font-semibold">
                  {view ? recapTitle(view) : <SkeletonWord width="8rem" />}
                </span>
                {view && recapWhen(view) && (
                  <span className="text-xs text-muted-foreground">
                    {recapWhen(view)}
                  </span>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`The ${period} after`}
                  disabled={!view?.next}
                  onClick={() => view?.next && go(recapHash(period, view.next))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-status-failed">
                {error}
              </p>
            )}
            {/* Another period takes this one's place; until its recap is
                counted, its skeleton holds the place */}
            <Swap id={`${period}:${periodKey ?? 'now'}`}>
              <Placeholder
                ready={Boolean(view)}
                skeleton={<RecapSkeleton period={period} />}
              >
                {view && (
                  <RecapBody
                    view={view}
                    writing={writing === shownKey}
                    arrived={arrived === shownKey}
                    onWriteAgain={() => void writeUp()}
                  />
                )}
              </Placeholder>
            </Swap>
          </>
        )}
      </div>
    </ScrollArea>
  )
}

function CopyButton({ view }: { view: RecapView }) {
  const [copied, setCopied] = useState(false)
  const copy = async (format: CopyFormat) => {
    await navigator.clipboard.writeText(recapText(view, format))
    setCopied(true)
    setTimeout(() => setCopied(false), 1_500)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          {copied ? <Check className="text-primary" /> : <Copy />}
          {copied ? 'Copied' : COPY[view.period]}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void copy('markdown')}>
          <span className="flex flex-col">
            {view.period === 'day' ? 'Standup' : 'As Markdown'}
            <span className="text-xs text-muted-foreground">
              Each part with its lines
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copy('slack')}>
          <span className="flex flex-col">
            For Slack
            <span className="text-xs text-muted-foreground">
              The same, in Slack's formatting
            </span>
          </span>
        </DropdownMenuItem>
        {view.written && (
          <DropdownMenuItem onSelect={() => void copy('summary')}>
            <span className="flex flex-col">
              The summary only
              <span className="text-xs text-muted-foreground">
                Just the sentences written up
              </span>
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RecapBody({
  view,
  writing,
  arrived,
  onWriteAgain,
}: {
  view: RecapView
  writing: boolean
  /** Its text just came: it comes in word by word */
  arrived: boolean
  onWriteAgain: () => void
}) {
  const empty = view.areas.length === 0
  // While it is written, the text's place shows it being written; the text
  // takes that place when it comes.
  const card = writing
    ? 'writing'
    : view.written
      ? `written:${view.written.at}`
      : 'none'
  return (
    <div>
      <Swap id={card}>
        {writing ? (
          <WritingUp />
        ) : (
          view.written && (
            <section
              aria-label="Written up"
              className="mt-4 flex flex-col gap-1.5 rounded-xl bg-card-accent px-4 pt-3.5 pb-3"
            >
              <WrittenText text={view.written.text} arrived={arrived} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Written by Claude Code from the lines below, with no tools ·{' '}
                  {formatRelative(view.written.at)}
                </span>
                <Button size="xs" variant="ghost" onClick={onWriteAgain}>
                  Write again
                </Button>
              </div>
            </section>
          )
        )}
      </Swap>
      {empty ? (
        <p className="mt-5 border-t border-border py-8 text-sm text-muted-foreground">
          Nothing here for this {view.period}. Tasks you settle, your commits
          and your sessions show up here.
        </p>
      ) : view.period === 'day' && view.day ? (
        <DayBody view={view} />
      ) : (
        <AreasBody view={view} />
      )}
      {!empty && <Sources view={view} />}
    </div>
  )
}

/** Where the written text will be, while Claude Code writes it */
function WritingUp() {
  return (
    <section
      aria-label="Writing it up"
      aria-busy
      className="mt-4 flex items-start gap-3 rounded-xl bg-card-accent px-4 pt-3.5 pb-3.5"
    >
      <PaceSpinner writing />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <span className="text-xs text-muted-foreground">
          Claude Code is writing it up from the lines below
        </span>
        <span className="writing-line w-[92%]" />
        <span className="writing-line w-[64%]" />
      </div>
    </section>
  )
}

/** The written text; just come, it comes in word by word */
function WrittenText({ text, arrived }: { text: string; arrived: boolean }) {
  const words = arrived ? text.split(/\s+/).filter(Boolean) : []
  return (
    <p
      className={cn(
        'max-w-[46rem] text-sm leading-relaxed select-text',
        arrived && 'motion-write-in'
      )}
      style={
        arrived
          ? ({ '--motion-n': words.length } as React.CSSProperties)
          : undefined
      }
    >
      {arrived
        ? words.map((word, i) => (
            <Fragment key={i}>
              {i > 0 && ' '}
              <span
                data-word
                style={{ '--motion-i': i } as React.CSSProperties}
              >
                {word}
              </span>
            </Fragment>
          ))
        : text}
    </p>
  )
}

/** Widths for skeleton lines, so they do not read as one block */
const LINE_WIDTHS = ['58%', '72%', '46%', '64%', '52%']

/** One of a recap's lines while it is counted: its icon's place and a bar */
function LineSkeleton({ i }: { i: number }) {
  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-2.5 text-body">
      <span className="flex h-5 items-center justify-center">
        <SkeletonBlock className="size-2.5 rounded-full" />
      </span>
      <SkeletonText width={LINE_WIDTHS[i % LINE_WIDTHS.length]} />
    </li>
  )
}

/**
 * A recap's place while it is counted, drawn to its measure: for a day, its
 * Done and Next; for a week or a month, the totals and two areas
 */
function RecapSkeleton({ period }: { period: RecapPeriod }) {
  if (period === 'day')
    return (
      <div>
        {(['Done', 'Next'] as const).map((title, g) => (
          <section key={title} className="mt-5">
            <div className="mb-1.5 flex items-baseline gap-2.5">
              <h2 className="text-sm font-semibold">{title}</h2>
            </div>
            <ul className="flex flex-col gap-2 border-t border-border pt-2.5">
              {[0, 1].map((i) => (
                <LineSkeleton key={i} i={g * 2 + i} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  return (
    <div>
      <SkeletonText className="mt-4 text-body" width="44%" />
      <div className="mt-2">
        {[3, 2].map((lines, a) => (
          <section
            key={a}
            className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border py-3.5 first:border-t-0 @xl:grid-cols-[12rem_minmax(0,1fr)]"
          >
            <div className="flex flex-col gap-1">
              <SkeletonText className="text-sm" width={a ? '52%' : '66%'} />
              <SkeletonText className="text-xs" width="80%" />
              <SkeletonBlock className="mt-1 h-1.5 w-28 rounded-full" />
            </div>
            <ul className="flex flex-col gap-1.5">
              {Array.from({ length: lines }, (_, i) => (
                <LineSkeleton key={i} i={a * 3 + i} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function DayBody({ view }: { view: RecapView }) {
  const day = view.day!
  const carried = view.areas.flatMap((area) => area.carried)
  return (
    <>
      {day.yesterday && day.yesterday.length > 0 && (
        <Group title="Yesterday" meta="what you did, for the standup">
          {day.yesterday.map((item, i) => (
            <Line key={i} item={item} kind="done" time="day" />
          ))}
        </Group>
      )}
      <Group title="Done" meta={view.current ? 'today' : undefined}>
        {day.done.length === 0 ? (
          <Quiet>Nothing done yet.</Quiet>
        ) : (
          day.done.map((item, i) => (
            <Line key={i} item={item} kind="done" time="hour" />
          ))
        )}
      </Group>
      {view.current ? (
        <>
          {day.doing.length > 0 && (
            <Group title="Doing" meta="worked on today">
              {day.doing.map((item, i) => (
                <Line key={i} item={item} kind="doing" />
              ))}
            </Group>
          )}
          <Group title="Next" meta="open, due ones first">
            {day.next.length === 0 ? (
              <Quiet>Nothing open.</Quiet>
            ) : (
              day.next.map((item, i) => (
                <Line key={i} item={item} kind="next" />
              ))
            )}
          </Group>
        </>
      ) : (
        carried.length > 0 && (
          <Group title="Still open" meta="at the end of the day">
            {carried.map((item, i) => (
              <Line key={i} item={item} kind="next" />
            ))}
          </Group>
        )
      )}
    </>
  )
}

function AreasBody({ view }: { view: RecapView }) {
  return (
    <>
      <p className="mt-4 text-body text-foreground/80">{totalsLine(view)}</p>
      {view.month && <MonthChanges view={view} />}
      <div className="mt-2">
        {view.areas.map((area) => (
          <AreaBlock key={area.id ?? 'elsewhere'} area={area} view={view} />
        ))}
      </div>
    </>
  )
}

function AreaBlock({ area, view }: { area: RecapArea; view: RecapView }) {
  return (
    <section
      data-recap-area={area.id ?? 'elsewhere'}
      className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border py-3.5 first:border-t-0 @xl:grid-cols-[12rem_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-1">
        {area.id ? (
          <a
            href={areaHash(area.id)}
            title={`${area.name} on the You screen`}
            className="text-sm font-semibold hover:text-primary"
          >
            {area.name}
          </a>
        ) : (
          <span className="text-sm font-semibold text-muted-foreground">
            {area.name}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {areaCounts(area)}
        </span>
        {area.id && (
          <span
            role="img"
            aria-label={`About ${Math.round(area.share * 100)}% of your ${view.period}`}
            className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="pacenote-gradient block h-full rounded-full"
              style={{ width: `${Math.max(4, area.share * 100)}%` }}
            />
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {area.items.map((item, i) => (
          <Line
            key={i}
            item={item}
            kind={
              item.task
                ? 'done'
                : item.title.startsWith('Asked Pace')
                  ? 'run'
                  : 'commit'
            }
            time="day"
            plain
          />
        ))}
        {area.commitsMore > 0 && (
          <li className="pl-6 text-xs text-muted-foreground">
            and {area.commitsMore} more{' '}
            {area.commitsMore === 1 ? 'commit' : 'commits'}
            {area.repos.length > 0 && ` in ${area.repos.join(', ')}`}
          </li>
        )}
        {area.carried.map((item, i) => (
          <Line key={`c${i}`} item={item} kind="carried" plain />
        ))}
      </ul>
    </section>
  )
}

function MonthChanges({ view }: { view: RecapView }) {
  const month = view.month!
  const lines = [
    month.started.length > 0 && ['Started', month.started.join(', ')],
    month.quiet.length > 0 && ['Went quiet', month.quiet.join(', ')],
    month.people.length > 0 && ['Asked most by', month.people.join(', ')],
  ].filter((line): line is [string, string] => Boolean(line))
  if (lines.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-1 rounded-xl bg-well px-3.5 py-2.5">
      {lines.map(([label, text]) => (
        <div
          key={label}
          className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-body"
        >
          <span className="text-xs text-muted-foreground">{label}</span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  )
}

const ICON = {
  done: <CircleCheck className="size-4 text-primary" />,
  commit: <GitCommitHorizontal className="size-4 text-muted-foreground" />,
  run: <MessageCircle className="size-4 text-muted-foreground" />,
  doing: <span className="mx-[5px] size-1.5 rounded-full bg-status-running" />,
  next: <Circle className="size-3.5 text-muted-foreground" />,
  carried: <ArrowRight className="size-4 text-status-interrupted" />,
} as const

/** One line: what it is, its area, and what else to say */
function Line({
  item,
  kind,
  time,
  plain,
}: {
  item: RecapItem
  kind: keyof typeof ICON
  /** Show its time: the hour (today), or the day */
  time?: 'hour' | 'day'
  /** Inside its area: no area chip */
  plain?: boolean
}) {
  const at =
    item.at &&
    (time === 'hour'
      ? formatHourMinute(item.at)
      : time === 'day'
        ? formatShortDay(item.at)
        : undefined)
  const commit = kind === 'commit'
  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-2.5 text-body">
      <span aria-hidden="true" className="flex h-5 items-center justify-center">
        {ICON[kind]}
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {item.task ? (
          <a
            href={taskHash(item.task)}
            className="font-medium text-foreground hover:text-primary hover:underline"
          >
            {item.title}
          </a>
        ) : (
          <span className={cn(commit ? 'font-mono text-xs' : 'font-medium')}>
            {item.title}
          </span>
        )}
        {!plain && item.area && (
          <a
            href={areaHash(item.area.id)}
            className="rounded-full bg-muted px-2 py-px text-2xs font-medium hover:text-foreground"
          >
            {item.area.name}
          </a>
        )}
        {(item.note || at) && (
          <span className="text-xs text-muted-foreground">
            {[kind === 'carried' ? 'carries over' : undefined, item.note, at]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </span>
    </li>
  )
}

function Group({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-5">
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      <ul className="flex flex-col gap-2 border-t border-border pt-2.5">
        {children}
      </ul>
    </section>
  )
}

const Quiet = ({ children }: { children: React.ReactNode }) => (
  <li className="text-sm text-muted-foreground">{children}</li>
)

/** Where the recap comes from, at its foot */
function Sources({ view }: { view: RecapView }) {
  const { totals } = view
  const parts = [
    totals.done > 0 &&
      `${totals.done} ${totals.done === 1 ? 'task' : 'tasks'} done`,
    totals.commits > 0 &&
      `${totals.commits} ${totals.commits === 1 ? 'commit' : 'commits'}${view.emails.length ? ` by ${view.emails.join(', ')}` : ''}`,
    totals.runs > 0 &&
      `${totals.runs} of Pace's ${totals.runs === 1 ? 'run' : 'runs'}`,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <p className="mt-5 border-t border-border pt-3.5 text-xs text-muted-foreground">
      From {parts.join(', ')}.
    </p>
  )
}
