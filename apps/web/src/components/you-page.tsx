import { CLI_NAMES } from '@src/tasks/own-ai'
import type { AreaView } from '@src/you/types'
import { ChevronRight, MoreHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Placeholder, usePresence } from '@/components/ui/motion'
import {
  SkeletonBlock,
  SkeletonText,
  SkeletonWord,
} from '@/components/ui/skeleton'
import { formatRelative, formatShortDay } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { readStored, writeStored } from '@/lib/storage'
import { cn, go } from '@/lib/utils'
import {
  accountsSentence,
  areaHash,
  partKey,
  roleLabel,
  useFixYou,
  useYou,
} from '@/lib/you'
import { taskHash } from '@/lib/tasks'
import { Page } from './page'
import { text } from './you-page.text'

/**
 * You: where you contribute and what is going on in each area, from your
 * tasks and your Claude Code and Codex sessions (src/you). An area opens in
 * its row (#/you/<id>), one at a time, with how you contribute to it and what
 * shows it, what is open, what you did lately and who asks you most. You
 * shape the areas here: rename one, take a part out, merge two, or say one is
 * not yours anymore.
 */
export function YouPage({ openId }: { openId?: string }) {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.you
  const you = useYou()
  const fix = useFixYou()
  // An area you just said is not yours, to take it back
  const [left, setLeft] = useState<{ id: string; name: string }>()
  const notice = usePresence(Boolean(left))
  const said = useRef(left)
  if (left) said.current = left

  if (!bridge)
    return (
      <Page title={t.title}>
        <p className="mt-6 text-copy text-muted-foreground">{t.desktopOnly}</p>
      </Page>
    )
  const data = you.data
  // Until your areas are counted: the intro, and the list's place as it will
  // be
  if (!data)
    return (
      <Page title={t.title} meta={<SkeletonWord width="4.5rem" />}>
        <Intro key="intro" />
        <Placeholder
          key="list"
          ready={false}
          skeleton={<AreaRowsSkeleton count={lastAreas()} />}
        />
      </Page>
    )
  const active = data.areas.filter((area) => area.state === 'active')
  writeStored(AREAS_KEY, String(active.length))
  const resting = data.areas.filter((area) => area.state === 'resting')
  const accounts = accountsSentence(data.accounts)
  const row = (area: AreaView) => (
    <AreaRow
      key={area.id}
      area={area}
      others={active.filter((other) => other.id !== area.id)}
      open={area.id === openId}
      onToggle={() => go(area.id === openId ? '#/you' : areaHash(area.id))}
      onRename={(name) => void fix.rename(area.id, name)}
      onTakeOut={(part) => void fix.takeOut(area.id, part)}
      onMerge={(into) => {
        void fix.merge(area.id, into)
        go(areaHash(into))
      }}
      onLeave={() => {
        void fix.leave(area.id, true)
        setLeft({ id: area.id, name: area.name })
        if (area.id === openId) go('#/you')
      }}
    />
  )

  return (
    <Page
      title={t.title}
      meta={data.areas.length > 0 && t.areas(active.length, resting.length)}
    >
      <Intro key="intro" />
      {notice.mounted && (
        <div
          ref={notice.ref}
          data-state={notice.state}
          className="motion-fade mt-4 flex items-center gap-3 rounded-xl bg-card-accent px-4 py-3 text-copy"
        >
          <span className="flex-1">{t.notYours(said.current?.name ?? '')}</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              if (said.current) void fix.leave(said.current.id, false)
              setLeft(undefined)
            }}
          >
            {t.undo}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t.close}
            onClick={() => setLeft(undefined)}
          >
            <X />
          </Button>
        </div>
      )}
      <Placeholder
        key="list"
        ready
        skeleton={<AreaRowsSkeleton count={lastAreas()} />}
      >
        {data.areas.length === 0 ? (
          <p className="mt-5 border-t border-border py-8 text-copy text-muted-foreground">
            {t.empty}
          </p>
        ) : (
          <ul className="mt-5">{active.map(row)}</ul>
        )}
        {resting.length > 0 && (
          <>
            <div className="mt-6 flex items-baseline gap-2.5 border-t border-border pt-4">
              <h2 className="text-section text-muted-foreground">
                {t.resting}
              </h2>
              <span className="text-meta text-muted-foreground">
                {t.restingHint}
              </span>
            </div>
            <ul className="mt-1">{resting.map(row)}</ul>
          </>
        )}
        {accounts && data.areas.length > 0 && (
          <p className="mt-5 border-t border-border pt-4 text-meta text-muted-foreground">
            {t.keptAs(accounts)}
          </p>
        )}
      </Placeholder>
    </Page>
  )
}

