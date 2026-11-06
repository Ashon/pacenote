import { InlineError } from '@/components/ui/inline-error'
import { CLI_NAMES } from '@src/tasks/own-ai'
import type { StageRecord, TaskStage } from '@src/tasks/stage'
import {
  DISMISS_REASONS,
  type Proposal,
  type TaskDecision,
  type TaskView,
  type WorkTool,
} from '@src/tasks/types'
import type { TaskArea } from '@src/you/types'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, SquareTerminal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { motionItem, useFlash, usePresence } from '@/components/ui/motion'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import {
  taskDetailQuery,
  taskHash,
  useFill,
  useGroupAnswer,
  useRepoFolders,
  useTaskWork,
} from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { areaHash } from '@/lib/you'
import { SessionLogPanel } from './session-log'
import { TaskActions } from './task-actions'
import { FolderDialog } from './task-folder'
import { AreaPill, Pill, StagePill, TaskMeta, whereOf } from './task-meta'
import { TaskOpen } from './task-open'
import { taskRowState, type RowStep, type TaskRowState } from './task-row-state'
import { text } from './task-row.text'
import { closedBy } from './task-sessions'

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
 *
 * What the row shows is decided in task-row-state.ts; the opened row is
 * task-open.tsx, its buttons task-actions.tsx.
 */

export { closedBy } from './task-sessions'

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
  followsTask,
  filling,
  looksLike,
  onSame,
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
  /** The task it carries on from, which your AI found for one you added */
  followsTask?: TaskView
  /** Your AI filling it in now, by the CLI's name (filler.ts) */
  filling?: string
  /** The open task your AI says it looks like, until you say */
  looksLike?: TaskView
  /** It is that task: this one goes, and that one opens */
  onSame?: () => void
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
  const fillAct = useFill(task.id)
  const repos = useRepoFolders().data
  const [dismissing, setDismissing] = useState(false)
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
  const state = taskRowState(
    {
      task,
      cli,
      tools,
      repos,
      open,
      dismissing,
      stage,
      staging: Boolean(onStage),
      working,
      live,
      filling,
      proposal,
      looksLike,
      followsTask,
      askGroup,
    },
    t
  )

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
  const runStep = (step: RowStep) => {
    if (step.kind === 'continue') return void continueIn(step.tool)
    if (step.kind === 'draft') return void draft()
    if (step.kind === 'stage') return onStage?.(step.stage)
    // Another folder than its repository's, for the tool set in Settings
    setError(undefined)
    if (!open) onToggle()
    askFolder(cli)
  }

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
        {/* A narrow window: the buttons go under the title, which keeps the
            row's width (the page's @container, as the skeleton's) */}
        <div className="flex items-start gap-4 @max-[44rem]:flex-col @max-[44rem]:gap-2.5">
          <div className="min-w-0 flex-1 pl-6 @max-[44rem]:w-full">
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
            <RowMeta
              task={task}
              follows={follows}
              state={state}
              stage={stage}
              area={area}
              live={live}
              proposal={proposal}
              flash={flash}
            />
            <GroupAsk
              group={askGroup}
              shown={state.asking}
              onError={setError}
            />
            {dismissing && (
              <DismissReasons
                onDecide={onDecide}
                onKeep={() => setDismissing(false)}
              />
            )}
          </div>
          <TaskActions
            task={task}
            state={state}
            opensIn={opensIn}
            drafting={drafting}
            onContinue={(tool) => void continueIn(tool)}
            onDraft={() => void draft()}
            onBackToOpen={() => onStage?.('open')}
            onDecide={onDecide}
            onDismiss={() => setDismissing(true)}
            onStep={runStep}
          />
        </div>
        {state.looksLike && (
          <LooksLikeLine
            looksLike={state.looksLike}
            onSame={onSame}
            onKeepBoth={() => void fillAct.keepBoth().then(setError)}
          />
        )}
        <InlineError error={error} className="mt-2 pl-6" />
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
            proposal={state.proposal}
            followsTask={state.followsTask}
            fill={state.fill}
            onUndoFill={() => void fillAct.takeBack().then(setError)}
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

