import type {
  FolderCheck,
  RelatedRun,
  RelatedTask,
  SessionItem,
  TaskDetail,
  TaskView,
  WorkTool,
} from '@src/tasks/types'
import {
  ArrowLeft,
  Bot,
  CircleCheck,
  Copy,
  FileText,
  FolderOpen,
  History,
  ListChecks,
  Lock,
  MessageSquare,
  MessagesSquare,
  RotateCw,
  SquareTerminal,
  Undo2,
} from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDateTime, formatRelative, formatShortDay } from '@/lib/format'
import { useDecide, useTaskDetail, useTasks, useTaskWork } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { PaceSpinner } from './pace-spinner'

/**
 * One task: what was asked, the thread summed up, what came before it (the
 * thread, its repository, the person who asked), and its work log. Its next
 * step continues it where the work happens: a code task in Claude Code or
 * Codex, opened in a terminal in its repository with the task; a reply as a
 * draft for you to edit and send yourself. Nothing is posted to Slack.
 */

const TOOL: Record<WorkTool, string> = { claude: 'Claude Code', codex: 'Codex' }
const other = (tool: WorkTool): WorkTool =>
  tool === 'claude' ? 'codex' : 'claude'
const taskLink = (id: string, rest = '') =>
  `#/tasks/${encodeURIComponent(id)}${rest}`

type Session = Extract<TaskDetail['work'][number], { kind: 'session' }>

