import type { DismissReason, TaskView } from '@src/tasks/types'
import {
  CircleCheck,
  ExternalLink,
  RefreshCw,
  Settings,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBotStatus } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { useDecide, useTasks } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { PaceSpinner } from './pace-spinner'

type Tab = 'open' | 'maybe' | 'done'

const DISMISS_REASONS: { reason: DismissReason; label: string }[] = [
  { reason: 'not-mine', label: 'Not for me' },
  { reason: 'done-already', label: 'Already done' },
  { reason: 'not-worth-it', label: 'Not worth it' },
]

const SETTLED_LABEL: Record<string, string> = {
  done: 'Done',
  dismissed: 'Dismissed',
  'not-mine': 'Dismissed: not for me',
  'done-already': 'Dismissed: already done',
  'not-worth-it': 'Dismissed: not worth it',
  replied: 'Closed: you replied in the thread',
  checked: 'Closed: marked with a check',
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

/**
 * Your own tasks, gathered from Slack (docs/proposals/personal-tasks.md): the
 * open ones, the Maybes kept aside, and what is settled. Pace collects when you
 * choose Collect now; Done and Dismiss are one click.
 */
export function TasksPage() {
  const bridge = window.pacenoteDesktop?.tasks
  const tasks = useTasks()
  const bot = useBotStatus()
  const decide = useDecide()
  const [tab, setTab] = useState<Tab>('open')
  const [notice, setNotice] = useState<string>()
  const [declined, setDeclined] = useState(declinedOffers)
  const status = bot.data?.alive ? bot.data.status?.tasks : undefined
  const data = tasks.data

  if (!bridge)
    return (
      <Page>
        <p className="mt-6 text-sm text-muted-foreground">
          Tasks are gathered by the desktop app.
        </p>
      </Page>
    )
  if (!data) return <Page />
  if (data.settings.hub)
    return (
      <Page>
        <p className="mt-6 text-sm text-muted-foreground">
          Tasks work with your own Slack app for now, not through the team hub.
        </p>
      </Page>
    )
  if (!data.settings.on || !data.settings.hasToken)
    return (
      <Page>
        <Setup on={data.settings.on} />
      </Page>
    )

  const open = data.tasks.filter((task) => task.status === 'open')
  const maybe = data.tasks.filter((task) => task.status === 'maybe')
  const settled = data.tasks
    .filter((task) => !['open', 'maybe'].includes(task.status))
    .sort(
      (a, b) => Date.parse(b.settledAt ?? '') - Date.parse(a.settledAt ?? '')
    )
  const shown = tab === 'open' ? open : tab === 'maybe' ? maybe : settled
  const collecting = status?.state === 'collecting'
  const offer =
    data.leaveOut && !declined.includes(data.leaveOut.conversation)
      ? data.leaveOut
      : undefined

  const collect = async () => {
    setNotice(undefined)
    const res = await bridge.collect()
    if ('error' in res) setNotice(res.error)
  }
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
            ` · collected ${formatRelative(data.collectedAt)}`}
        </>
      }
      action={
        <Button
          size="sm"
          variant="secondary"
          disabled={collecting}
          onClick={() => void collect()}
        >
          {collecting ? <PaceSpinner className="size-4" /> : <RefreshCw />}
          {collecting ? (status?.detail ?? 'Collecting') : 'Collect now'}
        </Button>
      }
    >
      {(notice ?? status?.error) && (
        <Banner tone="warn">{notice ?? status?.error}</Banner>
      )}
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

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="mt-5">
          <TabsTrigger value="open">Open {open.length}</TabsTrigger>
          <TabsTrigger value="maybe">Maybe {maybe.length}</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'maybe' && (
        <p className="mt-3 text-xs text-muted-foreground">
          Guesses Pace is not sure about. They stay out of the list and my_tasks
          until you keep one.
        </p>
      )}

      <ul className="mt-3">
        {shown.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onDecide={(decision) => void decide(task.id, decision)}
          />
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="border-t border-border py-8 text-sm text-muted-foreground">
          {tab === 'open'
            ? data.collectedAt
              ? 'Nothing open. Collect now reads what is new since the last time.'
              : 'Nothing yet. Collect now reads the last 7 days of the conversations you are in.'
            : tab === 'maybe'
              ? 'No Maybes.'
              : 'Nothing settled in the last 14 days.'}
        </p>
      )}
      {tab === 'done' && data.dismissRate !== undefined && (
        <p className="mt-4 text-xs text-muted-foreground">
          You dismissed {Math.round(data.dismissRate * 100)}% of the tasks you
          settled. Above about 30%, Pace is picking too loosely.
        </p>
      )}
    </Page>
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
          <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
          {meta && (
            <span className="text-sm text-muted-foreground">{meta}</span>
          )}
          <span className="flex-1" />
          {action}
        </header>
        {children}
      </div>
    </ScrollArea>
  )
}

