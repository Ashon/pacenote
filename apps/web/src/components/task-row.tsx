import { sourceOf } from '@src/tasks/sources'
import type {
  DismissReason,
  FolderCheck,
  RelatedRun,
  RelatedTask,
  SessionItem,
  TaskDetail,
  TaskUpdate,
  TaskView,
  WorkTool,
} from '@src/tasks/types'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight,
  CircleCheck,
  Copy,
  ExternalLink,
  FolderOpen,
  Lock,
  MessageSquare,
  MessagesSquare,
  MoreHorizontal,
  RotateCw,
  SquareTerminal,
  Undo2,
  X,
} from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useId, useRef, useState } from 'react'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDateTime, formatRelative, formatShortDay } from '@/lib/format'
import { taskDetailQuery, useTaskDetail, useTaskWork } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { PaceSpinner } from './pace-spinner'

/**
 * A task in the Todo list. Closed, it is what it is and its next step: one
 * button for it, Done and Dismiss, and the other steps under its menu. Opened
 * in place, it reminds you rather than shows everything: the thread summed up,
 * the one earlier thing most worth knowing ("Last time"), your last session,
 * and the rest of what came before on request. The whole context is for the
 * session the task is handed to (task_context), not for this screen. A code
 * task continues in Claude Code or Codex, opened in a terminal in its
 * repository; a reply is drafted here for you to edit and send yourself.
 * Nothing is posted to Slack.
 */

const TOOL: Record<WorkTool, string> = { claude: 'Claude Code', codex: 'Codex' }
const other = (tool: WorkTool): WorkTool =>
  tool === 'claude' ? 'codex' : 'claude'

/** #/tasks/<id>: the task open in its row; rest: /log/<entry> */
export const taskHash = (id: string, rest = '') =>
  `#/tasks/${encodeURIComponent(id)}${rest}`

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

/** The AI tool that closed a task, by its MCP client name ("claude-code") */
function closedBy(client: string | undefined): string | undefined {
  if (!client) return undefined
  if (/claude/i.test(client)) return TOOL.claude
  if (/codex/i.test(client)) return TOOL.codex
  return client
}

type Session = Extract<TaskDetail['work'][number], { kind: 'session' }>

type Change = TaskUpdate['changed'][number]

/**
 * News in an update: a field it had that changed, or a due date, title or
 * certainty; filling in what an older task lacked is not
 */
const isNews = (change: Change) =>
  change.from !== undefined ||
  ['due', 'title', 'confidence'].includes(change.field)

/** The latest update that changed the task as its thread went on */
function lastChange(task: TaskView): TaskUpdate | undefined {
  return (task.updates ?? []).filter((u) => u.changed.some(isNews)).slice(-1)[0]
}

const ACTION_WORD: Record<string, string> = {
  code: 'a code task',
  reply: 'a reply',
  other: 'neither code nor a reply',
}

/** A change in words: "Due Thursday → Wednesday" */
function changeWords(change: Change): string {
  const { from, to } = change
  switch (change.field) {
    case 'due':
      return from && to
        ? `Due ${from} → ${to}`
        : to
          ? `Due ${to}`
          : `No longer due ${from}`
    case 'title':
      return `Was \u201c${from}\u201d`
    case 'confidence':
      return to === 'sure' ? 'Now a task, no longer a Maybe' : 'Now a Maybe'
    case 'repo':
      return to ? `Repository ${to}` : 'No repository'
    case 'action':
      return `Now ${ACTION_WORD[to ?? ''] ?? to}`
    case 'summary':
      return 'Summary updated'
  }
}

const WEEK = 7 * 24 * 60 * 60_000

export type TaskDecision = {
  status: 'done' | 'dismissed' | 'kept'
  reason?: DismissReason
} | null