export function TaskDetailPage({
  id,
  view,
  entry,
}: {
  id: string
  view?: 'continue' | 'draft' | 'log'
  entry?: string
}) {
  const bridge = window.pacenoteDesktop?.tasks
  const detail = useTaskDetail(id)
  const tasks = useTasks()
  const data = detail.data

  if (!bridge)
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          Tasks are gathered by the desktop app.
        </p>
      </Shell>
    )
  if (detail.isPending) return <Shell />
  if (!data)
    return (
      <Shell>
        <BackLink href="#/tasks">Todo</BackLink>
        <p className="mt-6 text-sm text-muted-foreground">
          This task is no longer kept: tasks stay 104 days after they were
          found.
        </p>
      </Shell>
    )

  const listed = (tasks.data?.tasks ?? []).filter(
    (task) => task.status === 'open' || task.status === 'maybe'
  )
  return (
    <div className="@container/task flex h-full min-h-0">
      <nav
        aria-label="Open tasks"
        className="flex w-80 shrink-0 flex-col gap-0.5 border-r border-border p-3 @max-[52rem]/task:hidden"
      >
        <ScrollArea className="min-h-0 flex-1">
          {listed.map((task) => (
            <a
              key={task.id}
              href={taskLink(task.id)}
              aria-current={task.id === id ? 'true' : undefined}
              className={cn(
                'block rounded-xl px-3 py-2.5 transition-colors hover:bg-selected/50',
                task.id === id && 'bg-selected hover:bg-selected'
              )}
            >
              <span className="block text-[13.5px] leading-snug font-semibold">
                {task.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {[
                  who(task, true),
                  task.source.label,
                  formatRelative(task.postedAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </a>
          ))}
        </ScrollArea>
      </nav>
      <ScrollArea className="min-h-0 flex-1">
        <div className="max-w-3xl px-8 py-6">
          {view === 'log' && entry ? (
            <SessionLog detail={data} entryId={entry} />
          ) : (
            <TaskBody detail={data} view={view} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <ScrollArea className="h-full">
      <div className="max-w-3xl px-8 py-6">{children}</div>
    </ScrollArea>
  )
}

function BackLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {children}
    </a>
  )
}

/** "mina asked you", or "You said you would" */
function who(task: Pick<TaskView, 'kind' | 'askedBy'>, short = false) {
  if (task.kind === 'promised') return short ? 'You' : 'You said you would'
  if (!task.askedBy) return undefined
  return short ? task.askedBy : `${task.askedBy} asked you`
}

const STATUS: Record<TaskView['status'], string> = {
  open: 'Open',
  maybe: 'Maybe',
  done: 'Done',
  dismissed: 'Dismissed',
  closed: 'Closed',
}

function Chip({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'primary' | 'due'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 text-[11px] leading-[18px] font-medium',
        tone === 'primary' && 'bg-primary/12 text-primary',
        tone === 'due' && 'bg-status-interrupted/12 text-status-interrupted',
        tone === 'muted' && 'bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  )
}

function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-primary">
      {icon}
      {children}
    </h2>
  )
}

function TaskBody({
  detail,
  view,
}: {
  detail: TaskDetail
  view?: 'continue' | 'draft' | 'log'
}) {
  const { task, work, cli } = detail
  const decide = useDecide()
  const act = useTaskWork(task.id)
  const [error, setError] = useState<string>()
  const [choosing, setChoosing] = useState<WorkTool>()
  const [drafting, setDrafting] = useState(false)
  const latestDraft = work.find((entry) => entry.kind === 'draft')
  const [reply, setReply] = useState<string>()
  const replyText = reply ?? latestDraft?.text ?? ''
  const showReply =
    task.action === 'reply' || drafting || reply !== undefined || !!latestDraft

  const continueIn = async (tool: WorkTool) => {
    setError(undefined)
    // A folder this repository was opened in before goes straight on.
    if (detail.folder) setError(await act.continueIn(tool, detail.folder))
    else setChoosing(tool)
  }
  const draft = async () => {
    setError(undefined)
    setDrafting(true)
    setReply(undefined)
    const failed = await act.draft()
    setDrafting(false)
    setError(failed)
  }
  const copy = async (text: string) => {
    setError(await act.copyReply(text))
  }

  // From the list's button: start the next step once, as the task opens.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !view || view === 'log') return
    started.current = true
    window.history.replaceState(null, '', taskLink(task.id))
    if (view === 'continue') void continueIn(cli)
    else void draft()
  }, [view])

  const settled = !['open', 'maybe'].includes(task.status)
  // The reply the session left, until you have copied a reply
  const closedReply = work.some(
    (entry) => entry.kind === 'draft' && entry.copiedAt
  )
    ? undefined
    : task.closed?.reply

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="#/tasks">Todo</BackLink>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Chip tone={settled ? 'muted' : 'primary'}>
            {STATUS[task.status]}
          </Chip>
          {task.action === 'code' && (
            <Chip>
              <SquareTerminal className="size-3" />
              Code
            </Chip>
          )}
          {task.action === 'reply' && (
            <Chip>
              <MessageSquare className="size-3" />
              Reply
            </Chip>
          )}
          {task.due && !settled && <Chip tone="due">{task.due}</Chip>}
        </div>
        <h1 className="text-lg font-semibold tracking-tight select-text">
          {task.title}
        </h1>
        <p className="text-xs text-muted-foreground">
          {[who(task), task.source.label, formatRelative(task.postedAt)]
            .filter(Boolean)
            .join(' · ')}
          {task.source.permalink && (
            <>
              {' · '}
              <a
                href={task.source.permalink}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Open in Slack
              </a>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {task.action === 'reply' ? (
          <>
            <Button onClick={() => void draft()} disabled={drafting}>
              <MessageSquare />
              Draft a reply
            </Button>
            <Button variant="ghost" onClick={() => void continueIn(cli)}>
              <SquareTerminal />
              Continue in {TOOL[cli]}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant={task.action === 'code' ? 'default' : 'outline'}
              onClick={() => void continueIn(cli)}
            >
              <SquareTerminal />
              Continue in {TOOL[cli]}
            </Button>
            <Button
              variant="outline"
              onClick={() => void continueIn(other(cli))}
            >
              Continue in {TOOL[other(cli)]}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void draft()}
              disabled={drafting}
            >
              <MessageSquare />
              Draft a reply
            </Button>
          </>
        )}
        <span className="flex-1" />
        {settled ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void decide(
                task.id,
                task.status === 'closed' ? { status: 'kept' } : null
              )
            }
          >
            <Undo2 />
            Reopen
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void decide(task.id, { status: 'done' })}
            >
              <CircleCheck />
              Done
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void decide(task.id, { status: 'dismissed' })}
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="-mt-3 text-sm text-status-failed">
          {error}
        </p>
      )}

      {closedReply && reply === undefined && (
        <div className="flex flex-col gap-2.5 rounded-[20px] bg-card-accent px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <PaceSpinner className="size-5" />
            {task.askedBy
              ? `${task.askedBy} is still waiting in the thread`
              : 'A reply is waiting to be sent'}
          </p>
          <p className="text-[13.5px] text-foreground/80 select-text">
            The session drafted a reply for you: &ldquo;{closedReply}&rdquo;
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => void copy(closedReply)}>
              <Copy />
              Copy and open thread
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setReply(closedReply)}
            >
              Edit it first
            </Button>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-2.5">
        <SectionTitle icon={<FileText />}>What it&apos;s about</SectionTitle>
        <div className="rounded-xl bg-well px-4 py-3">
          <p className="text-sm leading-relaxed select-text">
            {task.summary ?? task.reason}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {task.summary
              ? `Summed up from the thread when Pace collected it, ${formatRelative(task.foundAt)}`
              : 'Why it is a task'}
            {task.repo && (
              <>
                {' · '}
                <span className="font-mono">{task.repo}</span>
              </>
            )}
          </p>
        </div>
      </section>

      {showReply && (
        <section className="flex flex-col gap-2.5">
          <SectionTitle icon={<MessageSquare />}>Your reply</SectionTitle>
          {drafting ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <PaceSpinner active className="size-6" />
              <span className="text-shimmer">
                Reading the thread, read only, to draft your reply.
              </span>
            </p>
          ) : (
            <>
              <label htmlFor="reply" className="text-xs text-muted-foreground">
                {replyText
                  ? 'A draft for you to edit and send'
                  : 'No draft yet: write one, or have one drafted from the thread'}
              </label>
              <textarea
                id="reply"
                value={replyText}
                onChange={(event) => setReply(event.target.value)}
                rows={5}
                className="w-full resize-y rounded-[10px] border border-input bg-background px-3 py-2.5 text-sm leading-relaxed outline-none select-text focus-visible:ring-[3px] focus-visible:ring-ring/40"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void copy(replyText)}
                  disabled={!replyText.trim()}
                >
                  <Copy />
                  Copy and open thread
                </Button>
                <Button variant="outline" onClick={() => void draft()}>
                  <RotateCw />
                  {latestDraft ? 'Draft again' : 'Draft a reply'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {latestDraft
                  ? `Drafted ${formatRelative(latestDraft.at)}, reading the thread only. `
                  : ''}
                Pacenote never sends it for you. When you reply in the thread,
                the next collection closes this task.
              </p>
            </>
          )}
        </section>
      )}

      <section className="flex flex-col">
        <SectionTitle icon={<History />}>What came before</SectionTitle>
        <Earlier
          detail={detail}
          onResume={(entryId) => act.resume(entryId).then(setError)}
        />
      </section>

      <section className="flex flex-col">
        <SectionTitle icon={<ListChecks />}>Work log</SectionTitle>
        <WorkLog
          detail={detail}
          onResume={(entryId) => act.resume(entryId).then(setError)}
        />
      </section>

      {choosing && (
        <FolderDialog
          task={task}
          tool={choosing}
          onClose={() => setChoosing(undefined)}
          onOpen={async (folder) => {
            const failed = await act.continueIn(choosing, folder)
            if (failed) return failed
            setChoosing(undefined)
            return undefined
          }}
        />
      )}
    </div>
  )
}

