import { CLI_NAMES } from '@src/tasks/own-ai'
import type { TaskDecision, TaskView, WorkTool } from '@src/tasks/types'
import {
  CircleCheck,
  CirclePause,
  Clock,
  ExternalLink,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
  Play,
  SquareTerminal,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useText } from '@/lib/i18n'
import { OpensIn } from './task-folder'
import type { RowStep, TaskRowState } from './task-row-state'
import { text } from './task-row.text'

/**
 * A task's buttons at the right of its row, in two groups which wrap whole in
 * a narrow window: the next step (and its link), then the task's own buttons,
 * with the other steps under its menu
 */

/** Each step under the menu, by its icon */
function stepIcon(step: RowStep) {
  switch (step.kind) {
    case 'continue':
      return <SquareTerminal />
    case 'elsewhere':
      return <FolderOpen />
    case 'draft':
      return <MessageSquare />
    case 'stage':
      return step.stage === 'started' ? (
        <Play />
      ) : step.stage === 'waiting' ? (
        <Clock />
      ) : (
        <CirclePause />
      )
  }
}

export function TaskActions({
  task,
  state,
  opensIn,
  drafting,
  onContinue,
  onDraft,
  onBackToOpen,
  onDecide,
  onDismiss,
  onStep,
}: {
  task: TaskView
  state: TaskRowState
  /** Where each tool's new sessions open: its desktop app, or a terminal */
  opensIn?: Record<WorkTool, 'app' | 'terminal'>
  /** A reply is being drafted */
  drafting: boolean
  onContinue: (tool: WorkTool) => void
  onDraft: () => void
  /** Back to open, from waiting on someone else */
  onBackToOpen: () => void
  onDecide: (decision: Omit<TaskDecision, 'at'> | null) => void
  /** Dismiss: asks why first */
  onDismiss: () => void
  /** A step chosen under the menu */
  onStep: (step: RowStep) => void
}) {
  const t = useText(text)
  const dismiss = (
    <Button size="sm" variant="secondary" onClick={onDismiss}>
      {t.dismiss}
    </Button>
  )
  const menuItem = (step: RowStep) => (
    <DropdownMenuItem key={step.label} onSelect={() => onStep(step)}>
      {stepIcon(step)}
      {step.label}
    </DropdownMenuItem>
  )

  return (
    <div
      data-task-actions
      className="flex shrink-0 items-center gap-1.5 @max-[44rem]:flex-wrap @max-[44rem]:pl-6"
    >
      <span className="flex items-center gap-1.5 empty:hidden">
        {state.continues && (
          // Each tool it can continue in, by its name, the one set in
          // Settings first: one control, as an outline button is drawn
          <span
            role="group"
            aria-label={t.continueWith}
            className="flex h-7 items-center rounded-md border bg-background shadow-xs dark:border-input dark:bg-input/30"
          >
            {state.tools.map((tool, i) => (
              <OpensIn
                key={tool}
                folder={state.folder}
                app={opensIn?.[tool] === 'app' ? tool : undefined}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t.continueIn(CLI_NAMES[tool])}
                  className="h-full rounded-none border-l first:rounded-l-[5px] first:border-l-0 last:rounded-r-[5px] dark:border-input"
                  onClick={() => onContinue(tool)}
                >
                  {i === 0 && <SquareTerminal />}
                  {CLI_NAMES[tool]}
                </Button>
              </OpensIn>
            ))}
          </span>
        )}
        {state.drafts && (
          <Button
            size="sm"
            variant="outline"
            disabled={drafting}
            onClick={onDraft}
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
              aria-label={t.openIn(state.sourceLabel)}
            >
              <ExternalLink />
            </a>
          </Button>
        )}
        {state.backToOpen && (
          <Button size="sm" variant="outline" onClick={onBackToOpen}>
            <Undo2 />
            {t.backToOpen}
          </Button>
        )}
      </span>
      <span className="flex items-center gap-1.5 empty:hidden">
        {state.decide === 'open' && (
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
                {state.menu.map(menuItem)}
                {state.menu.length > 0 && state.stages.length > 0 && (
                  <DropdownMenuSeparator />
                )}
                {state.stages.map(menuItem)}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {state.decide === 'maybe' && (
          <>
            <Button size="sm" onClick={() => onDecide({ status: 'kept' })}>
              {t.keepAsTask}
            </Button>
            {dismiss}
          </>
        )}
        {state.decide === 'settled' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onDecide(state.reopen)}
          >
            <Undo2 />
            {t.reopen}
          </Button>
        )}
      </span>
    </div>
  )
}
