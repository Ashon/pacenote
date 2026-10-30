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
import { CLI_NAMES, cliOrder, isOwnCli, type OwnCli } from '@src/tasks/own-ai'
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
import { useText } from '@/lib/i18n'
import { readStored, writeStored } from '@/lib/storage'
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
import { cn, go } from '@/lib/utils'
import { areaHash } from '@/lib/you'
import { taskHash } from '@/lib/tasks'
import { switchLine } from './own-ai-status'
import { PaceSpinner } from './pace-spinner'
import { text } from './recap-page.text'

const PERIODS: RecapPeriod[] = ['day', 'week', 'month']

/** The period you looked at last, in this browser */
const PERIOD_KEY = 'pacenote.recap.period'

export function lastPeriod(): RecapPeriod {
  const value = readStored(PERIOD_KEY)
  return value === 'week' || value === 'month' ? value : 'day'
}

/**
 * Recap: what you did, read at three distances (src/you/recap.ts). A day is
 * a standup (done, doing, next), a week what you did in each area and what
 * carries over, a month where it went and what changed. Each is counted from
 * your tasks, your own commits, your sessions and what you asked Pace; Write
 * it up has the AI chosen in Settings > Todo sum it up in a few sentences, only
 * when you click.
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
  const t = useText(text)
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
    writeStored(PERIOD_KEY, next)
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
          <h1 data-page-title className="text-title">
            {t.title}
          </h1>
          <span className="text-copy text-muted-foreground">{t.subtitle}</span>
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
                  {writing ? t.writingItUp : t.writeItUp}
                </Button>
              )}
              <CopyButton view={view} />
            </span>
          )}
        </header>
        {!bridge ? (
          <p className="mt-6 text-copy text-muted-foreground">
            {t.desktopOnly}
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
              <Tabs
                value={period}
                onValueChange={(value) => choose(value as RecapPeriod)}
              >
                <TabsList aria-label={t.recapOf}>
                  {PERIODS.map((value) => (
                    <TabsTrigger key={value} value={value}>
                      {t.periods[value]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-0.5">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t.before(period)}
                  disabled={!view}
                  onClick={() => view && go(recapHash(period, view.prev))}
                >
                  <ChevronLeft />
                </Button>
                <span className="px-1.5 text-section">
                  {view ? recapTitle(view) : <SkeletonWord width="8rem" />}
                </span>
                {view && recapWhen(view) && (
                  <span className="text-meta text-muted-foreground">
                    {recapWhen(view)}
                  </span>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t.after(period)}
                  disabled={!view?.next}
                  onClick={() => view?.next && go(recapHash(period, view.next))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-copy text-status-failed">
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
  const t = useText(text)
  const [copied, setCopied] = useState(false)
  const copy = async (format: CopyFormat) => {
    await navigator.clipboard.writeText(recapText(view, format))
    setCopied(true)
    setTimeout(() => setCopied(false), 1_500)
  }
  // Each way to copy it: its name, and what it gives
  const formats: [CopyFormat, string, string][] = [
    [
      'markdown',
      view.period === 'day' ? t.standup : t.asMarkdown,
      t.markdownHint,
    ],
    ['slack', t.forSlack, t.slackHint],
  ]
  if (view.written) formats.push(['summary', t.summaryOnly, t.summaryHint])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          {copied ? <Check className="text-primary" /> : <Copy />}
          {copied ? t.copied : t.copyAs[view.period]}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map(([format, label, hint]) => (
          <DropdownMenuItem key={format} onSelect={() => void copy(format)}>
            <span className="flex flex-col">
              {label}
              <span className="text-meta text-muted-foreground">{hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
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
  const t = useText(text)
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
              aria-label={t.writtenUp}
              className="mt-4 flex flex-col gap-1.5 rounded-xl bg-card-accent px-4 pt-3.5 pb-3"
            >
              <WrittenText text={view.written.text} arrived={arrived} />
              <div className="flex items-center gap-2">
                <span className="text-meta text-muted-foreground">
                  {t.writtenBy(
                    writerName(view.written.by),
                    formatRelative(view.written.at)
                  )}
                  {view.written.switched && (
                    <span data-switch>
                      {' '}
                      · {switchLine(view.written.switched)}
                    </span>
                  )}
                </span>
                <Button size="xs" variant="ghost" onClick={onWriteAgain}>
                  {t.writeAgain}
                </Button>
              </div>
            </section>
          )
        )}
      </Swap>
      {empty ? (
        <p className="mt-5 border-t border-border py-8 text-copy text-muted-foreground">
          {t.empty(view.period)}
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

/** The CLI that wrote a recap, by name */
const writerName = (by: string) => (isOwnCli(by) ? CLI_NAMES[by] : by)

/**
 * Where the written text will be, while the AI writes it: the one that goes
 * first now (the other one while the chosen one rests)
 */