/** Earlier tasks and runs: in the thread, in the repository, from the person */
function Earlier({
  detail,
  onResume,
}: {
  detail: TaskDetail
  onResume: (entryId: string) => void
}) {
  const { context, task } = detail
  const groups: {
    label: string
    runs?: RelatedRun[]
    tasks: RelatedTask[]
  }[] = [
    {
      label: 'In this thread',
      runs: context.thread.runs,
      tasks: context.thread.tasks,
    },
    ...(context.repo
      ? [{ label: `In ${context.repo.name}`, tasks: context.repo.tasks }]
      : []),
    ...(context.person
      ? [{ label: `From ${context.person.name}`, tasks: context.person.tasks }]
      : []),
  ].filter((group) => group.tasks.length || group.runs?.length)
  if (!groups.length)
    return (
      <p className="mt-2 border-t border-border py-3 text-[13px] text-muted-foreground">
        Nothing earlier in this thread
        {task.repo ? `, in ${task.repo}` : ''}
        {task.askedBy && task.kind === 'asked'
          ? ` or from ${task.askedBy}`
          : ''}
        .
      </p>
    )
  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="pt-3 pb-1.5 text-[11px] font-medium text-muted-foreground">
            {group.label}
          </p>
          {group.runs?.map((pace) => (
            <Row key={pace.id} icon={<Bot />}>
              <a
                href={`#/runs/${pace.id}`}
                className="font-semibold hover:underline"
              >
                {pace.request || 'A mention'}
              </a>
              <span className="text-xs text-muted-foreground">
                Pace · {formatShortDay(pace.at)} · {pace.status}
              </span>
            </Row>
          ))}
          {group.tasks.map((earlier) => (
            <Row
              key={earlier.id}
              icon={<ListChecks />}
              action={
                earlier.session?.session ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onResume(earlier.session!.id)}
                  >
                    <SquareTerminal />
                    Continue that session
                  </Button>
                ) : undefined
              }
            >
              <a
                href={taskLink(earlier.id)}
                className="font-semibold hover:underline"
              >
                {earlier.title}
              </a>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {[
                  earlier.askedBy,
                  earlier.where,
                  formatShortDay(earlier.postedAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                {earlier.outcome && (
                  <span className="rounded-full bg-muted px-2 font-medium text-foreground">
                    {earlier.outcome}
                  </span>
                )}
              </span>
            </Row>
          ))}
        </div>
      ))}
    </div>
  )
}