/** The line under the title: who, where and when, then the row's pills */
function RowMeta({
  task,
  follows,
  state,
  stage,
  area,
  live,
  proposal,
  flash,
}: {
  task: TaskView
  follows?: string
  state: TaskRowState
  stage?: TaskStage
  area?: TaskArea
  live?: { by?: string; at: string }
  proposal?: Proposal
  flash: ReturnType<typeof useFlash>
}) {
  const t = useText(text)
  // Looks done: a mark on the closed row that fades in and out
  const looksDone = usePresence<HTMLSpanElement>(state.looksDone)
  // An AI tool at work on it: a mark that fades in and, once it is done,
  // out, still naming the tool as it goes
  const atWork = usePresence<HTMLSpanElement>(state.atWork)
  const liveTool = useRef<string>(undefined)
  if (live) liveTool.current = closedBy(live.by)
  const { working, filled, updated } = state

  return (
    <TaskMeta task={task} follows={follows}>
      {state.due && (
        <Pill tone="due" {...flash('due')} className="motion-flash">
          {state.due}
        </Pill>
      )}
      {state.settledLabel && <Pill>{state.settledLabel}</Pill>}
      {/* An AI tool at work on it says so itself, below */}
      <StagePill
        stage={stage?.stage === 'started' && atWork.mounted ? undefined : stage}
      />
      {area && <AreaPill area={area} href={areaHash(area.id)} />}
      {task.repo && (
        <span {...flash('repo')} className="motion-flash rounded-sm font-mono">
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
      {working && !atWork.mounted && (
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
      {state.filling && (
        <span className="inline-flex items-center gap-1.5 font-medium text-status-running">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-status-running" />
          {t.fillingIn(state.filling)}
        </span>
      )}
      {filled && (
        <span className="rounded-full bg-primary/12 px-2 py-px font-medium text-primary">
          {t.filledIn(formatRelative(filled.at))}
        </span>
      )}
      {updated && (
        <span
          title={updated.why}
          className="rounded-full bg-primary/12 px-2 py-px font-medium text-primary"
        >
          {t.updated(formatRelative(updated.at))}
        </span>
      )}
    </TaskMeta>
  )
}

/**
 * Whether the user group a Maybe was asked of means you: asked on the row,
 * then gone once answered
 */
function GroupAsk({
  group,
  shown,
  onError,
}: {
  group?: string
  shown: boolean
  onError: (error: string | undefined) => void
}) {
  const t = useText(text)
  const answerGroup = useGroupAnswer()
  const asking = usePresence(shown)
  // The group stays named as the question fades out
  const askedGroup = useRef(group)
  if (group) askedGroup.current = group
  if (!asking.mounted) return null
  return (
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
            void answerGroup(askedGroup.current!, yours).then(onError)
          }
        >
          {label}
        </Button>
      ))}
    </div>
  )
}

/** Why you dismiss it, asked on the row: a reason, none, or keep it */
function DismissReasons({
  onDecide,
  onKeep,
}: {
  onDecide: (decision: Omit<TaskDecision, 'at'>) => void
  onKeep: () => void
}) {
  const t = useText(text)
  return (
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
        onClick={onKeep}
      >
        <X />
      </Button>
    </div>
  )
}

/**
 * The open task your AI says one you added looks like: the same task (this
 * one goes), or two to keep
 */
function LooksLikeLine({
  looksLike,
  onSame,
  onKeepBoth,
}: {
  looksLike: TaskView
  onSame?: () => void
  onKeepBoth: () => void
}) {
  const t = useText(text)
  return (
    <div
      role="group"
      aria-label={t.looksLike}
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-6 text-meta text-muted-foreground"
    >
      <span>{t.looksLike}</span>
      <a
        href={taskHash(looksLike.id)}
        className="font-medium text-foreground hover:text-primary"
      >
        {looksLike.title}
      </a>
      <span>
        {[
          looksLike.repo || whereOf(looksLike, t),
          formatRelative(looksLike.postedAt),
        ].join(' · ')}
      </span>
      <span className="flex items-center gap-1.5">
        <Button size="xs" variant="outline" onClick={onSame}>
          {t.sameTask}
        </Button>
        <Button size="xs" variant="ghost" onClick={onKeepBoth}>
          {t.keepBoth}
        </Button>
      </span>
    </div>
  )
}
