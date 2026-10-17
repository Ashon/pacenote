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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  SkeletonBlock,
  SkeletonText,
  SkeletonWord,
} from '@/components/ui/skeleton'
import { formatRelative, formatShortDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  accountsSentence,
  areaHash,
  partKey,
  ROLE_LABEL,
  useFixYou,
  useYou,
} from '@/lib/you'
import { taskHash } from '@/lib/tasks'

const TOOL = { claude: 'Claude Code', codex: 'Codex' } as const

const go = (hash: string) => {
  window.location.hash = hash
}

/**
 * You: where you contribute and what is going on in each area, from your
 * tasks and your Claude Code and Codex sessions (src/you). An area opens in
 * its row (#/you/<id>), one at a time, with how you contribute to it and what
 * shows it, what is open, what you did lately and who asks you most. You
 * shape the areas here: rename one, take a part out, merge two, or say one is
 * not yours anymore.
 */
export function YouPage({ openId }: { openId?: string }) {
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
      <Page>
        <p className="mt-6 text-sm text-muted-foreground">
          Your areas are counted by the desktop app.
        </p>
      </Page>
    )
  const data = you.data
  // Until your areas are counted: the intro, and the list's place as it will
  // be
  if (!data)
    return (
      <Page meta={<SkeletonWord width="4.5rem" />}>
        <Intro key="intro" />
        <Placeholder
          key="list"
          ready={false}
          skeleton={<AreaRowsSkeleton count={lastAreas()} />}
        />
      </Page>
    )
  const active = data.areas.filter((area) => area.state === 'active')
  rememberAreas(active.length)
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
      meta={
        data.areas.length > 0 && (
          <>
            {active.length} {active.length === 1 ? 'area' : 'areas'}
            {resting.length > 0 && ` · ${resting.length} resting`}
          </>
        )
      }
    >
      <Intro key="intro" />
      {notice.mounted && (
        <div
          ref={notice.ref}
          data-state={notice.state}
          className="motion-fade mt-4 flex items-center gap-3 rounded-xl bg-card-accent px-4 py-3 text-sm"
        >
          <span className="flex-1">
            {said.current?.name} is not listed as yours anymore.
          </span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              if (said.current) void fix.leave(said.current.id, false)
              setLeft(undefined)
            }}
          >
            Undo
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close"
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
          <p className="mt-5 border-t border-border py-8 text-sm text-muted-foreground">
            Nothing yet. Your areas show up once you have tasks here, or work in
            a repository with Claude Code or Codex.
          </p>
        ) : (
          <ul className="mt-5">{active.map(row)}</ul>
        )}
        {resting.length > 0 && (
          <>
            <div className="mt-6 flex items-baseline gap-2.5 border-t border-border pt-4">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Resting
              </h2>
              <span className="text-xs text-muted-foreground">
                Nothing for 4 weeks. They come back when work does.
              </span>
            </div>
            <ul className="mt-1">{resting.map(row)}</ul>
          </>
        )}
        {accounts && data.areas.length > 0 && (
          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            Kept as {accounts}.
          </p>
        )}
      </Placeholder>
    </Page>
  )
}

const Intro = () => (
  <p className="mt-1.5 text-body text-muted-foreground">
    Where you contribute and what is going on in each, from your tasks and your
    Claude Code and Codex sessions.
  </p>
)

/** How many areas there were last time: the skeleton's rows */
const AREAS_KEY = 'pacenote.you.rows'

function lastAreas(): number {
  try {
    const rows = Number(localStorage.getItem(AREAS_KEY))
    return rows > 0 ? Math.min(rows, 6) : 3
  } catch {
    return 3
  }
}