function Row({
  icon,
  action,
  children,
}: {
  icon: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 border-t border-border py-2.5 text-sm">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-well text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
      {action}
    </div>
  )
}

/** The task's work: its sessions, drafts and how it closed, newest first */
function WorkLog({
  detail,
  onResume,
}: {
  detail: TaskDetail
  onResume: (entryId: string) => void
}) {
  const { task, work } = detail
  const rows: React.ReactNode[] = []
  if (task.status === 'closed' && task.closed)
    rows.push(
      <Row key="closed" icon={<CircleCheck />}>
        <span className="font-semibold">
          {task.closed.by ? 'Closed by the session' : 'Closed'}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(task.closed.at)}
          {task.closed.note ? ` · ${task.closed.note}` : ''}
        </span>
      </Row>
    )
  if ((task.status === 'done' || task.status === 'dismissed') && task.settledAt)
    rows.push(
      <Row key="settled" icon={<CircleCheck />}>
        <span className="font-semibold">{STATUS[task.status]}</span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(task.settledAt)} · by you
        </span>
      </Row>
    )
  for (const entry of work) {
    if (entry.kind === 'draft') {
      rows.push(
        <Row key={entry.id} icon={<MessageSquare />}>
          <span className="font-semibold">
            {entry.copiedAt
              ? 'Reply copied and thread opened'
              : 'Reply drafted'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(entry.copiedAt ?? entry.at)}
          </span>
        </Row>
      )
      continue
    }
    rows.push(
      <SessionRow
        key={entry.id}
        task={task}
        entry={entry}
        onResume={onResume}
      />
    )
  }
  rows.push(
    <Row key="collected" icon={<ListChecks />}>
      <span className="font-semibold">Collected from {task.source.label}</span>
      <span className="text-xs text-muted-foreground">
        {formatDateTime(task.foundAt)}
        {task.summary ? ' · summed up from the thread' : ''}
      </span>
    </Row>
  )
  return <div className="mt-1.5 flex flex-col">{rows}</div>
}