function Intro() {
  const t = useText(text)
  return <p className="mt-1.5 text-body text-muted-foreground">{t.intro}</p>
}

/** How many areas there were last time: the skeleton's rows */
const AREAS_KEY = 'pacenote.you.rows'

function lastAreas(): number {
  const rows = Number(readStored(AREAS_KEY))
  return rows > 0 ? Math.min(rows, 6) : 3
}

/** Widths for skeleton rows, so they do not read as one block */
const AREA_WIDTHS = [
  ['30%', '52%', '38%'],
  ['24%', '34%', '30%'],
  ['36%', '44%', '26%'],
]

/**
 * The list's place while your areas are counted: rows as tall as an area's
 * (its name, its parts and what is going on, and its 8 weeks on the right)
 */
function AreaRowsSkeleton({ count }: { count: number }) {
  return (
    <ul className="mt-5">
      {Array.from({ length: count }, (_, i) => {
        const [name, parts, now] = AREA_WIDTHS[i % AREA_WIDTHS.length]!
        return (
          <li key={i} className="border-t border-border py-3.5">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1 pl-6">
                <SkeletonText className="text-copy leading-snug" width={name} />
                <SkeletonText
                  className="mt-1 font-mono text-meta"
                  width={parts}
                />
                <SkeletonText className="mt-1 text-meta" width={now} />
              </div>
              <SkeletonBlock className="h-8 w-[77px] rounded-md" />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function AreaRow({
  area,
  others,
  open,
  onToggle,
  onRename,
  onTakeOut,
  onMerge,
  onLeave,
}: {
  area: AreaView
  /** The other areas, to merge it into */
  others: AreaView[]
  open: boolean
  onToggle: () => void
  onRename: (name: string) => void
  onTakeOut: (part: string) => void
  onMerge: (into: string) => void
  onLeave: () => void
}) {
  const t = useText(text)
  const [renaming, setRenaming] = useState(false)
  const [merging, setMerging] = useState(false)
  const row = useRef<HTMLLIElement>(null)
  const resting = area.state === 'resting'

  // Opened from a link, the row comes into view.
  useEffect(() => {
    if (open) row.current?.scrollIntoView({ block: 'nearest' })
    else setMerging(false)
  }, [open])

  return (
    <li
      ref={row}
      data-area-row={area.id}
      className="border-t border-border py-3.5"
    >
      <Collapsible open={open} onOpenChange={() => onToggle()}>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 pl-6">
            <div className="-ml-6 flex flex-wrap items-center gap-2">
              {renaming ? (
                <Rename
                  name={area.name}
                  onDone={(name) => {
                    setRenaming(false)
                    if (name && name !== area.name) onRename(name)
                  }}
                />
              ) : (
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'group flex items-center gap-2 rounded-sm text-left text-section leading-snug outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      resting && 'text-muted-foreground'
                    )}
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-primary',
                        open && 'rotate-90'
                      )}
                    />
                    {area.name}
                  </button>
                </CollapsibleTrigger>
              )}
              {area.roles.map((role) => (
                <span
                  key={role.role}
                  title={role.evidence}
                  className="rounded-full bg-muted px-2 py-px text-caption text-foreground/80"
                >
                  {roleLabel(role.role)}
                </span>
              ))}
            </div>
            <p className="mt-1 truncate font-mono text-meta text-muted-foreground">
              {area.parts.map((part) => part.label).join(' · ')}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-muted-foreground">
              {area.working && (
                <span className="inline-flex items-center gap-1.5 font-medium text-status-running">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-status-running" />
                  {t.workingIn(CLI_NAMES[area.working.tool])}
                </span>
              )}
              <span>
                {resting
                  ? area.lastActiveAt
                    ? t.lastWorked(formatShortDay(area.lastActiveAt))
                    : t.nothingLately
                  : area.now.length
                    ? t.openTasks(area.now.length)
                    : t.nothingOpenShort}
              </span>
              {area.people.length > 0 && !resting && (
                <span>{t.askYouMost(area.people)}</span>
              )}
            </p>
            {/* A phone's narrow row: its 8 weeks under what it says */}
            <div className="mt-2 hidden @max-[30rem]:flex">
              <Bars weeks={area.weeks} faded={resting} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex @max-[30rem]:hidden">
              <Bars weeks={area.weeks} faded={resting} />
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t.moreFor(area.name)}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  {t.rename}
                </DropdownMenuItem>
                {others.length > 0 && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setMerging(true)
                      if (!open) onToggle()
                    }}
                  >
                    {t.mergeIntoAnother}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLeave}>
                  {t.notMine}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <CollapsibleContent>
          <div className="flex flex-col gap-2 pt-2.5 pl-6">
            <div className="flex flex-col gap-0.5 rounded-xl bg-well px-3.5 py-3">
              {merging && (
                <Line label={t.mergeInto}>
                  {others.map((other) => (
                    <Button
                      key={other.id}
                      size="xs"
                      variant="outline"
                      onClick={() => onMerge(other.id)}
                    >
                      {other.name}
                    </Button>
                  ))}
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setMerging(false)}
                  >
                    {t.cancel}
                  </Button>
                </Line>
              )}
              <Line label={t.roles}>
                {area.roles.length === 0 ? (
                  <span className="text-muted-foreground">{t.notEnough}</span>
                ) : (
                  area.roles.map((role) => (
                    <span
                      key={role.role}
                      className="inline-flex items-center gap-2 pr-2"
                    >
                      <span className="rounded-full bg-card px-2 py-px text-caption">
                        {roleLabel(role.role)}
                      </span>
                      <span className="text-meta text-muted-foreground">
                        {role.evidence}
                      </span>
                    </span>
                  ))
                )}
              </Line>
              <Line label={t.now}>
                {area.now.length === 0 ? (
                  <span className="text-muted-foreground">{t.nothingOpen}</span>
                ) : (
                  <span className="flex flex-col gap-1">
                    {area.now.map((task) => (
                      <span key={task.id} className="flex flex-wrap gap-x-2">
                        <a
                          href={taskHash(task.id)}
                          className="font-semibold text-foreground hover:text-primary hover:underline"
                        >
                          {task.title}
                        </a>
                        <span className="text-meta text-muted-foreground">
                          {[
                            task.askedBy && t.askedYou(task.askedBy),
                            task.due && t.due(task.due),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </Line>
              <Line label={t.lately}>
                {area.lately.length === 0 ? (
                  <span className="text-muted-foreground">{t.nothingDone}</span>
                ) : (
                  <span className="flex flex-col gap-1">
                    {area.lately.map((task) => (
                      <span key={task.id} className="flex flex-wrap gap-x-2">
                        <span className="font-semibold">{task.title}</span>
                        <span className="text-meta text-muted-foreground">
                          {[task.outcome, formatRelative(task.at)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    ))}
                    <a
                      href="#/recap/week"
                      className="text-meta text-primary hover:underline"
                    >
                      {area.latelyMore > 0
                        ? t.moreInRecap(area.latelyMore)
                        : t.thisWeekInRecap}
                    </a>
                  </span>
                )}
              </Line>
              <Line label={t.madeOf}>
                {area.parts.map((part) => (
                  <span
                    key={partKey(part)}
                    className="inline-flex h-6 items-center gap-0.5 rounded-full bg-card pr-0.5 pl-2 font-mono text-meta"
                  >
                    {part.label}
                    {area.parts.length > 1 ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="size-5 rounded-full"
                        aria-label={t.takeOut(part.label, area.name)}
                        onClick={() => onTakeOut(partKey(part))}
                      >
                        <X />
                      </Button>
                    ) : (
                      <span className="w-1.5" />
                    )}
                  </span>
                ))}
              </Line>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

/** Renaming an area in its row: Enter or leaving it saves, Esc keeps it */
function Rename({
  name,
  onDone,
}: {
  name: string
  onDone: (name: string | undefined) => void
}) {
  const t = useText(text)
  const [value, setValue] = useState(name)
  const done = useRef(false)
  const finish = (next: string | undefined) => {
    if (done.current) return
    done.current = true
    onDone(next?.trim() || undefined)
  }
  return (
    <input
      aria-label={t.areaName}
      autoFocus
      value={value}
      maxLength={60}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(value)
        if (event.key === 'Escape') finish(undefined)
      }}
      className="h-7 w-56 rounded-md border border-input bg-background px-2 text-section outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
    />
  )
}

/** An area's work each week, the last 8, in the brand's bars */
function Bars({ weeks, faded }: { weeks: number[]; faded: boolean }) {
  const t = useText(text)
  const top = Math.max(1, ...weeks)
  const total = weeks.reduce((sum, n) => sum + n, 0)
  return (
    <span
      role="img"
      aria-label={t.weeks(total)}
      title={t.weeksTitle}
      className={cn('flex h-8 items-end gap-[3px]', faded && 'opacity-45')}
    >
      {weeks.map((n, i) => (
        <span
          key={i}
          className={cn(
            'w-[7px] rounded-full',
            n > 0 ? 'pacenote-gradient' : 'h-[3px] bg-muted'
          )}
          style={n > 0 ? { height: `${Math.max(4, (n / top) * 32)}px` } : {}}
        />
      ))}
    </span>
  )
}

function Line({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-[30px] grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 py-1 text-body">
      <span className="pt-0.5 text-meta text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {children}
      </span>
    </div>
  )
}