function rememberAreas(rows: number) {
  try {
    localStorage.setItem(AREAS_KEY, String(rows))
  } catch {
    // Without storage the skeleton has three rows.
  }
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
                <SkeletonText className="text-sm leading-snug" width={name} />
                <SkeletonText
                  className="mt-1 font-mono text-xs"
                  width={parts}
                />
                <SkeletonText className="mt-1 text-xs" width={now} />
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
  const [renaming, setRenaming] = useState(false)
  const [merging, setMerging] = useState(false)
  const row = useRef<HTMLLIElement>(null)
  const resting = area.state === 'resting'
  const open_ = area.now.length

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
                      'group flex items-center gap-2 rounded-sm text-left text-sm leading-snug font-semibold outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50',
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
                  className="rounded-full bg-muted px-2 py-px text-2xs font-medium text-foreground/80"
                >
                  {ROLE_LABEL[role.role]}
                </span>
              ))}
            </div>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {area.parts.map((part) => part.label).join(' · ')}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              {area.working && (
                <span className="inline-flex items-center gap-1.5 font-medium text-status-running">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-status-running" />
                  Working in {TOOL[area.working.tool]}
                </span>
              )}
              {resting ? (
                <span>
                  {area.lastActiveAt
                    ? `Last worked ${formatShortDay(area.lastActiveAt)}`
                    : 'Nothing lately'}
                </span>
              ) : (
                <span>
                  {open_ === 0
                    ? 'Nothing open'
                    : `${open_} open ${open_ === 1 ? 'task' : 'tasks'}`}
                </span>
              )}
              {area.people.length > 0 && !resting && (
                <span>{names(area.people)} ask you most</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Bars weeks={area.weeks} faded={resting} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`More for ${area.name}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  Rename
                </DropdownMenuItem>
                {others.length > 0 && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setMerging(true)
                      if (!open) onToggle()
                    }}
                  >
                    Merge into another area
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLeave}>
                  Not mine anymore
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <CollapsibleContent>
          <div className="flex flex-col gap-2 pt-2.5 pl-6">
            <div className="flex flex-col gap-0.5 rounded-xl bg-well px-3.5 py-3">
              {merging && (
                <Line label="Merge into">
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
                    Cancel
                  </Button>
                </Line>
              )}
              <Line label="Roles">
                {area.roles.length === 0 ? (
                  <span className="text-muted-foreground">
                    Not enough work here yet to tell.
                  </span>
                ) : (
                  area.roles.map((role) => (
                    <span
                      key={role.role}
                      className="inline-flex items-center gap-2 pr-2"
                    >
                      <span className="rounded-full bg-card px-2 py-px text-2xs font-medium">
                        {ROLE_LABEL[role.role]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {role.evidence}
                      </span>
                    </span>
                  ))
                )}
              </Line>
              <Line label="Now">
                {area.now.length === 0 ? (
                  <span className="text-muted-foreground">Nothing open.</span>
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
                        <span className="text-xs text-muted-foreground">
                          {[
                            task.askedBy && `${task.askedBy} asked you`,
                            task.due && `due ${task.due}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </Line>
              <Line label="Lately">
                {area.lately.length === 0 ? (
                  <span className="text-muted-foreground">
                    Nothing done here in the last 30 days.
                  </span>
                ) : (
                  <span className="flex flex-col gap-1">
                    {area.lately.map((task) => (
                      <span key={task.id} className="flex flex-wrap gap-x-2">
                        <span className="font-semibold">{task.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {[task.outcome, formatRelative(task.at)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    ))}
                    <a
                      href="#/recap/week"
                      className="text-xs text-primary hover:underline"
                    >
                      {area.latelyMore > 0
                        ? `and ${area.latelyMore} more in 30 days, in Recap`
                        : 'This week in Recap'}
                    </a>
                  </span>
                )}
              </Line>
              <Line label="Made of">
                {area.parts.map((part) => (
                  <span
                    key={partKey(part)}
                    className="inline-flex h-6 items-center gap-0.5 rounded-full bg-card pr-0.5 pl-2 font-mono text-xs"
                  >
                    {part.label}
                    {area.parts.length > 1 ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="size-5 rounded-full"
                        aria-label={`Take ${part.label} out of ${area.name}`}
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
  const [value, setValue] = useState(name)
  const done = useRef(false)
  const finish = (next: string | undefined) => {
    if (done.current) return
    done.current = true
    onDone(next?.trim() || undefined)
  }
  return (
    <input
      aria-label="Area name"
      autoFocus
      value={value}
      maxLength={60}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(value)
        if (event.key === 'Escape') finish(undefined)
      }}
      className="h-7 w-56 rounded-md border border-input bg-background px-2 text-sm font-semibold outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
    />
  )
}

/** An area's work each week, the last 8, in the brand's bars */
function Bars({ weeks, faded }: { weeks: number[]; faded: boolean }) {
  const top = Math.max(1, ...weeks)
  const total = weeks.reduce((sum, n) => sum + n, 0)
  return (
    <span
      role="img"
      aria-label={`${total} tasks and sessions over 8 weeks`}
      title="Tasks and sessions each week, the last 8 weeks"
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
      <span className="pt-0.5 text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {children}
      </span>
    </div>
  )
}

const names = (list: string[]) =>
  list.length <= 1
    ? (list[0] ?? '')
    : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`

function Page({
  meta,
  children,
}: {
  meta?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <ScrollArea className="h-full">
      <div className="@container mx-auto max-w-4xl px-10 py-9">
        <header className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">You</h1>
          {meta && (
            <span className="text-sm text-muted-foreground">{meta}</span>
          )}
        </header>
        {children}
      </div>
    </ScrollArea>
  )
}
