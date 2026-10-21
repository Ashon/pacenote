import { newTokens } from '@history/usage'
import { CLI_NAMES, type OwnCli } from '@src/tasks/own-ai'
import type { TasksLive } from '@src/tasks/types'
import type { CollectionRecord, TaskView, TasksCollect } from '@src/tasks/types'
import {
  ArrowRightLeft,
  ChevronRight,
  History,
  LoaderCircle,
  RefreshCw,
  Settings,
  SquareTerminal,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  type ListEntry,
  Placeholder,
  Swap,
  useListMotion,
  usePresence,
} from '@/components/ui/motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonText, SkeletonWord } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  formatHourMinute,
  formatRelative,
  formatShortDay,
  formatTokens,
} from '@/lib/format'
import {
  taskHash,
  useCollect,
  useDecide,
  useTasks,
  useTasksLive,
} from '@/lib/tasks'
import { macNamed, useMacs } from '@/lib/macs'
import { cn } from '@/lib/utils'
import { useYou } from '@/lib/you'
import { switchLine } from './own-ai-status'
import { PaceSpinner } from './pace-spinner'
import { TaskRow } from './task-row'
import {
  lastYourWork,
  rememberYourWork,
  YourWork,
  YourWorkSkeleton,
} from './your-work'

type Tab = 'open' | 'maybe' | 'done'

/** The tab a task is listed under */
const tabOf = (task: TaskView): Tab =>
  task.status === 'open' ? 'open' : task.status === 'maybe' ? 'maybe' : 'done'

const go = (hash: string) => {
  window.location.hash = hash
}

/** The leave-out offers you turned down, per channel, in this browser */
const OFFERS_KEY = 'pacenote.tasks.leave-out-declined'

function declinedOffers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OFFERS_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** How many open tasks there were last time: the skeleton's rows */
const ROWS_KEY = 'pacenote.tasks.rows'

function lastRows(): number {
  try {
    const rows = Number(localStorage.getItem(ROWS_KEY))
    return rows > 0 ? Math.min(rows, 8) : 3
  } catch {
    return 3
  }
}

/**
 * Your own tasks, gathered from Slack (docs/proposals/personal-tasks.md): the
 * open ones, the Maybes kept aside, and what is settled. An AI tool with a
 * Slack connector collects them through Pacenote's MCP server; Done and
 * Dismiss are one click. A task opens in its row (#/tasks/<id>), one at a
 * time: up and down step through the list, Esc closes it.
 *
 * The list moves only for what you do: a settled task leaves its tab
 * (settle), and tasks that come in while you look, from a collection or an AI
 * tool, wait behind a notice that shows them (arrive), so the rows you are
 * reading stay put.
 */