function SessionRow({
  task,
  entry,
  onResume,
}: {
  task: TaskView
  entry: Session
  onResume: (entryId: string) => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Row icon={<SquareTerminal />}>
      <span className="font-semibold">
        {TOOL[entry.tool]} session
        {entry.found && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            started by you
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatDateTime(entry.startedAt)}
        {entry.lastActiveAt
          ? ` · last active ${formatRelative(entry.lastActiveAt)}`
          : ''}
        {' · '}
        <span className="font-mono select-text">{entry.cwd}</span>
      </span>
      <span className="mt-2 flex flex-wrap gap-1.5">
        {entry.session ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResume(entry.id)}
            >
              <SquareTerminal />
              Continue in {TOOL[entry.tool]}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a
                href={taskLink(task.id, `/log/${encodeURIComponent(entry.id)}`)}
              >
                View log
              </a>
            </Button>
            {entry.resume && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Copy the command to continue it"
                onClick={() => {
                  void navigator.clipboard.writeText(entry.resume!)
                  setCopied(true)
                }}
              >
                {copied ? <CircleCheck className="text-primary" /> : <Copy />}
              </Button>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Waiting for {TOOL[entry.tool]} to start it
          </span>
        )}
      </span>
    </Row>
  )
}

/** Where the session opens, the first time a repository needs one */
function FolderDialog({
  task,
  tool,
  onClose,
  onOpen,
}: {
  task: TaskView
  tool: WorkTool
  onClose: () => void
  onOpen: (folder: string) => Promise<string | undefined>
}) {
  const bridge = window.pacenoteDesktop?.tasks
  const [found, setFound] = useState<FolderCheck[]>()
  const [chosen, setChosen] = useState<string>()
  const [error, setError] = useState<string>()
  const [opening, setOpening] = useState(false)
  useEffect(() => {
    if (!task.repo) {
      setFound([])
      return
    }
    void bridge?.folders(task.repo).then((folders) => {
      setFound(folders)
      setChosen((current) => current ?? folders[0]?.path)
    })
  }, [bridge, task.repo])
  const choose = async () => {
    const check = await bridge?.chooseFolder(task.repo)
    if (!check) return
    setFound((list) => [
      check,
      ...(list ?? []).filter((f) => f.path !== check.path),
    ])
    setChosen(check.path)
  }
  const chosenCheck = found?.find((folder) => folder.path === chosen)
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/25" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[34rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[20px] bg-card p-6 shadow-2xl outline-none">
          <div className="flex flex-col gap-1.5">
            <Dialog.Title className="text-base font-semibold">
              {task.repo
                ? `Where is ${task.repo} on this Mac?`
                : 'Where should the session open?'}
            </Dialog.Title>
            <Dialog.Description className="text-[13px] text-muted-foreground">
              {TOOL[tool]} opens in this folder with the task.
              {task.repo
                ? ' Pacenote remembers it for this repository; change it in Settings > Todo.'
                : ''}
            </Dialog.Description>
          </div>
          <div
            role="radiogroup"
            aria-label="Folder"
            className="flex flex-col gap-2"
          >
            {found === undefined && task.repo && (
              <p className="text-[13px] text-muted-foreground">
                Looking for {task.repo} on this Mac.
              </p>
            )}
            {found?.length === 0 && task.repo && (
              <p className="text-[13px] text-muted-foreground">
                No checkout of {task.repo} found under your usual folders.
              </p>
            )}
            {found?.map((folder) => (
              <button
                key={folder.path}
                type="button"
                role="radio"
                aria-checked={folder.path === chosen}
                onClick={() => setChosen(folder.path)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                  folder.path === chosen
                    ? 'border-primary/50 bg-primary/6'
                    : 'border-border hover:border-primary/30'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border',
                    folder.path === chosen
                      ? 'border-primary'
                      : 'border-muted-foreground/40'
                  )}
                >
                  {folder.path === chosen && (
                    <span className="size-1.5 rounded-full bg-primary" />
                  )}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-[13px] font-semibold break-all">
                    {folder.path}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {folder.error ??
                      [
                        folder.remote
                          ? `Its remote is ${folder.remote}`
                          : 'No remote',
                        folder.changes
                          ? `${folder.changes} changes not committed`
                          : 'clean',
                      ].join(' · ')}
                    {!folder.matches && !folder.error && task.repo
                      ? ` · not ${task.repo}`
                      : ''}
                  </span>
                </span>
              </button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => void choose()}
            >
              <FolderOpen />
              Choose another folder
            </Button>
          </div>
          <p className="flex items-start gap-2 rounded-[10px] bg-well px-3 py-2.5 text-xs text-muted-foreground">
            <Lock className="mt-px size-3.5 shrink-0" />
            {TOOL[tool]} runs as you, with your own permissions, and asks you
            before it changes anything. Pacenote opens the session and hands it
            the task; it runs no commands itself.
          </p>
          {error && (
            <p role="alert" className="text-sm text-status-failed">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button
              disabled={!chosen || opening || !!chosenCheck?.error}
              onClick={async () => {
                setOpening(true)
                setError(await onOpen(chosen!))
                setOpening(false)
              }}
            >
              <SquareTerminal />
              Open {TOOL[tool]} here
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** A session's own log, read from the tool's files when you open it */
function SessionLog({
  detail,
  entryId,
}: {
  detail: TaskDetail
  entryId: string
}) {
  const bridge = window.pacenoteDesktop?.tasks
  const act = useTaskWork(detail.task.id)
  const entry = detail.work.find(
    (item): item is Session => item.kind === 'session' && item.id === entryId
  )
  const [log, setLog] = useState<{ items?: SessionItem[]; error?: string }>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    void bridge?.sessionLog(entryId).then((result) => setLog(result ?? {}))
  }, [bridge, entryId])
  if (!entry)
    return (
      <>
        <BackLink href={taskLink(detail.task.id)}>{detail.task.title}</BackLink>
        <p className="mt-6 text-sm text-muted-foreground">
          There is no such session.
        </p>
      </>
    )
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={taskLink(detail.task.id)}>{detail.task.title}</BackLink>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <Chip tone="primary">{TOOL[entry.tool]} session</Chip>
          {detail.task.closed?.by && <Chip>Closed the task</Chip>}
        </div>
        <h1 className="text-lg font-semibold tracking-tight">
          {detail.task.title}
        </h1>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{entry.cwd}</span> ·{' '}
          {formatDateTime(entry.startedAt)}
          {entry.lastActiveAt
            ? ` · last active ${formatRelative(entry.lastActiveAt)}`
            : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void act.resume(entry.id).then(setError)}
          disabled={!entry.session}
        >
          <SquareTerminal />
          Continue in {TOOL[entry.tool]}
        </Button>
        {entry.resume && (
          <Button
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(entry.resume!)}
          >
            <Copy />
            <span className="font-mono text-xs">
              {entry.tool === 'claude' ? 'claude --resume' : 'codex resume'}{' '}
              {entry.session?.slice(0, 8)}…
            </span>
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-status-failed">
          {error}
        </p>
      )}
      {!log ? (
        <p className="text-sm text-muted-foreground">
          Reading the session&apos;s log.
        </p>
      ) : log.error ? (
        <p className="text-sm text-muted-foreground">{log.error}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {(log.items ?? []).map((item, index) =>
            item.role === 'tool' ? (
              <li
                key={index}
                className="ml-10 flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[12.5px]"
              >
                <span className="shrink-0 font-mono font-medium">
                  {item.name}
                </span>
                <span className="min-w-0 truncate font-mono text-muted-foreground">
                  {item.text}
                </span>
              </li>
            ) : (
              <li key={index} className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    item.role === 'user'
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-foreground text-background'
                  )}
                  aria-hidden="true"
                >
                  {item.role === 'user' ? 'Y' : TOOL[entry.tool][0]}
                </span>
                <div
                  className={cn(
                    'min-w-0 flex-1 rounded-[20px] px-4 py-3',
                    item.role === 'user' ? 'bg-well' : 'border border-border'
                  )}
                >
                  <p className="text-sm font-semibold">
                    {item.role === 'user' ? 'You' : TOOL[entry.tool]}
                    {item.at && (
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {formatDateTime(item.at)}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-wrap text-foreground/85 select-text">
                    {item.text}
                  </p>
                </div>
              </li>
            )
          )}
        </ol>
      )}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <MessagesSquare className="mt-px size-3.5 shrink-0" />
        Read from {TOOL[entry.tool]}&apos;s own session log on this Mac when you
        opened it. Pacenote keeps only the session&apos;s id, folder and times.
      </p>
    </div>
  )
}