export function TaskRow({
  task,
  cli,
  open,
  gone,
  logEntry,
  onToggle,
  onDecide,
}: {
  task: TaskView
  /** Where code tasks continue */
  cli: WorkTool
  open: boolean
  /** Settled while it was open: it stays in place until it is closed */
  gone?: boolean
  /** A session's log to show over the list */
  logEntry?: string
  onToggle: () => void
  onDecide: (decision: TaskDecision) => void
}) {
  const client = useQueryClient()
  const act = useTaskWork(task.id)
  const [dismissing, setDismissing] = useState(false)
  const [folderFor, setFolderFor] = useState<WorkTool>()
  const [drafting, setDrafting] = useState(false)
  const [reply, setReply] = useState<string>()
  const [error, setError] = useState<string>()
  const row = useRef<HTMLLIElement>(null)

  // Opened from a link, the row comes into view.
  useEffect(() => {
    if (open) row.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const continueIn = async (tool: WorkTool) => {
    setError(undefined)
    if (!open) onToggle()
    // A folder the repository was opened in before goes straight on.
    const detail = await client.fetchQuery(taskDetailQuery(task.id))
    if (detail?.folder) setError(await act.continueIn(tool, detail.folder))
    else setFolderFor(tool)
  }
  const draft = async () => {
    setError(undefined)
    if (!open) onToggle()
    setDrafting(true)
    setReply(undefined)
    const failed = await act.draft()
    setDrafting(false)
    setError(failed)
  }

  const who =
    task.kind === 'promised'
      ? 'You said you would'
      : task.askedBy
        ? `${task.askedBy} asked you`
        : undefined
  const source = sourceOf(task)
  const by = closedBy(task.closed?.by)
  const settledLabel =
    task.status === 'closed'
      ? by
        ? `Closed: done in ${by}`
        : task.closed?.why === 'resolved'
          ? `Closed: settled in ${source.label}`
          : SETTLED_LABEL[task.closed?.why ?? '']
      : task.status === 'dismissed'
        ? SETTLED_LABEL[task.dismissReason ?? 'dismissed']
        : SETTLED_LABEL[task.status]
  const settled = !['open', 'maybe'].includes(task.status)
  const change = settled ? undefined : lastChange(task)
  const recent =
    change && Date.now() - Date.parse(change.at) < WEEK ? change : undefined

  // The steps the row's own button does not take
  const more: { label: string; icon: React.ReactNode; run: () => void }[] = [
    ...(task.action === 'code'
      ? []
      : [
          {
            label: `Continue in ${TOOL[cli]}`,
            icon: <SquareTerminal />,
            run: () => void continueIn(cli),
          },
        ]),
    {
      label: `Continue in ${TOOL[other(cli)]}`,
      icon: <SquareTerminal />,
      run: () => void continueIn(other(cli)),
    },
    ...(task.action === 'reply'
      ? []
      : [
          {
            label: 'Draft a reply',
            icon: <MessageSquare />,
            run: () => void draft(),
          },
        ]),
  ]

  return (
    <li
      ref={row}
      data-task-row={task.id}
      className={cn(
        'border-t border-border py-3.5',
        task.faded && !open && 'opacity-60'
      )}
    >
      <Collapsible open={open} onOpenChange={() => onToggle()}>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 pl-6">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                data-task-title
                className="group -ml-6 flex items-start gap-2 rounded-sm text-left text-[14.5px] leading-snug font-semibold outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-primary motion-reduce:transition-none',
                    open && 'rotate-90'
                  )}
                />
                <span
                  className={cn(
                    gone && 'text-muted-foreground line-through decoration-1'
                  )}
                >
                  {task.title}
                </span>
              </button>
            </CollapsibleTrigger>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {[who, task.source.label, formatRelative(task.postedAt)]
                .filter(Boolean)
                .join(' · ')}
              {task.due && !settled && (
                <span className="rounded-full bg-status-interrupted/12 px-2 py-px font-medium text-status-interrupted">
                  {task.due}
                </span>
              )}
              {settledLabel && (
                <span className="rounded-full bg-muted px-2 py-px font-medium">
                  {settledLabel}
                </span>
              )}
              {task.repo && <span className="font-mono">{task.repo}</span>}
              {recent && !open && (
                <span
                  title={recent.why}
                  className="rounded-full bg-primary/12 px-2 py-px font-medium text-primary"
                >
                  Updated {formatRelative(recent.at)}
                </span>
              )}
            </p>
            {dismissing && (
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
                  onClick={() => setDismissing(false)}
                >
                  <X />
                </Button>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {task.status === 'open' && !dismissing && (
              <>
                {task.action === 'code' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void continueIn(cli)}
                  >
                    <SquareTerminal />
                    Continue in {TOOL[cli]}
                  </Button>
                )}
                {task.action === 'reply' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={drafting}
                    onClick={() => void draft()}
                  >
                    <MessageSquare />
                    Draft a reply
                  </Button>
                )}
                <Button size="sm" onClick={() => onDecide({ status: 'done' })}>
                  <CircleCheck />
                  Done
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDismissing(true)}
                >
                  Dismiss
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="More for this task"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {more.map((item) => (
                      <DropdownMenuItem key={item.label} onSelect={item.run}>
                        {item.icon}
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            {task.status === 'maybe' && !dismissing && (
              <>
                <Button size="sm" onClick={() => onDecide({ status: 'kept' })}>
                  Keep as a task
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDismissing(true)}
                >
                  Dismiss
                </Button>
              </>
            )}
            {settled && (
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
                  aria-label={`Open in ${source.label}`}
                >
                  <ExternalLink />
                </a>
              </Button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-2 pl-6 text-sm text-status-failed">
            {error}
          </p>
        )}
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none">
          <TaskOpen
            task={task}
            drafting={drafting}
            reply={reply}
            onReply={setReply}
            onDraft={() => void draft()}
            onCopy={(text) => void act.copyReply(text).then(setError)}
            onResume={(entryId) => void act.resume(entryId).then(setError)}
          />
        </CollapsibleContent>
      </Collapsible>

      {folderFor && (
        <FolderDialog
          task={task}
          tool={folderFor}
          onClose={() => setFolderFor(undefined)}
          onOpen={async (folder) => {
            const failed = await act.continueIn(folderFor, folder)
            if (failed) return failed
            setFolderFor(undefined)
            return undefined
          }}
        />
      )}
      {open && logEntry && (
        <SessionLogPanel
          taskId={task.id}
          entryId={logEntry}
          onClose={() => (window.location.hash = taskHash(task.id))}
        />
      )}
    </li>
  )
}

/** One earlier thing: a task or Pace's run, with where it came from */
type Earlier = {
  key: string
  group: 'thread' | 'repo' | 'person' | 'work'
  label: string
  task?: RelatedTask
  run?: RelatedRun
  session?: Session
}

/**
 * What came before, as lines: the one most worth knowing first (a session to
 * continue, then Pace in the thread, then the person's task), then the rest
 */
function earlierOf(detail: TaskDetail): { last?: Earlier; rest: Earlier[] } {
  const { context } = detail
  const lines: Earlier[] = [
    ...context.thread.tasks.map((task) => ({
      key: task.id,
      group: 'thread' as const,
      label: 'In this thread',
      task,
    })),
    ...context.thread.runs.map((run) => ({
      key: run.id,
      group: 'thread' as const,
      label: 'In this thread',
      run,
    })),
    ...(context.repo?.tasks ?? []).map((task) => ({
      key: task.id,
      group: 'repo' as const,
      label: 'Same repo',
      task,
    })),
    ...(context.person?.tasks ?? []).map((task) => ({
      key: task.id,
      group: 'person' as const,
      label: `From ${context.person!.name}`,
      task,
    })),
  ]
  const last =
    lines.find((line) => line.task?.session?.session) ??
    lines.find((line) => line.run) ??
    lines.find((line) => line.group === 'person') ??
    lines[0]
  return { last, rest: lines.filter((line) => line !== last) }
}

/** The opened row: a reminder of what it is about and what came before */
function TaskOpen({
  task,
  drafting,
  reply,
  onReply,
  onDraft,
  onCopy,
  onResume,
}: {
  task: TaskView
  drafting: boolean
  reply?: string
  onReply: (text: string) => void
  onDraft: () => void
  onCopy: (text: string) => void
  onResume: (entryId: string) => void
}) {
  const detail = useTaskDetail(task.id).data
  const [all, setAll] = useState(false)
  const replyId = useId()
  const summary = task.summary ?? task.reason
  const settled = !['open', 'maybe'].includes(task.status)
  const change = settled ? undefined : lastChange(task)

  const sessions = (detail?.work ?? []).filter(
    (entry): entry is Session => entry.kind === 'session'
  )
  const latestDraft = detail?.work.find((entry) => entry.kind === 'draft')
  const earlier = detail ? earlierOf(detail) : { rest: [] }
  const rest: Earlier[] = [
    ...sessions.slice(1).map((session) => ({
      key: session.id,
      group: 'work' as const,
      label: 'Your work',
      session,
    })),
    ...earlier.rest,
  ]
  const replyText = reply ?? latestDraft?.text ?? ''
  const showReply = drafting || reply !== undefined || !!latestDraft
  // The reply the session left, until you have copied one
  const waiting =
    reply === undefined &&
    !detail?.work.some((entry) => entry.kind === 'draft' && entry.copiedAt)
      ? task.closed?.reply
      : undefined

  return (
    <div className="flex flex-col gap-2 pt-2.5 pl-6">
      <div className="flex flex-col gap-0.5 rounded-xl bg-well px-3.5 py-3">
        {summary && (
          <p className="mb-1.5 max-w-[44rem] text-[13.5px] leading-relaxed select-text">
            {summary}
          </p>
        )}
        {change && (
          <Line label="Changed">
            <span
              title={change.changed.filter(isNews).map(changeWords).join(' · ')}
              className="select-text"
            >
              {change.why}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelative(change.at)}
            </span>
          </Line>
        )}
        {!detail ? (
          <p className="flex min-h-[30px] items-center text-xs text-muted-foreground">
            Looking for what came before.
          </p>
        ) : (
          <>
            {settled && detail.outcome && (
              <Line label="Result">
                <span className="select-text">{detail.outcome}</span>
              </Line>
            )}
            {earlier.last && (
              <EarlierLine
                line={{ ...earlier.last, label: 'Last time' }}
                taskId={task.id}
                onResume={onResume}
              />
            )}
            {sessions[0] && (
              <EarlierLine
                line={{
                  key: sessions[0].id,
                  group: 'work',
                  label: 'Your work',
                  session: sessions[0],
                }}
                taskId={task.id}
                onResume={onResume}
              />
            )}
            {all &&
              rest.map((line) => (
                <EarlierLine
                  key={line.key}
                  line={line}
                  taskId={task.id}
                  onResume={onResume}
                />
              ))}
            {!earlier.last && !sessions[0] && (
              <p className="flex min-h-[30px] items-center text-xs text-muted-foreground">
                Nothing earlier in this thread
                {task.repo ? `, in ${task.repo}` : ''}
                {task.askedBy && task.kind === 'asked'
                  ? ` or from ${task.askedBy}`
                  : ''}
                .
              </p>
            )}
            {rest.length > 0 && (
              <Button
                size="xs"
                variant="ghost"
                aria-expanded={all}
                className="-ml-2 self-start text-primary"
                onClick={() => setAll(!all)}
              >
                {all ? 'Show less' : `${rest.length} more earlier`}
              </Button>
            )}
          </>
        )}

        {showReply && (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2.5">
            {drafting ? (
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <PaceSpinner active className="size-6" />
                <span className="text-shimmer">
                  Reading the thread, read only, to draft your reply.
                </span>
              </p>
            ) : (
              <>
                <label
                  htmlFor={replyId}
                  className="text-xs text-muted-foreground"
                >
                  {!latestDraft || reply !== undefined
                    ? 'Your reply'
                    : latestDraft.copiedAt
                      ? `Your reply, copied ${formatRelative(latestDraft.copiedAt)}`
                      : `Your reply, drafted from the thread ${formatRelative(latestDraft.at)}`}
                </label>
                <textarea
                  id={replyId}
                  value={replyText}
                  onChange={(event) => onReply(event.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-[10px] border border-input bg-background px-3 py-2.5 text-[13.5px] leading-relaxed outline-none select-text focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => onCopy(replyText)}
                    disabled={!replyText.trim()}
                  >
                    <Copy />
                    Copy and open thread
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onDraft}>
                    <RotateCw />
                    Draft again
                  </Button>
                  <span className="ml-1 text-xs text-muted-foreground">
                    Pacenote never sends it for you.
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {waiting && (
        <div className="flex flex-col gap-2 rounded-xl bg-card-accent px-3.5 py-3">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold">
            <PaceSpinner className="size-5" />
            {task.askedBy
              ? `${task.askedBy} is still waiting in the thread`
              : 'A reply is waiting to be sent'}
          </p>
          <p className="text-[13px] text-foreground/80 select-text">
            The session drafted a reply for you: &ldquo;{waiting}&rdquo;
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => onCopy(waiting)}>
              <Copy />
              Copy and open thread
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onReply(waiting)}>
              Edit it first
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Line({
  label,
  actions,
  children,
}: {
  label: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-[30px] grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1">
        {children}
      </span>
      <span className="flex items-center gap-0.5">{actions}</span>
    </div>
  )
}

const LINK = 'text-primary hover:text-primary'

/**
 * An earlier task, Pace's run or one of your sessions, on one line: its name
 * opens what is behind it (the run, the session's log), and a session can be
 * continued
 */
function EarlierLine({
  line,
  taskId,
  onResume,
}: {
  line: Earlier
  taskId: string
  onResume: (entryId: string) => void
}) {
  const { task, run } = line
  const session = line.session ?? task?.session
  const log = session?.session
    ? taskHash(taskId, `/log/${encodeURIComponent(session.id)}`)
    : undefined
  const action = session?.session ? (
    <Button
      size="xs"
      variant="ghost"
      className={LINK}
      onClick={() => onResume(session.id)}
    >
      Continue
    </Button>
  ) : line.session ? (
    <span className="text-xs text-muted-foreground">
      Waiting for {TOOL[line.session.tool]} to start it
    </span>
  ) : undefined
  const name = (text: string, href?: string, hint?: string) =>
    href ? (
      <a
        href={href}
        title={hint}
        className="font-semibold underline-offset-2 hover:underline"
      >
        {text}
      </a>
    ) : (
      <span className="font-semibold">{text}</span>
    )
  const quiet = (text: string) => (
    <span className="text-xs text-muted-foreground">{text}</span>
  )

  if (run)
    return (
      <Line label={line.label}>
        {name(
          run.request || 'A mention',
          `#/runs/${encodeURIComponent(run.id)}`,
          'Open the run'
        )}
        {quiet(`Pace · ${formatShortDay(run.at)}`)}
      </Line>
    )
  if (task)
    return (
      <Line label={line.label} actions={action}>
        {name(task.title, log, 'Read its session')}
        {quiet(
          [task.outcome, formatShortDay(task.postedAt)]
            .filter(Boolean)
            .join(' · ')
        )}
      </Line>
    )
  if (!line.session) return null
  const own = line.session as Session
  return (
    <Line label={line.label} actions={action}>
      {name(`${TOOL[own.tool]} session`, log, 'Read the session')}
      {quiet(
        own.lastActiveAt
          ? `last active ${formatRelative(own.lastActiveAt)}`
          : `started ${formatRelative(own.startedAt)}`
      )}
    </Line>
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

/** The session behind a log: the task's own, or an earlier task's */
function sessionOf(
  detail: TaskDetail | null | undefined,
  entryId: string
): { entry: Session; title: string } | undefined {
  if (!detail) return undefined
  const own = detail.work.find(
    (item): item is Session => item.kind === 'session' && item.id === entryId
  )
  if (own) return { entry: own, title: detail.task.title }
  const { thread, repo, person } = detail.context
  const earlier = [
    ...thread.tasks,
    ...(repo?.tasks ?? []),
    ...(person?.tasks ?? []),
  ].find((task) => task.session?.id === entryId)
  return earlier?.session
    ? { entry: earlier.session, title: earlier.title }
    : undefined
}

/**
 * A session's own log, read from the tool's files when you open it, in a
 * panel over the list; Esc or the close button puts it away
 */
function SessionLogPanel({
  taskId,
  entryId,
  onClose,
}: {
  taskId: string
  entryId: string
  onClose: () => void
}) {
  const bridge = window.pacenoteDesktop?.tasks
  const act = useTaskWork(taskId)
  const detail = useTaskDetail(taskId)
  const found = sessionOf(detail.data, entryId)
  const [log, setLog] = useState<{ items?: SessionItem[]; error?: string }>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    void bridge?.sessionLog(entryId).then((result) => setLog(result ?? {}))
  }, [bridge, entryId])
  const entry = found?.entry
  const tool = entry ? TOOL[entry.tool] : 'The session'

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/15 animate-in fade-in-0 motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-2 right-2 z-50 flex w-[40rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[18px] bg-card shadow-2xl outline-none animate-in fade-in-0 slide-in-from-right-8 duration-200 motion-reduce:animate-none"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pr-2 pl-5">
            <Dialog.Title className="text-sm font-semibold">
              Session log
            </Dialog.Title>
            <span className="flex-1" />
            <Dialog.Close asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Close the log">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 px-6 py-5">
              {!entry ? (
                <p className="text-sm text-muted-foreground">
                  {detail.isPending
                    ? 'Finding the session.'
                    : 'There is no such session.'}
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <h2 className="text-base font-semibold tracking-tight">
                      {found.title}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {tool} session ·{' '}
                      <span className="font-mono">{entry.cwd}</span> ·{' '}
                      {formatDateTime(entry.startedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void act.resume(entry.id).then(setError)}
                      disabled={!entry.session}
                    >
                      <SquareTerminal />
                      Continue in {tool}
                    </Button>
                    {entry.session && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void navigator.clipboard.writeText(
                            `${entry.tool === 'claude' ? 'claude --resume' : 'codex resume'} ${entry.session}`
                          )
                        }
                      >
                        <Copy />
                        <span className="font-mono text-xs">
                          {entry.tool === 'claude'
                            ? 'claude --resume'
                            : 'codex resume'}{' '}
                          {entry.session.slice(0, 8)}…
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
                              {item.role === 'user' ? 'Y' : tool[0]}
                            </span>
                            <div
                              className={cn(
                                'min-w-0 flex-1 rounded-[20px] px-4 py-3',
                                item.role === 'user'
                                  ? 'bg-well'
                                  : 'border border-border'
                              )}
                            >
                              <p className="text-sm font-semibold">
                                {item.role === 'user' ? 'You' : tool}
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
                    Read from {tool}&apos;s own session log on this Mac when you
                    opened it. Pacenote keeps only the session&apos;s id, folder
                    and times.
                  </p>
                </>
              )}
            </div>
          </ScrollArea>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