export function TasksPage({
  openId,
  logEntry,
}: {
  /** The task open in its row */
  openId?: string
  /** A session's log over the list */
  logEntry?: string
}) {
  const bridge = window.pacenoteDesktop?.tasks
  const tasks = useTasks()
  // What AI tools are doing with your tasks now, over MCP
  const live = useTasksLive().data
  // Where you contribute: shown once above the tasks after a collection
  const you = useYou().data
  // Your other Macs, by name, for what they did
  const macs = useMacs()
  const decide = useDecide()
  const [tab, setTab] = useState<Tab>('open')
  const [declined, setDeclined] = useState(declinedOffers)
  // The open task and the tab it was opened in: settled meanwhile (in its
  // session, say), it stays where it was until it is closed.
  const [held, setHeld] = useState<{ id: string; tab: Tab }>()
  const data = tasks.data
  // The tasks you have seen listed. Others that come into the tab wait for
  // you to show them; moving to a tab shows all of its tasks.
  const [seen, setSeen] = useState<ReadonlySet<string>>()
  // The first of them once shown, brought into view
  const [revealed, setRevealed] = useState<string>()
  const ids = data?.tasks.map((task) => task.id) ?? []
  if (data && !seen) setSeen(new Set(ids))
  const showAll = () => setSeen(new Set(ids))

  // A task opened from a link shows under its own tab.
  useEffect(() => {
    if (!openId) {
      setHeld(undefined)
      return
    }
    if (held?.id === openId) return
    const task = data?.tasks.find((each) => each.id === openId)
    if (!task) return
    setTab(tabOf(task))
    setHeld({ id: openId, tab: tabOf(task) })
  }, [openId, data, held])

  if (!bridge)
    return (
      <Page>
        <p className="mt-6 text-copy text-muted-foreground">
          Tasks are gathered by the desktop app.
        </p>
      </Page>
    )
  // Until the tasks come, and your areas (their card, shown once after a
  // collection, sits above the tabs): the header, the tabs and the list's
  // place, as they will be, and the card's if it showed last time
  const youKnown = !window.pacenoteDesktop?.you || you !== undefined
  if (!data || !youKnown) {
    const card = lastYourWork()
    return (
      <Page
        meta={<SkeletonWord width="9rem" />}
        action={<CollectButton running={false} />}
      >
        {card && (
          <Placeholder
            key="your-work"
            ready={false}
            skeleton={<YourWorkSkeleton {...card} />}
          />
        )}
        <TaskTabs key="tabs" tab={tab} onTab={setTab} />
        <Placeholder
          key="list"
          ready={false}
          skeleton={<TaskRowsSkeleton count={lastRows()} />}
        />
      </Page>
    )
  }
  if (!data.settings.on)
    return (
      <Page>
        <Setup />
      </Page>
    )

  const open = data.tasks.filter((task) => task.status === 'open')
  rememberRows(open.length)
  rememberYourWork(data.collectedAt ? you : undefined)
  const maybe = data.tasks.filter((task) => task.status === 'maybe')
  const kept = (task: TaskView) =>
    task.id === openId && held?.id === openId && held.tab === tab
  const listed = data.tasks.filter((task) => tabOf(task) === tab || kept(task))
  if (tab === 'done')
    listed.sort(
      (a, b) =>
        (Date.parse(b.settledAt ?? '') || 0) -
        (Date.parse(a.settledAt ?? '') || 0)
    )
  // New tasks wait unless there is nothing in the list for them to move
  const isNew = (task: TaskView) =>
    seen !== undefined && !seen.has(task.id) && task.id !== openId
  const waiting = listed.some((task) => !isNew(task))
    ? listed.filter(isNew)
    : []
  const shown = listed.filter((task) => !waiting.includes(task))
  if (seen && shown.some((task) => !seen.has(task.id)))
    setSeen(new Set([...seen, ...shown.map((task) => task.id)]))

  // Up and down step through the tasks (the open one follows); Esc closes it.
  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
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
  const offer =
    data.leaveOut && !declined.includes(data.leaveOut.conversation)
      ? data.leaveOut
      : undefined

  const decline = (conversation: string) => {
    const next = [...declined, conversation]
    setDeclined(next)
    try {
      localStorage.setItem(OFFERS_KEY, JSON.stringify(next))
    } catch {
      // Without storage the offer comes back next time.
    }
  }

  return (
    <Page
      meta={
        <>
          {open.length} open
          {data.collectedAt &&
            ` · collected ${formatRelative(data.collectedAt)}${
              data.collect.last?.mac
                ? ` on ${macNamed(macs, data.collect.last.mac)}`
                : ''
            }`}
        </>
      }
      action={
        <CollectButton
          running={Boolean(data.collect.running)}
          elsewhere={data.collect.elsewhere?.name}
        />
      }
    >
      <StatusLine
        collect={data.collect}
        live={live}
        titleOf={(id) => data.tasks.find((task) => task.id === id)?.title}
      />
      <YourWork you={data.collectedAt ? you : undefined} />
      {offer && (
        <Banner tone="note">
          <span className="flex-1">
            You dismissed {offer.count} tasks from {offer.label} as not for you.
            Leave {offer.label} out?
          </span>
          <Button size="xs" onClick={() => void bridge.leaveOut(offer.label)}>
            Leave it out
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => decline(offer.conversation)}
          >
            Not now
          </Button>
        </Banner>
      )}

      <TaskTabs
        key="tabs"
        tab={tab}
        onTab={(value) => {
          setTab(value)
          showAll()
        }}
        counts={{ open: open.length, maybe: maybe.length }}
      />

      {/* Another tab's list takes this one's place (swap) */}
      <Placeholder
        key="list"
        ready
        skeleton={<TaskRowsSkeleton count={lastRows()} />}
      >
        <Swap id={tab}>
          <NewTasks
            count={waiting.length}
            onShow={() => {
              showAll()
              setRevealed(waiting[0]?.id)
            }}
          />
          {tab === 'maybe' && (
            <p className="mt-3 text-meta text-muted-foreground">
              Guesses Pace is not sure about. They stay out of the list until
              you keep one.
            </p>
          )}
          <TaskList
            tasks={shown}
            onKeyDown={onKeyDown}
            revealed={revealed}
            row={(task, motion) => (
              <TaskRow
                key={task.id}
                task={task}
                motion={motion}
                cli={data.settings.cli}
                opensIn={data.settings.opensIn}
                working={data.working?.[task.id]}
                live={live?.working[task.id]}
                proposal={data.proposals?.[task.id]}
                area={data.areas?.[task.id]}
                askGroup={
                  task.status === 'maybe' &&
                  task.group &&
                  !data.groups?.yours.includes(task.group) &&
                  !data.groups?.notYours.includes(task.group)
                    ? task.group
                    : undefined
                }
                follows={
                  task.follows
                    ? data.tasks.find((each) => each.id === task.follows)?.title
                    : undefined
                }
                open={task.id === openId}
                gone={tabOf(task) !== tab}
                logEntry={task.id === openId ? logEntry : undefined}
                onToggle={() =>
                  go(task.id === openId ? '#/tasks' : taskHash(task.id))
                }
                onDecide={(decision) => void decide(task.id, decision)}
              />
            )}
          />
          {shown.length === 0 && (
            <p className="border-t border-border py-8 text-copy text-muted-foreground">
              {tab === 'open'
                ? data.collectedAt
                  ? 'Nothing open. The next collection reads what is new since this one.'
                  : 'Nothing yet. A first collection reads the last 7 days.'
                : tab === 'maybe'
                  ? 'No Maybes.'
                  : 'Nothing settled in the last 14 days.'}
            </p>
          )}
          {tab === 'done' && data.dismissRate !== undefined && (
            <p className="mt-4 text-meta text-muted-foreground">
              You dismissed {Math.round(data.dismissRate * 100)}% of the tasks
              you settled. Above about 30%, Pace is picking too loosely.
            </p>
          )}
        </Swap>
      </Placeholder>

      <RecentCollections collections={data.collections ?? []} />
    </Page>
  )
}