function WritingUp() {
  const t = useText(text)
  const [writer, setWriter] = useState<OwnCli>()
  useEffect(() => {
    void window.pacenoteDesktop?.ai.now().then((now) => {
      if (now) setWriter(cliOrder(now.chosen, now.fallback, now.state)[0])
    })
  }, [])
  return (
    <section
      aria-label={t.writingItUp}
      aria-busy
      className="mt-4 flex items-start gap-3 rounded-xl bg-card-accent px-4 pt-3.5 pb-3.5"
    >
      <PaceSpinner writing />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <span className="text-meta text-muted-foreground">
          {t.writing(writer ? CLI_NAMES[writer] : t.yourAi)}
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
        'max-w-[46rem] text-copy leading-relaxed select-text',
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

/** An area's block: its name and counts, beside its lines when wide */
const AREA =
  'grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border py-3.5 first:border-t-0 @xl:grid-cols-[12rem_minmax(0,1fr)]'

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
  const t = useText(text)
  if (period === 'day')
    return (
      <div>
        {[t.done, t.next].map((title, g) => (
          <Group key={g} title={title}>
            {[0, 1].map((i) => (
              <LineSkeleton key={i} i={g * 2 + i} />
            ))}
          </Group>
        ))}
      </div>
    )
  return (
    <div>
      <SkeletonText className="mt-4 text-body" width="44%" />
      <div className="mt-2">
        {[3, 2].map((lines, a) => (
          <section key={a} className={AREA}>
            <div className="flex flex-col gap-1">
              <SkeletonText className="text-copy" width={a ? '52%' : '66%'} />
              <SkeletonText className="text-meta" width="80%" />
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
  const t = useText(text)
  const day = view.day!
  const carried = view.areas.flatMap((area) => area.carried)
  return (
    <>
      {day.yesterday && day.yesterday.length > 0 && (
        <Group title={t.yesterday} meta={t.yesterdayMeta}>
          {day.yesterday.map((item, i) => (
            <Line key={i} item={item} kind="done" time="day" />
          ))}
        </Group>
      )}
      <Group title={t.done} meta={view.current ? t.today : undefined}>
        {day.done.length === 0 ? (
          <Quiet>{t.nothingDone}</Quiet>
        ) : (
          day.done.map((item, i) => (
            <Line key={i} item={item} kind="done" time="hour" />
          ))
        )}
      </Group>
      {view.current ? (
        <>
          {day.doing.length > 0 && (
            <Group title={t.doing} meta={t.doingMeta}>
              {day.doing.map((item, i) => (
                <Line key={i} item={item} kind="doing" />
              ))}
            </Group>
          )}
          <Group title={t.next} meta={t.nextMeta}>
            {day.next.length === 0 ? (
              <Quiet>{t.nothingOpen}</Quiet>
            ) : (
              day.next.map((item, i) => (
                <Line key={i} item={item} kind="next" />
              ))
            )}
          </Group>
        </>
      ) : (
        carried.length > 0 && (
          <Group title={t.stillOpen} meta={t.stillOpenMeta}>
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
  const t = useText(text)
  return (
    <section data-recap-area={area.id ?? 'elsewhere'} className={AREA}>
      <div className="flex flex-col gap-1">
        {area.id ? (
          <a
            href={areaHash(area.id)}
            title={t.onYou(area.name)}
            className="text-section hover:text-primary"
          >
            {area.name}
          </a>
        ) : (
          <span className="text-section text-muted-foreground">
            {area.name}
          </span>
        )}
        <span className="text-meta text-muted-foreground">
          {areaCounts(area)}
        </span>
        {area.id && (
          <span
            role="img"
            aria-label={t.share(Math.round(area.share * 100), view.period)}
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
            kind={item.task ? 'done' : item.run ? 'run' : 'commit'}
            time="day"
            plain
          />
        ))}
        {area.commitsMore > 0 && (
          <li className="pl-6 text-meta text-muted-foreground">
            {t.moreCommits(area.commitsMore, area.repos)}
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
  const t = useText(text)
  const month = view.month!
  const lines = [
    month.started.length > 0 && [t.started, month.started.join(', ')],
    month.quiet.length > 0 && [t.wentQuiet, month.quiet.join(', ')],
    month.people.length > 0 && [t.askedMostBy, month.people.join(', ')],
  ].filter((line): line is [string, string] => Boolean(line))
  if (lines.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-1 rounded-xl bg-well px-3.5 py-2.5">
      {lines.map(([label, text]) => (
        <div
          key={label}
          className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-body"
        >
          <span className="text-meta text-muted-foreground">{label}</span>
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
  const t = useText(text)
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
          <span className={cn(commit ? 'font-mono text-meta' : 'font-medium')}>
            {item.title}
          </span>
        )}
        {!plain && item.area && (
          <a
            href={areaHash(item.area.id)}
            className="rounded-full bg-muted px-2 py-px text-caption hover:text-foreground"
          >
            {item.area.name}
          </a>
        )}
        {(item.note || at) && (
          <span className="text-meta text-muted-foreground">
            {[kind === 'carried' ? t.carriesOver : undefined, item.note, at]
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
        <h2 className="text-section">{title}</h2>
        {meta && (
          <span className="text-meta text-muted-foreground">{meta}</span>
        )}
      </div>
      <ul className="flex flex-col gap-2 border-t border-border pt-2.5">
        {children}
      </ul>
    </section>
  )
}

const Quiet = ({ children }: { children: React.ReactNode }) => (
  <li className="text-copy text-muted-foreground">{children}</li>
)

/** Where the recap comes from, at its foot */
function Sources({ view }: { view: RecapView }) {
  const t = useText(text)
  const { totals } = view
  const parts = [
    totals.done > 0 && t.tasksDone(totals.done),
    totals.commits > 0 && t.commits(totals.commits, view.emails),
    totals.runs > 0 && t.runs(totals.runs),
  ].filter((part): part is string => Boolean(part))
  if (parts.length === 0) return null
  return (
    <p className="mt-5 border-t border-border pt-3.5 text-meta text-muted-foreground">
      {t.from(parts)}
    </p>
  )
}
