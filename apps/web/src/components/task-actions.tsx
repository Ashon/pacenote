import { CLI_NAMES } from '@src/tasks/own-ai'
import type { TaskDecision, TaskView, WorkTool } from '@src/tasks/types'
import {
  AppWindow,
  ChevronDown,
  CircleCheck,
  CirclePause,
  Clock,
  ExternalLink,
  FolderOpen,
  Group,
  ListMinus,
  MessageSquare,
  MoreHorizontal,
  Play,
  SquareTerminal,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KeyHint } from '@/components/ui/key-hint'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useText } from '@/lib/i18n'
import { ariaKeys, KEYS, useShortcut, type Keys } from '@/lib/shortcuts'
import { PacenoteMonoMark } from './logo'
import { OpenButton } from './session-open'
import { ToolMark } from './tool-mark'
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
    case 'here':
      return <PacenoteMonoMark />
    case 'continue':
      return <ToolMark tool={step.tool} />
    case 'elsewhere':
      return <FolderOpen />
    case 'draft':
      return <MessageSquare />
    case 'groupWith':
      return <Group />
    case 'moveOut':
      return <ListMinus />
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
  open = false,
  state,
  opensIn,
  drafting,
  onContinueHere,
  onContinue,
  onDraft,
  onBackToOpen,
  onDecide,
  onDismiss,
  onStep,
}: {
  task: TaskView
  /** The task is open in its row: its buttons take ⌘↩ and ⌘⌫ */
  open?: boolean
  state: TaskRowState
  /** Where each tool's new sessions open: its desktop app, or a terminal */
  opensIn?: Record<WorkTool, 'app' | 'terminal'>
  /** A reply is being drafted */
  drafting: boolean
  /** A new session Pacenote runs, on its page, the task written in (V5) */
  onContinueHere: () => void
  /** In a tool's own session: its terminal, or its desktop app */
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
  // The open task's own buttons, from the keyboard: Done (Keep as a task in
  // Maybe) and Dismiss
  const decides = open && (state.decide === 'open' || state.decide === 'maybe')
  useShortcut(
    KEYS.taskDone,
    () => onDecide({ status: state.decide === 'maybe' ? 'kept' : 'done' }),
    { when: decides }
  )
  useShortcut(KEYS.taskDismiss, onDismiss, { when: decides })
  /** What a button these keys press carries: their name, and their hint */
  const keyed = (keys: Keys) =>
    decides
      ? { aria: ariaKeys(keys), hint: <KeyHint keys={keys} /> }
      : { aria: undefined, hint: null }
  const doneKeys = keyed(KEYS.taskDone)
  const dismissKeys = keyed(KEYS.taskDismiss)
  const dismiss = (
    <Button
      size="sm"
      variant="secondary"
      onClick={onDismiss}
      aria-keyshortcuts={dismissKeys.aria}
      className="relative"
    >
      {t.dismiss}
      {dismissKeys.hint}
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
        {state.opensSession && state.session && (
          <OpenButton s={state.session} size="sm" />
        )}
        {state.continues && (
          // Continue goes on here in Pacenote; the tools' own sessions are
          // under its menu, the one set in Settings first. One control, as
          // an outline button is drawn
          <span
            role="group"
            aria-label={t.continueWith}
            className="flex h-7 items-center rounded-md border bg-background shadow-xs dark:border-input dark:bg-input/30"
          >
            <OpensIn folder={state.folder} here>
              <Button
                size="sm"
                variant="ghost"
                className="h-full rounded-none rounded-l-[5px]"
                onClick={onContinueHere}
              >
                <PacenoteMonoMark />
                {t.continueHere}
              </Button>
            </OpensIn>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t.continueInAnother}
                  className="h-full w-7 rounded-none rounded-r-[5px] border-l px-0 dark:border-input"
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {state.tools.map((tool) => {
                  const inApp = opensIn?.[tool] === 'app'
                  return (
                    <DropdownMenuItem
                      key={tool}
                      onSelect={() => onContinue(tool)}
                    >
                      <ToolMark
                        tool={tool}
                        fallback={inApp ? AppWindow : SquareTerminal}
                      />
                      {t.continueIn(CLI_NAMES[tool])}
                      <span className="ml-auto pl-6 text-meta text-muted-foreground">
                        {inApp ? t.app[tool] : t.terminal}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
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
            <Button
              size="sm"
              onClick={() => onDecide({ status: 'done' })}
              aria-keyshortcuts={doneKeys.aria}
              className="relative"
            >
              <CircleCheck />
              {t.done}
              {doneKeys.hint}
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
                {state.menu.length + state.stages.length > 0 &&
                  state.grouping.length > 0 && <DropdownMenuSeparator />}
                {state.grouping.map(menuItem)}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {state.decide === 'maybe' && (
          <>
            <Button
              size="sm"
              onClick={() => onDecide({ status: 'kept' })}
              aria-keyshortcuts={doneKeys.aria}
              className="relative"
            >
              {t.keepAsTask}
              {doneKeys.hint}
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