function Banner({
  tone,
  children,
}: {
  tone: 'warn' | 'note'
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'mt-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm',
        tone === 'warn'
          ? 'bg-status-interrupted/10 text-status-interrupted'
          : 'bg-card-accent'
      )}
    >
      {tone === 'warn' && <TriangleAlert className="size-4 shrink-0" />}
      {children}
    </div>
  )
}

/** What tasks read and where the text goes, before they are turned on */
function Setup({ on }: { on: boolean }) {
  return (
    <div className="mt-2">
      <p className="text-sm text-muted-foreground">
        Pace reads the conversations you are in for what people ask of you and
        what you said you would do, and keeps a short list here. Nothing is
        posted anywhere.
      </p>
      <div className="mt-6 grid gap-4 @min-[44rem]:grid-cols-3">
        <SetupPart title="What Pace reads">
          Messages that mention you and threads you took part in, in the public
          and private channels you are in, the last 7 days. DMs only if you turn
          them on.
        </SetupPart>
        <SetupPart title="Where the text goes">
          The kept messages go to your reasoner (claude or codex) to pick out
          the tasks. Your Slack token stays on this Mac.
        </SetupPart>
        <SetupPart title="What it needs">
          A Slack user token from your Pacenote app, with read scopes. Settings
          &gt; Tasks says which, and where to get it.
        </SetupPart>
      </div>
      <Button
        className="mt-6"
        onClick={() => (window.location.hash = '#/settings/tasks')}
      >
        <Settings />
        {on ? 'Add the Slack user token' : 'Turn on in Settings'}
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
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </section>
  )
}

function TaskRow({
  task,
  onDecide,
}: {
  task: TaskView
  onDecide: (
    decision: {
      status: 'done' | 'dismissed' | 'kept'
      reason?: DismissReason
    } | null
  ) => void
}) {
  const [choosing, setChoosing] = useState(false)
  const who =
    task.kind === 'promised'
      ? 'You said you would'
      : task.askedBy
        ? `${task.askedBy} asked you`
        : undefined
  const settledLabel =
    task.status === 'closed'
      ? SETTLED_LABEL[task.closed?.why ?? '']
      : task.status === 'dismissed'
        ? SETTLED_LABEL[task.dismissReason ?? 'dismissed']
        : SETTLED_LABEL[task.status]

  return (
    <li
      className={cn(
        'flex items-start gap-4 border-t border-border py-3.5',
        task.faded && 'opacity-60'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] leading-snug font-semibold">{task.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {[who, task.source.label, formatRelative(task.postedAt)]
            .filter(Boolean)
            .join(' · ')}
          {task.due && (
            <span className="rounded-full bg-status-interrupted/12 px-2 py-px font-medium text-status-interrupted">
              {task.due}
            </span>
          )}
          {settledLabel && (
            <span className="rounded-full bg-muted px-2 py-px font-medium">
              {settledLabel}
            </span>
          )}
        </p>
        {task.reason && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            {task.reason}
          </p>
        )}
        {choosing && (
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Why dismiss it"
          >
            {DISMISS_REASONS.map(({ reason, label }) => (
              <Button
                key={reason}
                size="xs"
                variant="outline"
                onClick={() => onDecide({ status: 'dismissed', reason })}
              >
                {label}
              </Button>
            ))}
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onDecide({ status: 'dismissed' })}
            >
              Just dismiss
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Keep it"
              onClick={() => setChoosing(false)}
            >
              <X />
            </Button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {task.status === 'open' && !choosing && (
          <>
            <Button size="sm" onClick={() => onDecide({ status: 'done' })}>
              <CircleCheck />
              Done
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setChoosing(true)}
            >
              Dismiss
            </Button>
          </>
        )}
        {task.status === 'maybe' && !choosing && (
          <>
            <Button size="sm" onClick={() => onDecide({ status: 'kept' })}>
              Keep as a task
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setChoosing(true)}
            >
              Dismiss
            </Button>
          </>
        )}
        {(task.status === 'done' ||
          task.status === 'dismissed' ||
          task.status === 'closed') && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onDecide(task.status === 'closed' ? { status: 'kept' } : null)
            }
          >
            <Undo2 />
            Reopen
          </Button>
        )}
        {task.source.permalink && (
          <Button size="icon-sm" variant="ghost" asChild>
            <a
              href={task.source.permalink}
              target="_blank"
              rel="noreferrer"
              aria-label="Open in Slack"
            >
              <ExternalLink />
            </a>
          </Button>
        )}
      </div>
    </li>
  )
}
