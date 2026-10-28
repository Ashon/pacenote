import { localized } from '@src/i18n/locale'
import { CLI_NAMES } from '@src/tasks/own-ai'
import { ADDED_BY_YOU, LOCAL, sourceOf } from '@src/tasks/sources'
import type { StageRecord, TaskStage } from '@src/tasks/stage'
import type {
  DismissReason,
  FolderCheck,
  Proposal,
  RelatedRun,
  RelatedTask,
  SessionItem,
  TaskDecision,
  TaskDetail,
  TaskUpdate,
  TaskView,
  WorkTool,
} from '@src/tasks/types'
import type { MacsView } from '@src/macs/types'
import type { TaskArea } from '@src/you/types'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight,
  CircleCheck,
  CirclePause,
  Clock,
  Copy,
  ExternalLink,
  FolderOpen,
  Lock,
  MessageSquare,
  MessagesSquare,
  MoreHorizontal,
  Play,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { motionItem, useFlash, usePresence } from '@/components/ui/motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip } from '@/components/ui/tooltip'
import { formatDateTime, formatRelative, formatShortDay } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { macNamed, useMacs } from '@/lib/macs'
import { daysSince } from '@/lib/today'
import {
  taskDetailQuery,
  taskHash,
  useGroupAnswer,
  useProposal,
  useRepoFolders,
  useTaskDetail,
  useTaskWork,
} from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { areaHash } from '@/lib/you'
import { switchLine } from './own-ai-status'
import { PaceSpinner } from './pace-spinner'
import { text } from './task-row.text'

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

/** A Codex session from the Codex app continues there; others in a terminal */
const resumesInApp = (session: Session) =>
  !!session.app && session.tool === 'codex'

const DISMISS_REASONS: DismissReason[] = [
  'not-mine',
  'done-already',
  'not-worth-it',
]

/**
 * The AI tool that closed a task, or is at work on your tasks, by its MCP
 * client name ("claude-code")
 */
