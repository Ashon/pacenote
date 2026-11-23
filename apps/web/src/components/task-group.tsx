import type { BundleSuggestion, TaskBundle } from '@src/tasks/bundle-view'
import type { TaskView } from '@src/tasks/types'
import {
  ChevronRight,
  CircleCheck,
  Layers,
  MoreHorizontal,
  Play,
  RotateCw,
  Sparkles,
  Undo2,
  Ungroup,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
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
import { InlineError } from '@/components/ui/inline-error'
import { motionItem } from '@/components/ui/motion'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { taskHash } from '@/lib/tasks'
import type { GroupFacts } from '@/lib/todo-list'
import { cn } from '@/lib/utils'
import { Line } from './task-line'
import { Pill } from './task-meta'
import { text } from './task-group.text'
import { closedBy } from './task-sessions'

/**
 * Groups of tasks in Todo (src/tasks/bundles.ts): a group's row with its
 * tasks under it, your AI's suggestion over the list, Group with… and
 * Done all. A group is one piece of work; each of its tasks stays a task of
 * its own, with its own row and buttons.
 */

/**
 * A group's row: its name, how many tasks, who waits and how far along,
 * Continue here and Done all; opened, what your AI filled it in with. Its
 * tasks are listed under it (children), indented.
 */
export function GroupRow({
  group,
  facts,
  open,
  onToggle,
  filling,
  motion,
  onContinue,
  onDoneAll,
  onUngroup,
  onUndo,
  onFillAgain,
  error,
  children,
}: {
  group: TaskBundle
  facts: GroupFacts
  open: boolean
  onToggle: () => void
  /** Your AI filling it in now, by the CLI's name */
  filling?: string
  /** Its list's motion as it comes and goes (useListMotion) */
  motion?: Parameters<typeof motionItem>[0]
  /** Continue here: one session for all its open tasks */
  onContinue?: () => void
  onDoneAll?: () => void
  onUngroup: () => void
  onUndo: () => void
  onFillAgain: () => void
  error?: string
  children: React.ReactNode
}) {
  const t = useText(text)
  const settled = facts.open.length === 0
  const progress =
    facts.done === 0
      ? t.noneDone
      : settled
        ? t.allDone
        : t.someDone(facts.done, facts.members.length)
  return (
    <li
      data-group-row={group.id}
      {...(motion && motionItem(motion))}
      className="border-t border-border py-3.5"
    >
      <div className="flex items-start gap-4 @max-[44rem]:flex-col @max-[44rem]:gap-2.5">
        <div className="min-w-0 flex-1 pl-6 @max-[44rem]:w-full">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${t.openGroup}: ${facts.title}`}
            onClick={onToggle}
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
              className={cn(
                'rounded-sm',
                settled && 'text-muted-foreground line-through decoration-1'
              )}
            >
              {facts.title}
            </span>
            <span className="ml-1 inline-flex items-center gap-1 self-center rounded-full bg-muted px-2 py-px text-meta font-medium text-muted-foreground">
              <Layers aria-hidden="true" className="size-3" />
              {t.tasks(facts.members.length)}
            </span>
          </button>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
            <span>
              {[facts.waits.length ? t.waits(facts.waits) : '', progress]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {facts.due?.due && <Pill tone="due">{facts.due.due}</Pill>}
            {facts.repo && (
              <span className="rounded-sm font-mono">{facts.repo}</span>
            )}
            {filling && (
              <span className="motion-fade inline-flex items-center gap-1.5 font-medium text-primary">
                <Sparkles aria-hidden="true" className="size-3" />
                {t.filling(filling)}
              </span>
            )}
          </p>
        </div>
        <div
          data-task-actions
          className="flex shrink-0 items-center gap-1.5 @max-[44rem]:flex-wrap @max-[44rem]:pl-6"
        >
          {onContinue && (
            <Button
              size="sm"
              variant="outline"
              onClick={onContinue}
              title={t.continueAll}
            >
              <Play />
              {t.continueHereShort}
            </Button>
          )}
          {onDoneAll && (
            <Button size="sm" onClick={onDoneAll}>
              <CircleCheck />
              {t.doneAll}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t.moreForGroup}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {!settled && (
                <DropdownMenuItem onSelect={onFillAgain}>
                  <RotateCw />
                  {t.fillAgain}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onUngroup}>
                <Ungroup />
                {t.ungroup}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <InlineError error={error} className="mt-2 pl-6" />
      {open && (
        <GroupDetail
          group={group}
          facts={facts}
          filling={filling}
          onUndo={onUndo}
          onFillAgain={onFillAgain}
        />
      )}
      <div className="mt-3 ml-1.5 border-l-2 border-border pl-[1.125rem]">
        {children}
      </div>
    </li>
  )
}

/** An opened group: your AI's summary, who waits, the due, what comes first */
function GroupDetail({
  group,
  facts,
  filling,
  onUndo,
  onFillAgain,
}: {
  group: TaskBundle
  facts: GroupFacts
  filling?: string
  onUndo: () => void
  onFillAgain: () => void
}) {
  const t = useText(text)
  const fill = group.fill
  const byId = new Map(facts.members.map((task) => [task.id, task]))
  const waits = (fill?.waits ?? []).flatMap((wait) => {
    const task = byId.get(wait.task)
    return task?.status === 'open' && task.askedBy
      ? [{ task, wants: wait.wants }]
      : []
  })
  // Who waits, by the tasks they asked, when your AI did not say what for
  const asked = facts.open.filter(
    (task) =>
      task.kind === 'asked' &&
      task.askedBy &&
      !waits.some((wait) => wait.task.id === task.id)
  )
  return (
    <div className="flex flex-col gap-2 pt-2.5 pl-6">
      <div className="flex flex-col gap-0.5 rounded-xl bg-well px-3.5 py-3">
        {fill?.summary && (
          <p className="mb-1.5 max-w-[44rem] rounded-sm text-body leading-relaxed select-text">
            {fill.summary}
          </p>
        )}
        {(waits.length > 0 || asked.length > 0) && (
          <Line label={t.whoWaits}>
            <span className="flex flex-col gap-0.5">
              {[
                ...waits,
                ...asked.map((task) => ({ task, wants: task.title })),
              ].map(({ task, wants }) => (
                <span key={task.id} className="flex items-center gap-1.5">
                  <span className="font-semibold">{task.askedBy}</span>
                  <a
                    href={taskHash(task.id)}
                    className="text-meta text-muted-foreground hover:text-primary"
                  >
                    {wants} · {task.source.label}
                  </a>
                </span>
              ))}
            </span>
          </Line>
        )}
        {facts.due?.due && (
          <Line label={t.due}>
            <Pill tone="due" className="text-meta">
              {facts.due.due}
            </Pill>
            <span className="text-meta text-muted-foreground">
              {facts.due.title}
            </span>
          </Line>
        )}
        {facts.first && (
          <Line label={t.first}>
            <a
              href={taskHash(facts.first.id)}
              className="font-semibold hover:text-primary"
            >
              {facts.first.title}
            </a>
            {fill?.first?.why && (
              <span className="text-meta text-muted-foreground">
                {fill.first.why}
              </span>
            )}
          </Line>
        )}
        <Line label={t.left}>
          {t.leftOf(facts.open.length, facts.members.length)}
        </Line>
        {group.wrapUp && (
          <Line label={t.wrapUp}>
            <span className="select-text">{group.wrapUp.text}</span>
          </Line>
        )}
        {filling ? null : fill ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
            <Sparkles aria-hidden="true" className="size-3.5" />
            <span>
              {t.filledIn(formatRelative(fill.at), closedBy(fill.by))}
              {group.stale && ` · ${t.changedSince}`}
            </span>
            {group.canUndo && (
              <Button
                size="xs"
                variant="ghost"
                className="text-primary"
                onClick={onUndo}
              >
                <Undo2 />
                {t.undo}
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              className="-ml-2 text-primary"
              onClick={onFillAgain}
            >
              {t.fillAgain}
            </Button>
          </div>
        ) : (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
            <span>{t.noFill}</span>
            <Button
              size="xs"
              variant="ghost"
              className="-ml-1 text-primary"
              onClick={onFillAgain}
            >
              {t.fillAgain}
            </Button>
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Your AI's suggestion over the list: the tasks it sees as one piece of
 * work, Group them or Not one piece
 */
export function GroupSuggestion({
  suggestion,
  tasks,
  onAnswer,
}: {
  suggestion: BundleSuggestion
  tasks: readonly TaskView[]
  onAnswer: (yes: boolean) => Promise<string | undefined>
}) {
  const t = useText(text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const members = suggestion.tasks.flatMap((id) => {
    const task = tasks.find((each) => each.id === id)
    return task ? [task] : []
  })
  if (members.length < 2) return null
  const after = suggestion.after
    ? tasks.find((task) => task.id === suggestion.after)
    : undefined
  const by = closedBy(suggestion.by)
  const answer = async (yes: boolean) => {
    setBusy(true)
    setError(await onAnswer(yes))
    setBusy(false)
  }
  return (
    <div
      data-group-suggestion={suggestion.id}
      className="motion-fade mt-4 flex flex-col gap-2 rounded-xl bg-well px-3.5 py-3"
    >
      <p className="flex items-center gap-2 text-body">
        <Layers aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span>
          <span className="text-muted-foreground">
            {t.suggest(members.length)}
          </span>
          {suggestion.name && (
            <>
              {' '}
              <span className="font-semibold">{suggestion.name}</span>
            </>
          )}
        </span>
      </p>
      <ul className="flex list-disc flex-col gap-0.5 pl-11 text-meta">
        {members.map((task) => (
          <li key={task.id} className="truncate">
            {task.title}
            {task.kind === 'asked' && task.askedBy && (
              <span className="text-muted-foreground"> · {task.askedBy}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-6">
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => void answer(true)}
        >
          <Layers />
          {t.group}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => void answer(false)}
        >
          {t.notOne}
        </Button>
        {by && (
          <span className="text-caption text-muted-foreground">
            {after ? t.sawAfter(by, after.title) : t.saw(by)}
          </span>
        )}
      </div>
      <InlineError error={error} className="pl-6" />
    </div>
  )
}

/**
 * Group with…: the other open tasks of the task's project, and the groups
 * there, to put it with; the group it makes your AI fills in
 */
export function GroupWithDialog({
  task,
  tasks,
  groups,
  open,
  onClose,
  onGroup,
}: {
  task: TaskView
  /** The other open tasks it may go with, in no group */
  tasks: readonly TaskView[]
  /** The groups it may go into: their id and name */
  groups: readonly { id: string; title: string }[]
  open: boolean
  onClose: () => void
  onGroup: (taskIds: string[], into?: string) => Promise<string | undefined>
}) {
  const t = useText(text)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [into, setInto] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const id = useId()
  useEffect(() => {
    if (!open) return
    setPicked(new Set())
    setInto(undefined)
    setError(undefined)
  }, [open])
  const toggle = (taskId: string) => {
    setInto(undefined)
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }
  const group = async () => {
    if (!into && picked.size === 0) return setError(t.pickSome)
    setBusy(true)
    const failed = await onGroup([task.id, ...picked], into)
    setBusy(false)
    if (failed) setError(failed)
    else onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[34rem] max-w-[calc(100vw-2rem)] gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-heading">{t.groupTitle}</DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">
            {t.groupNote}
          </DialogDescription>
        </div>
        <p className="text-body font-semibold">{task.title}</p>
        <div className="flex max-h-[18rem] flex-col gap-1 overflow-y-auto">
          {groups.map((each) => (
            <label
              key={each.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-body hover:bg-accent"
            >
              <input
                type="radio"
                name={`${id}-into`}
                checked={into === each.id}
                onChange={() => {
                  setPicked(new Set())
                  setInto(each.id)
                }}
              />
              <Layers aria-hidden="true" className="size-3.5 text-primary" />
              {t.intoGroup(each.title)}
            </label>
          ))}
          {tasks.map((other) => (
            <label
              key={other.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-body hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={picked.has(other.id)}
                onChange={() => toggle(other.id)}
              />
              <span className="min-w-0 flex-1 truncate">{other.title}</span>
              {other.kind === 'asked' && other.askedBy && (
                <span className="shrink-0 text-meta text-muted-foreground">
                  {other.askedBy}
                </span>
              )}
            </label>
          ))}
          {tasks.length === 0 && groups.length === 0 && (
            <p className="text-body text-muted-foreground">{t.noOthers}</p>
          )}
        </div>
        <InlineError error={error} />
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              {t.cancel}
            </Button>
          </DialogClose>
          <Button
            size="sm"
            disabled={busy || (!into && picked.size === 0)}
            onClick={() => void group()}
          >
            <Layers />
            {t.groupThem}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Done all: the group's open tasks close together, with one note of what you
 * did, which your AI writes first for you to change
 */
export function DoneAllDialog({
  facts,
  aiName,
  open,
  onClose,
  onWrapUp,
  onDone,
}: {
  facts: GroupFacts
  /** The AI that writes the note, by name */
  aiName: string
  open: boolean
  onClose: () => void
  /** What you did, as your AI writes it */
  onWrapUp: () => Promise<{ text?: string; error?: string }>
  onDone: (wrap: string) => Promise<string | undefined>
}) {
  const t = useText(text)
  const [wrap, setWrap] = useState<string>()
  const [writing, setWriting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const id = useId()
  useEffect(() => {
    if (!open) return
    let gone = false
    setWrap(undefined)
    setError(undefined)
    setWriting(true)
    void onWrapUp().then((result) => {
      if (gone) return
      setWriting(false)
      setWrap((current) => current ?? result.text ?? '')
    })
    return () => {
      gone = true
    }
    // Once each time it opens, not again as the page refreshes
  }, [open])
  const done = async () => {
    setBusy(true)
    const failed = await onDone(wrap ?? '')
    setBusy(false)
    if (failed) setError(failed)
    else onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[34rem] max-w-[calc(100vw-2rem)] gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-heading">
            {t.doneTitle(facts.title)}
          </DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">
            {t.doneNote(facts.open.length)}
          </DialogDescription>
        </div>
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-body">
          {facts.open.map((task) => (
            <li key={task.id} className="truncate">
              {task.title}
              {task.kind === 'asked' && task.askedBy && (
                <span className="text-meta text-muted-foreground">
                  {' '}
                  · {task.askedBy}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={id}
            className="text-meta font-medium text-muted-foreground"
          >
            {writing ? t.writing(aiName) : t.wrapLabel}
          </label>
          <textarea
            id={id}
            value={wrap ?? ''}
            onChange={(event) => setWrap(event.target.value)}
            placeholder={t.wrapPlaceholder}
            rows={4}
            className="w-full resize-y rounded-[10px] border border-input bg-background px-3 py-2.5 text-body leading-relaxed outline-none select-text focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
        </div>
        <InlineError error={error} />
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              {t.cancel}
            </Button>
          </DialogClose>
          <Button size="sm" disabled={busy} onClick={() => void done()}>
            <CircleCheck />
            {t.doneAllN(facts.open.length)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
