import type { DismissReason, TaskView } from '@src/tasks/types'
import {
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Settings,
  Undo2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatRelative } from '@/lib/format'
import { useMcpClients } from '@/lib/mcp-clients'
import { useDecide, useTasks } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { McpClientRows } from './mcp-connections'

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
  resolved: 'Closed: settled in Slack',
}

/** Claude Code's slash command for Pacenote's collect_tasks prompt */
const COLLECT_COMMAND = '/mcp__pacenote__collect_tasks'

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
 * open ones, the Maybes kept aside, and what is settled. An AI tool with a
 * Slack connector collects them through Pacenote's MCP server; Done and
 * Dismiss are one click.
 */
export function TasksPage() {
  const bridge = window.pacenoteDesktop?.tasks
  const tasks = useTasks()
  const decide = useDecide()
  const [tab, setTab] = useState<Tab>('open')
  const [declined, setDeclined] = useState(declinedOffers)
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
  if (!data.settings.on)
    return (
      <Page>
        <Setup />
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
            ` · collected ${formatRelative(data.collectedAt)}`}
        </>
      }
      action={<CopyCommand />}
    >
      <p className="mt-1 text-sm text-muted-foreground">
        To collect, ask Claude Code or Codex, with its Slack connector. In
        Claude Code, run {COLLECT_COMMAND}.
      </p>
      <NotConnected />
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
              ? 'Nothing open. The next collection reads what is new since this one.'
              : 'Nothing yet. A first collection reads the last 7 days.'
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

function Banner({ children }: { tone: 'note'; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-card-accent px-4 py-3 text-sm">
      {children}
    </div>
  )
}

/** Neither tool has Pacenote's MCP server: add it from here */
function NotConnected() {
  const clients = useMcpClients()
  if (
    !clients.data ||
    clients.data.some((client) => client.state === 'connected')
  )
    return null
  return (
    <div className="mt-4 rounded-xl bg-card-accent px-4 py-3 text-sm">
      <p>
        Claude Code and Codex do not reach Pacenote yet, so they cannot add
        tasks here.
      </p>
      <McpClientRows className="mt-2" />
    </div>
  )
}

/** Copies the collect command for Claude Code */
function CopyCommand() {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        void navigator.clipboard.writeText(COLLECT_COMMAND).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy the collect command'}
    </Button>
  )
}

/** How tasks are collected, and what it takes, before they are turned on */
function Setup() {
  return (
    <div className="mt-2">
      <p className="text-sm text-muted-foreground">
        Claude Code or Codex reads Slack with its own Slack connector and adds
        what people asked of you, and what you said you would do, to a short
        list here. Pacenote holds no Slack token for this, and nothing is posted
        anywhere.
      </p>
      <div className="mt-6 grid gap-4 @min-[44rem]:grid-cols-3">
        <SetupPart title="What it needs">
          Claude Code or Codex with a Slack connector, and Pacenote added to it
          as an MCP server: Settings &gt; Tasks adds it in one click.
        </SetupPart>
        <SetupPart title="What is read">
          Messages that mention you, threads you took part in, and what you said
          you would do, since the last collection; DMs only if you count them.
          The tool reads them with its own Slack access.
        </SetupPart>
        <SetupPart title="How to collect">
          In Claude Code, run {COLLECT_COMMAND}. Pacenote gives the tool its
          rules: precision first, and anything unsure is a Maybe.
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