export function closedBy(client: string | undefined): string | undefined {
  if (!client) return undefined
  if (/claude/i.test(client)) return CLI_NAMES.claude
  if (/codex/i.test(client)) return CLI_NAMES.codex
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

/**
 * A change in words: "Due Thursday → Wednesday" (the due dates are the AI's
 * words, as the thread had them)
 */
function changeWords(change: Change): string {
  const t = localized(text)
  const { from, to } = change
  switch (change.field) {
    case 'due':
      return from && to
        ? t.dueMoved(from, to)
        : to
          ? t.due(to)
          : t.noLongerDue(from)
    case 'title':
      return t.wasTitle(from)
    case 'confidence':
      return to === 'sure' ? t.nowSure : t.nowMaybe
    case 'repo':
      return to ? t.repo(to) : t.noRepo
    case 'action':
      return t.nowAction(t.actionWord[to ?? ''] ?? to)
    case 'summary':
      return t.summaryUpdated
  }
}

const WEEK = 7 * 24 * 60 * 60_000

export function TaskRow({
  task,
  motion,
  cli,
  tools = ['claude', 'codex'],
  opensIn,
  working,
  live,
  stage,
  follows,
  proposal,
  area,
  askGroup,
  open,
  gone,
  logEntry,
  onToggle,
  onDecide,
  onStage,
}: {
  task: TaskView
  /** Its list's motion as it comes and goes (useListMotion) */
  motion?: Parameters<typeof motionItem>[0]
  /** Where code tasks continue */
  cli: WorkTool
  /** The tools a code task can continue in here */
  tools?: readonly WorkTool[]
  /** Where each tool's new sessions open: its desktop app, or a terminal */
  opensIn?: Record<WorkTool, 'app' | 'terminal'>
  /** Its latest session: the tool and when it was last active */
  working?: { tool: WorkTool; at: string }
  /** An AI tool working on it now over MCP (tasks-activity.jsonl) */
  live?: { by?: string; at: string }
  /** Open, it may be in progress or waiting on someone (src/tasks/stage.ts) */
  stage?: TaskStage
  /** The title of the task it carries on from, for one a session left */
  follows?: string
  /** Its quiet session says it looks done (done-watch.ts) */
  proposal?: Proposal
  /** The area of your work it is in (You), linked to it */
  area?: TaskArea
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
  onDecide: (decision: Omit<TaskDecision, 'at'> | null) => void
  /** Sets its stage, or open again */
  onStage?: (stage: StageRecord['stage']) => void
}) {
  const t = useText(text)
  const client = useQueryClient()
  const act = useTaskWork(task.id)
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
  // What to do in the desktop app a session opened in, or why it did not,
  // and when it was said
  const [note, setNote] = useState<{ text: string; at: number }>()
  const noteOf = (text?: string) =>
    setNote(text ? { text, at: Date.now() } : undefined)
  const row = useRef<HTMLLIElement>(null)
  // What an AI tool changes while the row is in view lights up a moment.
  const flash = useFlash({ title: task.title, due: task.due, repo: task.repo })
  // An AI tool at work on it: a mark that fades in and, once it is done,
  // out, still naming the tool as it goes
  const atWork = usePresence<HTMLSpanElement>(
    Boolean(live) && task.status === 'open'
  )
  const liveTool = useRef<string>(undefined)
  if (live) liveTool.current = closedBy(live.by)

  // The note goes once a session of the task is at work after it.
  useEffect(() => {
    if (note && working && Date.parse(working.at) >= note.at) setNote(undefined)
  }, [note, working])

  // Opened from a link, the row comes into view.
  useEffect(() => {
    if (open) row.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const continueIn = async (tool: WorkTool) => {
    setError(undefined)
    setNote(undefined)
    if (!open) onToggle()
    // A folder the repository was opened in before goes straight on.
    const detail = await client.fetchQuery(taskDetailQuery(task.id))
    if (!detail?.folder) return askFolder(tool)
    const result = await act.continueIn(tool, detail.folder)
    setError(result.error)
    noteOf(result.note)
  }
  const draft = async () => {
    setError(undefined)
    setNote(undefined)
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
    ? task.addedBy === ADDED_BY_YOU
      ? t.addedByYou
      : follows
        ? t.leftAfter(follows)
        : t.keptFromSession
    : task.kind === 'promised'
      ? t.promised
      : task.askedBy
        ? t.askedBy(task.askedBy, task.group)
        : task.group
          ? t.askedOf(task.group)
          : undefined
  // This Mac is kept in English in the task, as AI tools read it too
  const sourceLabel = local ? t.thisMac : sourceOf(task).label
  const by = closedBy(task.closed?.by)
  const settledLabel =
    task.status === 'closed'
      ? by
        ? t.closedIn(by)
        : task.closed?.why === 'resolved'
          ? t.settledIn(sourceLabel)
          : t.settled[task.closed?.why ?? '']
      : task.status === 'dismissed'
        ? t.settled[task.dismissReason ?? 'dismissed']
        : t.settled[task.status]
  const settled = !['open', 'maybe'].includes(task.status)
  const acting = task.status === 'open' && !dismissing
  const change = settled ? undefined : lastChange(task)
  const recent =
    change && Date.now() - Date.parse(change.at) < WEEK ? change : undefined

  const dismiss = (
    <Button size="sm" variant="secondary" onClick={() => setDismissing(true)}>
      {t.dismiss}
    </Button>
  )
  const continueItem = (tool: WorkTool) => ({
    label: t.continueIn(CLI_NAMES[tool]),
    icon: <SquareTerminal />,
    run: () => void continueIn(tool),
  })
  // The steps the row's own button does not take
  const more: { label: string; icon: React.ReactNode; run: () => void }[] = [
    ...(task.action === 'code' ? [] : [continueItem(cli)]),
    ...tools.filter((tool) => tool !== cli).map(continueItem),
    ...(folder
      ? [
          {
            label: t.continueElsewhere,
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
            label: t.draftReply,
            icon: <MessageSquare />,
            run: () => void draft(),
          },
        ]),
  ]
  // Where it stands: in progress, or waiting on someone else
  const stageItems: typeof more = onStage
    ? [
        stage?.stage === 'started'
          ? {
              label: t.notInProgress,
              icon: <CirclePause />,
              run: () => onStage('open'),
            }
          : {
              label: t.markInProgress,
              icon: <Play />,
              run: () => onStage('started'),
            },
        ...(stage?.stage === 'waiting'
          ? []
          : [
              {
                label: t.waitingOnSomeone,
                icon: <Clock />,
                run: () => onStage('waiting'),
              },
            ]),
      ]
    : []

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
                className="group -ml-6 flex items-start gap-2 rounded-sm text-left text-section leading-snug outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
              {[
                who,
                local && task.source.label === LOCAL.label
                  ? t.thisMac
                  : task.source.label,
                formatRelative(task.postedAt),
              ]
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
              {stage?.stage === 'started' && !atWork.mounted && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2 py-px font-medium text-primary">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-primary"
                  />
                  {t.inProgress}
                </span>
              )}
              {stage?.stage === 'waiting' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-px font-medium">
                  <Clock aria-hidden="true" className="size-3" />
                  {t.waitingFor(daysSince(stage.at))}
                </span>
              )}
              {area && (
                <a
                  href={areaHash(area.id)}
                  title={t.inArea(area.name)}
                  className="rounded-full bg-muted px-2 py-px font-medium hover:text-foreground"
                >
                  {area.name}
                </a>
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
                  {t.workingIn(liveTool.current)}
                </span>
              )}
              {working && task.status === 'open' && !atWork.mounted && (
                <span
                  title={t.lastActiveIn(CLI_NAMES[working.tool])}
                  className="inline-flex items-center gap-1"
                >
                  <SquareTerminal aria-hidden="true" className="size-3" />
                  {CLI_NAMES[working.tool]} {formatRelative(working.at)}
                </span>
              )}
              {looksDone.mounted && (
                <span
                  ref={looksDone.ref}
                  data-state={looksDone.state}
                  title={proposal?.summary}
                  className="motion-fade rounded-full bg-primary/12 px-2 py-px font-medium text-primary"
                >
                  {t.looksDone}
                </span>
              )}
              {recent && !open && (
                <span
                  title={recent.why}
                  className="rounded-full bg-primary/12 px-2 py-px font-medium text-primary"
                >
                  {t.updated(formatRelative(recent.at))}
                </span>
              )}
            </p>
            {asking.mounted && (
              <div
                ref={asking.ref}
                data-state={asking.state}
                className="motion-fade mt-2 flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t.groupAsk(askedGroup.current!)}
              >
                <span className="mr-1 text-meta text-muted-foreground">
                  {t.groupMeansYou(askedGroup.current!)}
                </span>
                {[
                  { label: t.itsMe, yours: true },
                  { label: t.notMe, yours: false },
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
                aria-label={t.whyDismiss}
              >
                {DISMISS_REASONS.map((reason) => (
                  <Button
                    key={reason}
                    size="xs"
                    variant="outline"
                    onClick={() => onDecide({ status: 'dismissed', reason })}
                  >
                    {t.dismissReason[reason]}
                  </Button>
                ))}
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onDecide({ status: 'dismissed' })}
                >
                  {t.justDismiss}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t.keepIt}
                  onClick={() => setDismissing(false)}
                >
                  <X />
                </Button>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {acting && task.action === 'code' && (
              <OpensIn
                folder={folder}
                app={opensIn?.[cli] === 'app' ? cli : undefined}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void continueIn(cli)}
                >
                  <SquareTerminal />
                  {t.continueIn(CLI_NAMES[cli])}
                </Button>
              </OpensIn>
            )}
            {acting && task.action === 'reply' && !local && (
              <Button
                size="sm"
                variant="outline"
                disabled={drafting}
                onClick={() => void draft()}
              >
                <MessageSquare />
                {t.draftReply}
              </Button>
            )}
            {/* Before the task's own buttons, so they keep their place in
                rows with no link */}
            {task.source.permalink && (
              <Button size="icon-sm" variant="outline" asChild>
                <a
                  href={task.source.permalink}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t.openIn(sourceLabel)}
                >
                  <ExternalLink />
                </a>
              </Button>
            )}
            {acting && stage?.stage === 'waiting' && onStage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onStage('open')}
              >
                <Undo2 />
                {t.backToOpen}
              </Button>
            )}
            {acting && (
              <>
                <Button size="sm" onClick={() => onDecide({ status: 'done' })}>
                  <CircleCheck />
                  {t.done}
                </Button>
                {dismiss}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t.moreForTask}
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
                    {more.length > 0 && stageItems.length > 0 && (
                      <DropdownMenuSeparator />
                    )}
                    {stageItems.map((item) => (
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
                  {t.keepAsTask}
                </Button>
                {dismiss}
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
                {t.reopen}
              </Button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-2 pl-6 text-copy text-status-failed">
            {error}
          </p>
        )}
        {note && !error && (
          <p
            role="status"
            className="mt-2 pl-6 text-copy text-pretty text-muted-foreground"
          >
            {note.text}
          </p>
        )}
        <CollapsibleContent>
          <TaskOpen
            task={task}
            drafting={drafting}
            reply={reply}
            onReply={setReply}
            onDraft={() => void draft()}
            onStartHere={(tool) => void continueIn(tool)}
            proposal={task.status === 'open' ? proposal : undefined}
            onError={setError}
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
            const result = await act.continueIn(folderAsk.tool, folder)
            if (result.error) return result.error
            noteOf(result.note)
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
  const t = localized(text)
  const { thread, repo, person } = detail.context
  const tasks = (
    group: Earlier['group'],
    label: string,
    list: RelatedTask[] = []
  ) => list.map((task): Earlier => ({ key: task.id, group, label, task }))
  const lines = [
    ...tasks('thread', t.inThread, thread.tasks),
    ...thread.runs.map((run): Earlier => ({
      key: run.id,
      group: 'thread',
      label: t.inThread,
      run,
    })),
    ...tasks('repo', t.sameRepo, repo?.tasks),
    ...(person ? tasks('person', t.fromPerson(person.name), person.tasks) : []),
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
  onStartHere,
  proposal,
  onError,
}: {
  task: TaskView
  drafting: boolean
  reply?: string
  onReply: (text: string) => void
  onDraft: () => void
  /** A session on another of your Macs: a new one here instead */
  onStartHere: (tool: WorkTool) => void
  /** What its quiet session looked like, waiting for you */
  proposal?: Proposal
  /** What went wrong with something done here, or none */
  onError: (error: string | undefined) => void
}) {
  const t = useText(text)
  const detail = useTaskDetail(task.id).data
  const act = useTaskWork(task.id)
  const proposed = useProposal(task.id)
  const copy = (text: string) => void act.copyReply(text).then(onError)
  const macs = useMacs()
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
  const work = (session: Session): Earlier => ({
    key: session.id,
    group: 'work',
    label: t.yourWork,
    session,
  })
  const rest = [...sessions.slice(1).map(work), ...earlier.rest]
  const earlierLine = (line: Earlier) => (
    <EarlierLine
      key={line.key}
      line={line}
      taskId={task.id}
      macs={macs}
      onResume={(entryId) => void act.resume(entryId).then(onError)}
      onStartHere={onStartHere}
    />
  )
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
          <Line label={t.changed}>
            <span
              title={change.changed.filter(isNews).map(changeWords).join(' · ')}
              className="select-text"
            >
              {change.why}
            </span>
            <span className="text-meta text-muted-foreground">
              {formatRelative(change.at)}
            </span>
          </Line>
        )}
        {!detail ? (
          <p className="flex min-h-[30px] items-center text-meta text-muted-foreground">
            {t.lookingEarlier}
          </p>
        ) : (
          <>
            {proposal && (
              <LooksDone
                proposal={proposal}
                onAnswer={(answer) =>
                  void proposed.answer(answer).then(onError)
                }
                onKeep={(text) => void proposed.keep(text).then(onError)}
              />
            )}
            {settled && (task.wrapUp || detail.outcome) && (
              <Line label={t.result}>
                {task.wrapUp ? (
                  <>
                    <span className="max-w-[40rem] select-text">
                      {task.wrapUp.text}
                    </span>
                    {detail.outcome && (
                      <span className="text-meta text-muted-foreground">
                        {detail.outcome}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="select-text">{detail.outcome}</span>
                )}
              </Line>
            )}
            {earlier.last &&
              earlierLine({ ...earlier.last, label: t.lastTime })}
            {sessions[0] && earlierLine(work(sessions[0]))}
            {suggested.map((suggestion) => (
              <SuggestedLine
                key={suggestion.id}
                suggestion={suggestion}
                taskId={task.id}
                onAnswer={(entryId, yes) => void act.answer(entryId, yes)}
              />
            ))}
            {all && rest.map(earlierLine)}
            {!earlier.last && !sessions[0] && !suggested.length && (
              <p className="flex min-h-[30px] items-center text-meta text-muted-foreground">
                {t.nothingEarlier(
                  task.repo,
                  task.kind === 'asked' ? task.askedBy : undefined
                )}
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
                {all ? t.showLess : t.moreEarlier(rest.length)}
              </Button>
            )}
          </>
        )}

        {showReply && (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2.5">
            {drafting ? (
              <p className="flex items-center gap-2 text-body text-muted-foreground">
                <PaceSpinner writing className="size-6" />
                <span className="text-shimmer">{t.draftingReply}</span>
              </p>
            ) : (
              <>
                <label
                  htmlFor={replyId}
                  className="text-meta text-muted-foreground"
                >
                  {!latestDraft || reply !== undefined
                    ? t.yourReply
                    : latestDraft.copiedAt
                      ? t.replyCopied(formatRelative(latestDraft.copiedAt))
                      : t.replyDrafted(
                          formatRelative(latestDraft.at),
                          latestDraft.by && CLI_NAMES[latestDraft.by]
                        )}
                  {latestDraft?.switched &&
                    reply === undefined &&
                    !latestDraft.copiedAt && (
                      <span data-switch>
                        {' '}
                        · {switchLine(latestDraft.switched)}
                      </span>
                    )}
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
                    onClick={() => copy(replyText)}
                    disabled={!replyText.trim()}
                  >
                    <Copy />
                    {t.copyAndOpen}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onDraft}>
                    <RotateCw />
                    {t.draftAgain}
                  </Button>
                  <span className="ml-1 text-meta text-muted-foreground">
                    {t.neverSends}
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
            {task.askedBy ? t.stillWaiting(task.askedBy) : t.replyWaiting}
          </p>
          <p className="text-body text-foreground/80 select-text">
            {t.sessionDrafted(waiting)}
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => copy(waiting)}>
              <Copy />
              {t.copyAndOpen}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onReply(waiting)}>
              {t.editFirst}
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
      <span className="text-meta text-muted-foreground">{label}</span>
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
  macs,
  onResume,
  onStartHere,
}: {
  line: Earlier
  taskId: string
  macs: MacsView | undefined
  onResume: (entryId: string) => void
  onStartHere?: (tool: WorkTool) => void
}) {
  const t = useText(text)
  const { task, run } = line
  const session = line.session ?? task?.session
  // A session on another of your Macs continues there; its log is there too
  const elsewhere = session?.mac ? macNamed(macs, session.mac) : undefined
  const log =
    session?.session && !elsewhere
      ? taskHash(taskId, `/log/${encodeURIComponent(session.id)}`)
      : undefined
  // The terminal icon of the row's own Continue button: it opens there too.
  // Its name is a tooltip at its left, clear of the lines' icons above.
  const resume = !session?.session
    ? ''
    : resumesInApp(session)
      ? t.resumeInApp(Boolean(task), t.app.codex)
      : session.app
        ? t.resumeInTerminal(Boolean(task))
        : t.resumeIn(Boolean(task), CLI_NAMES[session.tool])
  const action =
    elsewhere && session ? (
      <Tooltip
        content={t.startHereTip(elsewhere, CLI_NAMES[session.tool])}
        side="left"
      >
        <Button
          size="xs"
          variant="outline"
          className="text-primary"
          onClick={() => onStartHere?.(session.tool)}
        >
          <SquareTerminal />
          {t.startHere}
        </Button>
      </Tooltip>
    ) : session?.session ? (
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
      <span className="text-meta text-muted-foreground">
        {line.session.app
          ? t.waitingToSend
          : t.waitingToStart(CLI_NAMES[line.session.tool])}
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
    <span title={hint} className="text-meta text-muted-foreground">
      {text}
    </span>
  )

  if (run)
    return (
      <Line label={line.label}>
        {name(
          run.request || t.aMention,
          `#/runs/${encodeURIComponent(run.id)}`,
          t.openRun
        )}
        {quiet(`Pace · ${formatShortDay(run.at)}`)}
      </Line>
    )
  if (task)
    return (
      <Line label={line.label} actions={action}>
        {name(task.title, log, t.readItsSession)}
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
      {name(t.toolSession(CLI_NAMES[own.tool]), log, t.readSession)}
      {quiet(
        [
          elsewhere && t.onMac(elsewhere),
          own.app && t.inApp(t.app[own.tool]),
          own.branch,
          own.lastActiveAt
            ? t.lastActive(formatRelative(own.lastActiveAt))
            : t.started(formatRelative(own.startedAt)),
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
  const t = localized(text)
  switch (session.foundBy) {
    case 'link':
      return t.foundLink
    case 'branch':
      return t.foundBranch(session.branch)
    case 'you':
      return t.foundYou
    default:
      return t.foundTools
  }
}

type Suggestion = NonNullable<TaskDetail['suggested']>[number]

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
  const t = useText(text)
  const tool = CLI_NAMES[proposal.tool]
  return (
    <>
      <Line
        label={t.looksDone}
        actions={
          <>
            <Button size="xs" onClick={() => onAnswer('close')}>
              <CircleCheck />
              {t.closeIt}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onAnswer('not-yet')}
            >
              {t.notYet}
            </Button>
          </>
        }
      >
        <span className="max-w-[40rem] select-text">
          {proposal.summary ?? t.looksFinished(tool)}
        </span>
        <span className="text-meta text-muted-foreground">
          {[
            t.fromSession(tool),
            proposal.pr && t.pr(proposal.pr.number, proposal.pr.state),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </Line>
      {(proposal.left ?? []).map((item) => (
        <Line
          key={item}
          label={t.left}
          actions={
            <Button size="xs" variant="outline" onClick={() => onKeep(item)}>
              {t.keepLeft}
            </Button>
          }
        >
          <span className="select-text">{item}</span>
        </Line>
      ))}
    </>
  )
}

/**
 * A session that only looks like the task's work, by what they share: you
 * say whether it is, and its log opens like any other
 */
function SuggestedLine({
  suggestion,
  taskId,
  onAnswer,
}: {
  suggestion: Suggestion
  taskId: string
  onAnswer: (entryId: string, yes: boolean) => void
}) {
  const t = useText(text)
  return (
    <Line
      label={t.looksRelated}
      actions={
        <>
          <Button
            size="xs"
            variant="outline"
            aria-label={t.linkSession}
            onClick={() => onAnswer(suggestion.id, true)}
          >
            {t.link}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            aria-label={t.notThisSession}
            onClick={() => onAnswer(suggestion.id, false)}
          >
            {t.notIt}
          </Button>
        </>
      }
    >
      <a
        href={taskHash(taskId, `/log/${encodeURIComponent(suggestion.id)}`)}
        title={t.readSession}
        className="font-semibold underline-offset-2 hover:underline"
      >
        {t.toolSession(CLI_NAMES[suggestion.tool])}
      </a>
      <span title={suggestion.cwd} className="text-meta text-muted-foreground">
        {[
          t.mentions(suggestion.shares),
          suggestion.lastActiveAt
            ? t.lastActive(formatRelative(suggestion.lastActiveAt))
            : t.started(formatRelative(suggestion.startedAt)),
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

/**
 * Where Continue opens, on hover: the folder, and the desktop app with the
 * task written in when sessions open there
 */
function OpensIn({
  folder,
  app,
  children,
}: {
  folder: string | undefined
  /** The tool whose desktop app it opens */
  app?: WorkTool
  children: React.ReactElement
}) {
  const t = useText(text)
  const where = folder && tilde(folder)
  const content = app ? t.opensApp(app, where) : where && t.opensIn(where)
  if (!content) return children
  return <Tooltip content={content}>{children}</Tooltip>
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
  const t = useText(text)
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
        <DialogTitle className="text-heading">
          {task.repo ? t.whereIsRepo(task.repo) : t.whereToOpen}
        </DialogTitle>
        <DialogDescription className="text-body text-muted-foreground">
          {t.opensHere(CLI_NAMES[tool], Boolean(task.repo))}
        </DialogDescription>
      </div>
      <div
        role="radiogroup"
        aria-label={t.folder}
        className="flex flex-col gap-2"
      >
        {found === undefined && (
          <p className="text-body text-muted-foreground">
            {task.repo ? t.lookingForRepo(task.repo) : t.lookingForFolders}
          </p>
        )}
        {found?.length === 0 && task.repo && (
          <p className="text-body text-muted-foreground">
            {t.noCheckout(task.repo)}
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
              <span className="text-meta text-muted-foreground">
                {[
                  folder.error?.replace(/\.$/, '') ??
                    [
                      folder.remote ? t.remote(folder.remote) : t.noRemote,
                      folder.changes ? t.uncommitted(folder.changes) : t.clean,
                    ].join(' · '),
                  !folder.matches && !folder.error && task.repo
                    ? t.notRepo(task.repo)
                    : undefined,
                  folder.usedAt
                    ? t.used(formatRelative(folder.usedAt))
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
          {t.chooseFolder}
        </Button>
      </div>
      <p className="flex items-start gap-2 rounded-[10px] bg-well px-3 py-2.5 text-meta text-muted-foreground">
        <Lock className="mt-px size-3.5 shrink-0" />
        {t.runsAsYou(CLI_NAMES[tool])}
      </p>
      {error && (
        <p role="alert" className="text-copy text-status-failed">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="secondary">{t.cancel}</Button>
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
          {t.openHere(CLI_NAMES[tool])}
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
  const t = useText(text)
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
  const tool = entry ? CLI_NAMES[entry.tool] : t.theSession
  const resumeWith =
    entry?.tool === 'claude'
      ? 'claude --resume'
      : entry?.tool === 'opencode'
        ? 'opencode --session'
        : 'codex resume'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant="sheet"
        aria-describedby={undefined}
        className="w-[40rem] max-w-[calc(100vw-1rem)]"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pr-2 pl-5">
          <DialogTitle className="text-section">{t.sessionLog}</DialogTitle>
          <span className="flex-1" />
          <DialogClose asChild>
            <Button size="icon-sm" variant="ghost" aria-label={t.closeLog}>
              <X />
            </Button>
          </DialogClose>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-6 py-5">
            {!entry ? (
              <p className="text-copy text-muted-foreground">
                {detail.isPending ? t.findingSession : t.noSession}
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="text-heading">{found.title}</h2>
                  <p className="text-meta text-muted-foreground">
                    {t.toolSession(tool)} ·{' '}
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
                    {resumesInApp(entry)
                      ? t.continueInApp(t.app.codex)
                      : t.continueIn(tool)}
                  </Button>
                  {entry.session && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          `${resumeWith} ${entry.session}`
                        )
                      }
                    >
                      <Copy />
                      <span className="font-mono text-meta">
                        {resumeWith} {entry.session.slice(0, 8)}…
                      </span>
                    </Button>
                  )}
                </div>
                {error && (
                  <p role="alert" className="text-copy text-status-failed">
                    {error}
                  </p>
                )}
                {!log ? (
                  <p className="text-copy text-muted-foreground">
                    {t.readingLog}
                  </p>
                ) : log.error ? (
                  <p className="text-copy text-muted-foreground">{log.error}</p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {(log.items ?? []).map((item, index) =>
                      item.role === 'tool' ? (
                        <li
                          key={index}
                          className="ml-10 flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-meta"
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
                              'flex size-7 shrink-0 items-center justify-center rounded-full text-meta font-semibold',
                              item.role === 'user'
                                ? 'bg-secondary text-secondary-foreground'
                                : 'bg-foreground text-background'
                            )}
                            aria-hidden="true"
                          >
                            {item.role === 'user' ? t.youInitial : tool[0]}
                          </span>
                          <div
                            className={cn(
                              'min-w-0 flex-1 rounded-[20px] px-4 py-3',
                              item.role === 'user'
                                ? 'bg-well'
                                : 'border border-border'
                            )}
                          >
                            <p className="text-section">
                              {item.role === 'user' ? t.you : tool}
                              {item.at && (
                                <span className="ml-2 text-caption text-muted-foreground">
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
                <p className="flex items-start gap-1.5 text-meta text-muted-foreground">
                  <MessagesSquare className="mt-px size-3.5 shrink-0" />
                  {t.readFrom(tool)}
                </p>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
