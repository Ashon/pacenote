import { sourceOf } from '@src/tasks/sources'
import type {
  DismissReason,
  FolderCheck,
  Proposal,
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
import { useEffect, useId, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { motionItem, useFlash, usePresence } from '@/components/ui/motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip } from '@/components/ui/tooltip'
import { formatDateTime, formatRelative, formatShortDay } from '@/lib/format'
import {
  taskDetailQuery,
  useGroupAnswer,
  useProposal,
  useRepoFolders,
  useTaskDetail,
  useTaskWork,
} from '@/lib/tasks'
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
  motion,
  cli,
  working,
  live,
  follows,
  proposal,
  askGroup,
  open,
  gone,
  logEntry,
  onToggle,
  onDecide,
}: {
  task: TaskView
  /** Its list's motion as it comes and goes (useListMotion) */
  motion?: Parameters<typeof motionItem>[0]
  /** Where code tasks continue */
  cli: WorkTool
  /** Its latest session: the tool and when it was last active */
  working?: { tool: WorkTool; at: string }
  /** An AI tool working on it now over MCP (tasks-activity.jsonl) */
  live?: { by?: string; at: string }
  /** The title of the task it carries on from, for one a session left */
  follows?: string
  /** Its quiet session says it looks done (done-watch.ts) */
  proposal?: Proposal
  /**
   * The user group a Maybe was asked of, when you have not said whether it
   * means you
   */
  askGroup?: string
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
  const proposed = useProposal(task.id)
  // Looks done: a mark on the closed row that fades in and out
  const looksDone = usePresence<HTMLSpanElement>(
    Boolean(proposal) && task.status === 'open' && !open
  )
  // Its repository's folder: Continue opens there without asking.
  const folder = repoFolderOf(useRepoFolders().data, task.repo)
  const [dismissing, setDismissing] = useState(false)
  // Whether its group means you: asked on the row, then gone once answered
  const answerGroup = useGroupAnswer()
  const asking = usePresence(Boolean(askGroup) && !dismissing)
  const askedGroup = useRef(askGroup)
  if (askGroup) askedGroup.current = askGroup
  // The folder dialog, kept for the tool it was for while it closes
  const [folderAsk, setFolderAsk] = useState<{
    tool: WorkTool
    open: boolean
  }>()
  const askFolder = (tool: WorkTool) => setFolderAsk({ tool, open: true })
  const [drafting, setDrafting] = useState(false)
  const [reply, setReply] = useState<string>()
  const [error, setError] = useState<string>()
  const row = useRef<HTMLLIElement>(null)
  // What an AI tool changes while the row is in view lights up a moment.
  const flash = useFlash({ title: task.title, due: task.due, repo: task.repo })
  // An AI tool at work on it: a mark that fades in and, once it is done,
  // out, still naming the tool as it goes
  const atWork = usePresence<HTMLSpanElement>(
    Boolean(live) && task.status === 'open'
  )
  const liveTool = useRef('an AI tool')
  if (live) liveTool.current = closedBy(live.by) ?? 'an AI tool'

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
    else askFolder(tool)
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

  // From a session on this Mac, it has no thread: no reply to draft.
  const local = task.source.app === 'local'
  const who = local
    ? follows
      ? `Left after \u201c${follows}\u201d`
      : 'Kept from a session'
    : task.kind === 'promised'
      ? 'You said you would'
      : task.askedBy
        ? `${task.askedBy} asked ${task.group ?? 'you'}`
        : task.group
          ? `Asked of ${task.group}`
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
    ...(folder
      ? [
          {
            label: 'Continue in another folder',
            icon: <FolderOpen />,
            run: () => {
              setError(undefined)
              if (!open) onToggle()
              askFolder(cli)
            },
          },
        ]
      : []),
    ...(task.action === 'reply' || local
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
      {...(motion && motionItem(motion))}
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
                className="group -ml-6 flex items-start gap-2 rounded-sm text-left text-sm leading-snug font-semibold outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-primary',
                    open && 'rotate-90'
                  )}
                />
                <span
                  {...flash('title')}
                  className={cn(
                    'motion-flash rounded-sm',
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
                <span
                  {...flash('due')}
                  className="motion-flash rounded-full bg-status-interrupted/12 px-2 py-px font-medium text-status-interrupted"
                >
                  {task.due}
                </span>
              )}
              {settledLabel && (
                <span className="rounded-full bg-muted px-2 py-px font-medium">
                  {settledLabel}
                </span>
              )}
              {task.repo && (
                <span
                  {...flash('repo')}
                  className="motion-flash rounded-sm font-mono"
                >
                  {task.repo}
                </span>
              )}
              {atWork.mounted && (
                <span
                  ref={atWork.ref}
                  data-state={atWork.state}
                  className="motion-fade inline-flex items-center gap-1.5 font-medium text-status-running"
                >
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-status-running" />
                  Working in {liveTool.current}
                </span>
              )}
              {working && task.status === 'open' && !atWork.mounted && (
                <span
                  title={`Last active in its ${TOOL[working.tool]} session`}
                  className="inline-flex items-center gap-1"
                >
                  <SquareTerminal aria-hidden="true" className="size-3" />
                  {TOOL[working.tool]} {formatRelative(working.at)}
                </span>
              )}
              {looksDone.mounted && (
                <span
                  ref={looksDone.ref}
                  data-state={looksDone.state}
                  title={proposal?.summary}
                  className="motion-fade rounded-full bg-primary/12 px-2 py-px font-medium text-primary"
                >
                  Looks done
                </span>
              )}
              {recent && !open && (
                <span
                  title={recent.why}
                  className="rounded-full bg-primary/12 px-2 py-px font-medium text-primary"
                >
                  Updated {formatRelative(recent.at)}
                </span>
              )}
            </p>
            {asking.mounted && (
              <div
                ref={asking.ref}
                data-state={asking.state}
                className="motion-fade mt-2 flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={`Whether ${askedGroup.current} means you`}
              >
                <span className="mr-1 text-xs text-muted-foreground">
                  Does {askedGroup.current} mean you?
                </span>
                {[
                  { label: 'It’s me', yours: true },
                  { label: 'Not me', yours: false },
                ].map(({ label, yours }) => (
                  <Button
                    key={label}
                    size="xs"
                    variant={yours ? 'outline' : 'ghost'}
                    onClick={() =>
                      void answerGroup(askedGroup.current!, yours).then(
                        setError
                      )
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
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
                  <OpensIn folder={folder}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void continueIn(cli)}
                    >
                      <SquareTerminal />
                      Continue in {TOOL[cli]}
                    </Button>
                  </OpensIn>
                )}
                {task.action === 'reply' && !local && (
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
        <CollapsibleContent>
          <TaskOpen
            task={task}
            drafting={drafting}
            reply={reply}
            onReply={setReply}
            onDraft={() => void draft()}
            onCopy={(text) => void act.copyReply(text).then(setError)}
            onResume={(entryId) => void act.resume(entryId).then(setError)}
            onAnswer={(entryId, yes) => void act.answer(entryId, yes)}
            proposal={task.status === 'open' ? proposal : undefined}
            onProposal={(answer) => void proposed.answer(answer).then(setError)}
            onKeep={(text) => void proposed.keep(text).then(setError)}
          />
        </CollapsibleContent>
      </Collapsible>

      {folderAsk && (
        <FolderDialog
          task={task}
          tool={folderAsk.tool}
          open={folderAsk.open}
          onClose={() => setFolderAsk({ ...folderAsk, open: false })}
          onOpen={async (folder) => {
            const failed = await act.continueIn(folderAsk.tool, folder)
            if (failed) return failed
            setFolderAsk({ ...folderAsk, open: false })
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
  onAnswer,
  proposal,
  onProposal,
  onKeep,
}: {
  task: TaskView
  drafting: boolean
  reply?: string
  onReply: (text: string) => void
  onDraft: () => void
  onCopy: (text: string) => void
  onResume: (entryId: string) => void
  /** A suggested session: the task's work, or not */
  onAnswer: (entryId: string, yes: boolean) => void
  /** What its quiet session looked like, waiting for you */
  proposal?: Proposal
  onProposal: (answer: 'close' | 'not-yet') => void
  /** Keeps a thing left after it as a task of its own */
  onKeep: (text: string) => void
}) {
  const detail = useTaskDetail(task.id).data
  const [all, setAll] = useState(false)
  const replyId = useId()
  const summary = task.summary ?? task.reason
  const settled = !['open', 'maybe'].includes(task.status)
  const change = settled ? undefined : lastChange(task)
  const flash = useFlash({ summary })

  const sessions = (detail?.work ?? []).filter(
    (entry): entry is Session => entry.kind === 'session'
  )
  const suggested = settled ? [] : (detail?.suggested ?? [])
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
          <p
            {...flash('summary')}
            className="motion-flash mb-1.5 max-w-[44rem] rounded-sm text-body leading-relaxed select-text"
          >
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
            {proposal && (
              <LooksDone
                proposal={proposal}
                onAnswer={onProposal}
                onKeep={onKeep}
              />
            )}
            {settled && (task.wrapUp || detail.outcome) && (
              <Line label="Result">
                {task.wrapUp ? (
                  <>
                    <span className="max-w-[40rem] select-text">
                      {task.wrapUp.text}
                    </span>
                    {detail.outcome && (
                      <span className="text-xs text-muted-foreground">
                        {detail.outcome}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="select-text">{detail.outcome}</span>
                )}
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
            {suggested.map((suggestion) => (
              <SuggestedLine
                key={suggestion.id}
                suggestion={suggestion}
                taskId={task.id}
                onAnswer={onAnswer}
              />
            ))}
            {all &&
              rest.map((line) => (
                <EarlierLine
                  key={line.key}
                  line={line}
                  taskId={task.id}
                  onResume={onResume}
                />
              ))}
            {!earlier.last && !sessions[0] && !suggested.length && (
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
              <p className="flex items-center gap-2 text-body text-muted-foreground">
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
                  className="w-full resize-y rounded-[10px] border border-input bg-background px-3 py-2.5 text-body leading-relaxed outline-none select-text focus-visible:ring-[3px] focus-visible:ring-ring/40"
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
          <p className="flex items-center gap-2 text-body font-semibold">
            <PaceSpinner className="size-5" />
            {task.askedBy
              ? `${task.askedBy} is still waiting in the thread`
              : 'A reply is waiting to be sent'}
          </p>
          <p className="text-body text-foreground/80 select-text">
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
    <div className="grid min-h-[30px] grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3 text-body">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1">
        {children}
      </span>
      <span className="flex items-center gap-0.5">{actions}</span>
    </div>
  )
}

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
  // The terminal icon of the row's own Continue button: it opens there too.
  // Its name is a tooltip at its left, clear of the lines' icons above.
  const resume = session?.session
    ? `Continue ${task ? 'its' : 'this'} session in ${TOOL[session.tool]}`
    : ''
  const action = session?.session ? (
    <Tooltip content={resume} side="left">
      <Button
        size="icon-sm"
        variant="outline"
        aria-label={resume}
        className="text-primary"
        onClick={() => onResume(session.id)}
      >
        <SquareTerminal />
      </Button>
    </Tooltip>
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
  const quiet = (text: string, hint?: string) => (
    <span title={hint} className="text-xs text-muted-foreground">
      {text}
    </span>
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
        {/* How it ended, from its thread, on hover */}
        {quiet(
          [task.outcome, formatShortDay(task.postedAt)]
            .filter(Boolean)
            .join(' · '),
          task.wrapUp
        )}
      </Line>
    )
  if (!line.session) return null
  const own = line.session as Session
  return (
    <Line label={line.label} actions={action}>
      {name(`${TOOL[own.tool]} session`, log, 'Read the session')}
      {quiet(
        [
          own.branch,
          own.lastActiveAt
            ? `last active ${formatRelative(own.lastActiveAt)}`
            : `started ${formatRelative(own.startedAt)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        foundHint(own)
      )}
    </Line>
  )
}

/** How a session you started yourself was known as the task's work */
function foundHint(session: Session): string | undefined {
  if (!session.found) return undefined
  switch (session.foundBy) {
    case 'link':
      return "Found: what you typed has this task's Slack message"
    case 'branch':
      return `Found: it worked on ${session.branch ?? 'the branch'}, where this task's work is`
    case 'you':
      return 'You said it is this task’s work'
    default:
      return "Found: it used Pacenote's task tools for this task"
  }
}

type Suggestion = NonNullable<TaskDetail['suggested']>[number]

/**
 * A session that only looks like the task's work, by what they share: you
 * say whether it is, and its log opens like any other
 */
/**
 * What the task's quiet session looked like: done, how it ended, what is left.
 * Close it closes the task with that; Not yet waits for the session to go on.
 * Each thing left can be kept as a task of its own.
 */
function LooksDone({
  proposal,
  onAnswer,
  onKeep,
}: {
  proposal: Proposal
  onAnswer: (answer: 'close' | 'not-yet') => void
  onKeep: (text: string) => void
}) {
  const tool = TOOL[proposal.tool]
  return (
    <>
      <Line
        label="Looks done"
        actions={
          <>
            <Button size="xs" onClick={() => onAnswer('close')}>
              <CircleCheck />
              Close it
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onAnswer('not-yet')}
            >
              Not yet
            </Button>
          </>
        }
      >
        <span className="max-w-[40rem] select-text">
          {proposal.summary ?? `Its ${tool} session looks finished.`}
        </span>
        <span className="text-xs text-muted-foreground">
          {[
            `From its ${tool} session`,
            proposal.pr &&
              `#${proposal.pr.number} ${proposal.pr.state.toLowerCase()}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </Line>
      {(proposal.left ?? []).map((item) => (
        <Line
          key={item}
          label="Left"
          actions={
            <Button size="xs" variant="outline" onClick={() => onKeep(item)}>
              Keep as a task
            </Button>
          }
        >
          <span className="select-text">{item}</span>
        </Line>
      ))}
    </>
  )
}

function SuggestedLine({
  suggestion,
  taskId,
  onAnswer,
}: {
  suggestion: Suggestion
  taskId: string
  onAnswer: (entryId: string, yes: boolean) => void
}) {
  return (
    <Line
      label="Looks related"
      actions={
        <>
          <Button
            size="xs"
            variant="outline"
            aria-label="Link this session to the task"
            onClick={() => onAnswer(suggestion.id, true)}
          >
            Link
          </Button>
          <Button
            size="xs"
            variant="ghost"
            aria-label="Not this task's session"
            onClick={() => onAnswer(suggestion.id, false)}
          >
            Not it
          </Button>
        </>
      }
    >
      <a
        href={taskHash(taskId, `/log/${encodeURIComponent(suggestion.id)}`)}
        title="Read the session"
        className="font-semibold underline-offset-2 hover:underline"
      >
        {TOOL[suggestion.tool]} session
      </a>
      <span title={suggestion.cwd} className="text-xs text-muted-foreground">
        {[
          `mentions ${suggestion.shares.join(', ')}`,
          suggestion.lastActiveAt
            ? `last active ${formatRelative(suggestion.lastActiveAt)}`
            : `started ${formatRelative(suggestion.startedAt)}`,
        ].join(' · ')}
      </span>
    </Line>
  )
}

/** A repository's folder, by its name in any case */
const repoFolderOf = (
  repos: Record<string, string> | undefined,
  repo: string | undefined
) =>
  repo
    ? Object.entries(repos ?? {}).find(
        ([name]) => name.toLowerCase() === repo.toLowerCase()
      )?.[1]
    : undefined

/** A folder under your home folder, as ~/… */
const tilde = (folder: string) => folder.replace(/^\/Users\/[^/]+(?=\/|$)/, '~')

/** Continue, with where it opens on hover when it opens without asking */
function OpensIn({
  folder,
  children,
}: {
  folder: string | undefined
  children: React.ReactElement
}) {
  if (!folder) return children
  return <Tooltip content={`Opens in ${tilde(folder)}`}>{children}</Tooltip>
}

type FolderProps = {
  task: TaskView
  tool: WorkTool
  onOpen: (folder: string) => Promise<string | undefined>
}

/**
 * Where the session opens, when its repository has no folder yet (or you
 * choose another): the likeliest folders, the first one chosen. The folders
 * are looked up each time it opens.
 */
function FolderDialog({
  open,
  onClose,
  ...props
}: FolderProps & { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[34rem] max-w-[calc(100vw-2rem)] gap-4 p-6">
        <FolderChoice {...props} />
      </DialogContent>
    </Dialog>
  )
}

function FolderChoice({ task, tool, onOpen }: FolderProps) {
  const bridge = window.pacenoteDesktop?.tasks
  const [found, setFound] = useState<FolderCheck[]>()
  const [chosen, setChosen] = useState<string>()
  const [error, setError] = useState<string>()
  const [opening, setOpening] = useState(false)
  useEffect(() => {
    void bridge?.folders(task.id).then((folders) => {
      setFound(folders)
      setChosen((current) => current ?? folders[0]?.path)
    })
  }, [bridge, task.id])
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
    <>
      <div className="flex flex-col gap-1.5">
        <DialogTitle className="text-base font-semibold">
          {task.repo
            ? `Where is ${task.repo} on this Mac?`
            : 'Where should the session open?'}
        </DialogTitle>
        <DialogDescription className="text-body text-muted-foreground">
          {TOOL[tool]} opens in this folder with the task.
          {task.repo
            ? ' Pacenote remembers it for this repository; change it in Settings > Todo.'
            : ''}
        </DialogDescription>
      </div>
      <div
        role="radiogroup"
        aria-label="Folder"
        className="flex flex-col gap-2"
      >
        {found === undefined && (
          <p className="text-body text-muted-foreground">
            {task.repo
              ? `Looking for ${task.repo} on this Mac.`
              : 'Looking for the folders you worked in.'}
          </p>
        )}
        {found?.length === 0 && task.repo && (
          <p className="text-body text-muted-foreground">
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
              <span className="font-mono text-body font-semibold break-all">
                {folder.path}
              </span>
              <span className="text-xs text-muted-foreground">
                {[
                  folder.error?.replace(/\.$/, '') ??
                    [
                      folder.remote
                        ? `Its remote is ${folder.remote}`
                        : 'No remote',
                      folder.changes
                        ? `${folder.changes} changes not committed`
                        : 'clean',
                    ].join(' · '),
                  !folder.matches && !folder.error && task.repo
                    ? `not ${task.repo}`
                    : undefined,
                  folder.usedAt
                    ? `used ${formatRelative(folder.usedAt)}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
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
        {TOOL[tool]} runs as you, with your own permissions, and asks you before
        it changes anything. Pacenote opens the session and hands it the task;
        it runs no commands itself.
      </p>
      {error && (
        <p role="alert" className="text-sm text-status-failed">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
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
    </>
  )
}

/** The session behind a log: the task's own, or an earlier task's */
function sessionOf(
  detail: TaskDetail | null | undefined,
  entryId: string
): { entry: Session; title: string } | undefined {
  if (!detail) return undefined
  const own =
    detail.work.find(
      (item): item is Session => item.kind === 'session' && item.id === entryId
    ) ?? detail.suggested?.find((item) => item.id === entryId)
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant="sheet"
        aria-describedby={undefined}
        className="w-[40rem] max-w-[calc(100vw-1rem)]"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pr-2 pl-5">
          <DialogTitle className="text-sm font-semibold">
            Session log
          </DialogTitle>
          <span className="flex-1" />
          <DialogClose asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Close the log">
              <X />
            </Button>
          </DialogClose>
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
                          className="ml-10 flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-xs"
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
                                <span className="ml-2 text-2xs font-normal text-muted-foreground">
                                  {formatDateTime(item.at)}
                                </span>
                              )}
                            </p>
                            <p className="mt-1 text-body leading-relaxed whitespace-pre-wrap text-foreground/85 select-text">
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
      </DialogContent>
    </Dialog>
  )
}