function rememberRows(rows: number) {
  try {
    localStorage.setItem(ROWS_KEY, String(rows))
  } catch {
    // Without storage the skeleton has three rows.
  }
}

/** Open, Maybe and Done, with their counts once the tasks are in */
function TaskTabs({
  tab,
  onTab,
  counts,
}: {
  tab: Tab
  onTab: (tab: Tab) => void
  counts?: { open: number; maybe: number }
}) {
  return (
    <Tabs value={tab} onValueChange={(value) => onTab(value as Tab)}>
      <TabsList className="mt-5">
        <TabsTrigger value="open">
          Open {counts ? counts.open : <SkeletonWord />}
        </TabsTrigger>
        <TabsTrigger value="maybe">
          Maybe {counts ? counts.maybe : <SkeletonWord />}
        </TabsTrigger>
        <TabsTrigger value="done">Done</TabsTrigger>
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
function TaskRowsSkeleton({ count }: { count: number }) {
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
function TaskList({
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
 * Tasks that came in while you were looking, from a collection or an AI tool:
 * a notice on the tabs' line, clear of the rows, that shows them where they
 * belong. It slides in from above (pop) and stays in view as you scroll.
 */
function NewTasks({ count, onShow }: { count: number; onShow: () => void }) {
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
          {said.current} new {said.current === 1 ? 'task' : 'tasks'}
        </button>
      )}
    </div>
  )
}

function Page({
  meta,
  action,
  children,
}: {
  meta?: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <ScrollArea className="h-full">
      <div className="@container mx-auto max-w-4xl px-10 py-9">
        <header className="flex items-center gap-3">
          <h1 className="text-title">Todo</h1>
          {meta && (
            <span className="text-copy text-muted-foreground">{meta}</span>
          )}
          <span className="flex-1" />
          {action}
        </header>
        {children}
      </div>
    </ScrollArea>
  )
}

function Banner({ children }: { tone: 'note'; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-card-accent px-4 py-3 text-copy">
      {children}
    </div>
  )
}

/**
 * Collect now, or Stop while a collection runs. While another of your Macs
 * collects, it waits for that one.
 */
function CollectButton({
  running,
  elsewhere,
}: {
  running: boolean
  /** Another of your Macs collecting now */
  elsewhere?: string
}) {
  const { collect, stop } = useCollect()
  if (elsewhere && !running)
    return (
      <Button size="sm" variant="secondary" disabled>
        <LoaderCircle className="animate-spin" />
        Collecting on {elsewhere}
      </Button>
    )
  if (running)
    return (
      <div className="flex items-center gap-1">
        {/* The status line under the title shows Pace at work. */}
        <Button size="sm" variant="secondary" disabled>
          Collecting
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void stop()}>
          Stop
        </Button>
      </div>
    )
  return (
    <Button size="sm" onClick={() => void collect()}>
      <RefreshCw />
      Collect now
    </Button>
  )
}

/** An AI tool's name, from its MCP client name ("claude-code") */
function toolOf(client: string | undefined): string {
  if (!client) return 'An AI tool'
  if (/claude/i.test(client)) return 'Claude Code'
  if (/codex/i.test(client)) return 'Codex'
  return client
}

/** What an AI tool is doing with your tasks, or just did, in a sentence */
function liveLine(
  live: TasksLive | null | undefined,
  titleOf: (id: string) => string | undefined
): { key: string; text: string; active: boolean } | undefined {
  if (!live) return undefined
  if (live.collecting) {
    const { by, since, added } = live.collecting
    return {
      key: `collect:${since}`,
      active: true,
      text: `${toolOf(by)} is collecting your tasks${added ? `: ${added} found so far` : ''}.`,
    }
  }
  const event = live.latest
  if (!event) return undefined
  const title = event.task ? titleOf(event.task) : undefined
  const it = title ? `\u201c${title}\u201d` : 'a task'
  const tool = toolOf(event.by)
  const text =
    event.kind === 'look'
      ? `${tool} is working on ${it}.`
      : event.kind === 'update'
        ? `${tool} updated ${it}.`
        : event.kind === 'close'
          ? `${tool} closed ${it}.`
          : event.kind === 'wrap-up'
            ? `${tool} wrote how ${it} ended.`
            : event.kind === 'follow-up'
              ? `${tool} kept ${it} for later.`
              : event.kind === 'add' && event.finished !== false
                ? event.added
                  ? `${tool} added ${event.added} ${event.added === 1 ? 'task' : 'tasks'}.`
                  : `${tool} found nothing new to add.`
                : undefined
  if (!text) return undefined
  return {
    key: `${event.kind}:${event.task ?? ''}:${event.at}`,
    active: event.kind === 'look',
    text,
  }
}

/**
 * The line under the title: a collection the app runs, or what an AI tool is
 * doing with your tasks over MCP as it does it, or how the app's last
 * collection ended. Each line gives way to the next (swap).
 */
function StatusLine({
  collect,
  live,
  titleOf,
}: {
  collect: TasksCollect
  live: TasksLive | null | undefined
  titleOf: (id: string) => string | undefined
}) {
  const line = collect.running ? undefined : liveLine(live, titleOf)
  return (
    <Swap id={collect.running ? 'collect' : (line?.key ?? 'last')}>
      {line ? (
        <p className="mt-1 flex items-center gap-2 text-copy text-muted-foreground">
          {/* In the spinner's place: the tool at work, or done */}
          <span className="flex size-6 shrink-0 items-center justify-center">
            {line.active ? (
              <span className="size-1.5 animate-pulse-dot rounded-full bg-status-running" />
            ) : (
              <SquareTerminal aria-hidden="true" className="size-3.5" />
            )}
          </span>
          <span className={cn('min-w-0', line.active && 'text-shimmer')}>
            {line.text}
          </span>
        </p>
      ) : (
        <CollectStatus collect={collect} />
      )}
    </Swap>
  )
}

/**
 * What the running collection is doing, or how the last one ended, and which
 * AI did it when the one chosen could not. Signed out, it offers that CLI's
 * sign-in in your terminal. When the work goes to the other AI mid-run, only
 * the words swap: Pace's mark keeps looking.
 */
function CollectStatus({ collect }: { collect: TasksCollect }) {
  const { running, last, elsewhere } = collect
  const macs = useMacs()
  // Why the terminal did not open, for the collection it was opened for
  const [signIn, setSignIn] = useState<{ at: string; error: string }>()
  const name = (cli: OwnCli | undefined) => (cli ? CLI_NAMES[cli] : 'Your AI')
  let text: string | undefined
  let spent: string | undefined
  if (running)
    text = running.reads
      ? `${name(running.by)} is reading Slack, read only: ${running.reads} lookups so far.`
      : `Starting ${name(running.by)}: Pacenote gives the collection its rules.`
  else if (elsewhere)
    text = `Collecting on ${elsewhere.name}. Its tasks come here when it is done.`
  else if (last?.ok) {
    const found = [
      last.added && `${last.added} ${last.added === 1 ? 'task' : 'tasks'}`,
      last.maybe && `${last.maybe} ${last.maybe === 1 ? 'Maybe' : 'Maybes'}`,
    ].filter(Boolean)
    const where = last.mac ? ` on ${macNamed(macs, last.mac)}` : ''
    text = found.length
      ? `Added ${found.join(' and ')}${where}.`
      : `Nothing new to add${where}.`
    if (last.skipped) text += ` ${last.skipped} left out by your settings.`
    if (last.usage)
      spent = `${formatTokens(newTokens(last.usage))} new tokens over ${last.reads ?? 0} Slack lookups${last.by ? ` by ${CLI_NAMES[last.by]}` : ''}.`
  }
  if (!text && !last) return null
  const switched = running ? running.switched : last?.switched
  // Who to sign in again: the CLI that ran, or the one it took over from
  const signOut: OwnCli | undefined = running
    ? undefined
    : last && !last.ok && last.signedOut
      ? last.by
      : last?.switched?.unable === 'auth'
        ? last.switched.from
        : undefined
  // Pace's mark looks around while a collection runs and eases into the logo
  // beside its result.
  return (
    <div data-collect-status>
      <div
        className={cn(
          'mt-1 flex items-center gap-2 text-copy',
          last && !last.ok && !running
            ? 'text-status-interrupted'
            : 'text-muted-foreground'
        )}
      >
        <PaceSpinner
          active={Boolean(running || elsewhere)}
          className="size-6"
        />
        <Swap
          id={running ? `run:${running.by ?? ''}` : 'last'}
          className={cn('min-w-0', running && 'text-shimmer')}
        >
          {text ??
            (last && !last.ok
              ? signIn?.at === last.at
                ? signIn.error
                : last.error
              : null)}
          {spent && <span className="text-foreground/80"> {spent}</span>}
        </Swap>
        {signOut && last && (
          <Button
            size="xs"
            variant="outline"
            className="text-foreground"
            onClick={async () => {
              const opened = await window.pacenoteDesktop?.tasks.signIn(signOut)
              if (opened?.error) setSignIn({ at: last.at, error: opened.error })
            }}
          >
            <SquareTerminal aria-hidden="true" />
            Sign in to {CLI_NAMES[signOut]}
          </Button>
        )}
      </div>
      {switched && (
        <Swap id={`switch:${switched.from}:${running ? 'run' : 'last'}`}>
          <p
            data-switch
            className="flex items-center gap-2 pl-8 text-meta text-muted-foreground"
          >
            <ArrowRightLeft aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0">
              {switchLine(switched)}
              {running
                ? `, so ${name(running.by)} took over.`
                : last?.ok
                  ? `, so ${name(last.by)} collected.`
                  : `, and ${name(last?.by)} could not either.`}
            </span>
          </p>
        </Swap>
      )}
    </div>
  )
}

/** The most recent collections the list shows; the header counts them all */
const RECENT_SHOWN = 10

/**
 * The collections the app ran in the last 7 days: when, how each ended, and
 * the new tokens it spent (the Overview has them per day). A row opens the
 * collection's run in Runs; the old log's rows have none.
 */
function RecentCollections({
  collections,
}: {
  collections: CollectionRecord[]
}) {
  if (!collections.length) return null
  const spent = collections.map((entry) =>
    entry.usage ? newTokens(entry.usage) : 0
  )
  const max = Math.max(1, ...spent)
  const total = spent.reduce((sum, value) => sum + value, 0)
  return (
    <section
      aria-labelledby="collections-title"
      className="mt-10 border-t border-border pt-9"
    >
      <div className="flex items-center gap-2">
        <History className="size-4 shrink-0 text-primary" />
        <h2 id="collections-title" className="text-section">
          Recent collections
        </h2>
        <span className="ml-auto text-meta text-muted-foreground">
          Last 7 days · {collections.length}{' '}
          {collections.length === 1 ? 'collection' : 'collections'} ·{' '}
          {formatTokens(total)} new
        </span>
      </div>
      <ul className="mt-4 text-body">
        {collections.slice(0, RECENT_SHOWN).map((entry, index) => (
          <li key={entry.startedAt} className="border-t border-border">
            <CollectionRow entry={entry}>
              <span className="font-medium tabular-nums">
                {formatShortDay(entry.startedAt)}{' '}
                {formatHourMinute(entry.startedAt)}
              </span>
              <span>
                <Badge variant="outline">{TRIGGER_LABEL[entry.trigger]}</Badge>
              </span>
              <span
                title={collectionNote(entry)}
                className={cn(
                  'truncate text-meta',
                  entry.ok ? 'text-muted-foreground' : 'text-status-interrupted'
                )}
              >
                {collectionNote(entry)}
              </span>
              <span className="flex items-center justify-end gap-2.5 text-meta">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-well">
                  {spent[index]! > 0 && (
                    <span
                      className="block h-full min-w-1.5 rounded-full bg-chart-4"
                      style={{ width: `${(spent[index]! / max) * 100}%` }}
                    />
                  )}
                </span>
                <span className="w-16 text-right font-medium tabular-nums">
                  {spent[index] ? `${formatTokens(spent[index]!)} new` : '-'}
                </span>
              </span>
            </CollectionRow>
          </li>
        ))}
      </ul>
      {collections.length > RECENT_SHOWN && (
        <p className="border-t border-border pt-2.5 text-meta text-muted-foreground">
          {collections.length - RECENT_SHOWN} more in the last 7 days.
        </p>
      )}
    </section>
  )
}

const ROW =
  'grid grid-cols-[7.25rem_6.75rem_minmax(0,1fr)_11rem_1rem] items-center gap-x-4 py-2.5'

/** A collection's row: a link to its run when it has one */
function CollectionRow({
  entry,
  children,
}: {
  entry: CollectionRecord
  children: React.ReactNode
}) {
  // Another Mac's run is in that Mac's history
  if (!entry.runId || entry.mac)
    return (
      <div className={ROW}>
        {children}
        <span />
      </div>
    )
  return (
    <a
      href={`#/runs/${entry.runId}`}
      title="Open this collection's run"
      className={cn(
        ROW,
        'group -mx-2 rounded-lg px-2 transition-colors hover:bg-selected/50'
      )}
    >
      {children}
      <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-foreground" />
    </a>
  )
}

const TRIGGER_LABEL: Record<CollectionRecord['trigger'], string> = {
  now: 'Collect now',
}

/** "23 lookups · 2 tasks, 1 Maybe", or why it stopped */
function collectionNote(entry: CollectionRecord): string {
  if (!entry.ok) return entry.error
  const reads = entry.reads ?? 0
  const found = [
    entry.added && `${entry.added} ${entry.added === 1 ? 'task' : 'tasks'}`,
    entry.maybe && `${entry.maybe} ${entry.maybe === 1 ? 'Maybe' : 'Maybes'}`,
  ].filter(Boolean)
  return `${reads} ${reads === 1 ? 'lookup' : 'lookups'} · ${found.length ? found.join(', ') : 'Nothing new'}`
}

/** How tasks are collected, and what it takes, before they are turned on */
function Setup() {
  return (
    <div className="mt-2">
      <p className="text-copy text-muted-foreground">
        Pacenote has your AI read Slack with its own Slack connector, and keeps
        a short list here of what people asked of you and what you said you
        would do. Pacenote holds no Slack token for this, and nothing is posted
        anywhere.
      </p>
      <div className="mt-6 grid gap-4 @min-[44rem]:grid-cols-3">
        <SetupPart title="What it needs">
          Claude Code or Codex on this Mac, signed in, with Slack connected to
          your claude.ai account or ChatGPT. With both, one takes over when the
          other is at its limit.
        </SetupPart>
        <SetupPart title="What is read">
          Messages that mention you, threads you took part in, and what you said
          you would do, since the last collection; DMs only if you count them.
          Read only: the collection cannot post or react.
        </SetupPart>
        <SetupPart title="How to collect">
          Collect now on this screen. Pacenote gives the collection its rules:
          precision first, and anything unsure is a Maybe.
        </SetupPart>
      </div>
      <Button
        className="mt-6"
        onClick={() => (window.location.hash = '#/settings/tasks')}
      >
        <Settings />
        Turn on in Settings
      </Button>
    </div>
  )
}

function SetupPart({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border px-4 py-3.5">
      <h2 className="text-section">{title}</h2>
      <p className="mt-1.5 text-copy leading-relaxed text-muted-foreground">
        {children}
      </p>
    </section>
  )
}
