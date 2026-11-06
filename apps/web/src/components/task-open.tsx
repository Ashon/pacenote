import { CLI_NAMES } from '@src/tasks/own-ai'
import type { Proposal, TaskUpdate, TaskView, WorkTool } from '@src/tasks/types'
import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useFlash } from '@/components/ui/motion'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { useMacs } from '@/lib/macs'
import { taskHash, useProposal, useTaskDetail, useTaskWork } from '@/lib/tasks'
import { whereOf, writtenOf } from './task-meta'
import { EarlierLine } from './task-earlier'
import { Line } from './task-line'
import { taskOpenState, type Earlier } from './task-open-state'
import { ReplyDraft, WaitingReply } from './task-reply'
import { text } from './task-row.text'
import { closedBy } from './task-sessions'
import { LooksDone, SuggestedLine } from './task-suggestions'

/** The opened row: a reminder of what it is about and what came before */
export function TaskOpen({
  task,
  drafting,
  reply,
  onReply,
  onDraft,
  onStartHere,
  proposal,
  followsTask,
  fill,
  onUndoFill,
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
  /** The task it carries on from, for one you added */
  followsTask?: TaskView
  /** What your AI filled in, standing */
  fill?: TaskUpdate
  onUndoFill: () => void
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
  const shown = taskOpenState(task, detail, { reply, drafting }, t)
  const { summary, change, rest } = shown
  const flash = useFlash({ summary })

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
            <span title={shown.changeWords} className="select-text">
              {change.why}
            </span>
            <span className="text-meta text-muted-foreground">
              {formatRelative(change.at)}
            </span>
          </Line>
        )}
        {followsTask && (
          <Line label={t.carriesOn}>
            <a
              href={taskHash(followsTask.id)}
              className="select-text hover:text-primary"
            >
              {followsTask.title}
            </a>
            <span className="text-meta text-muted-foreground">
              {[
                followsTask.status === 'open'
                  ? whereOf(followsTask, t)
                  : t.settled[followsTask.status],
                formatRelative(followsTask.postedAt),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </Line>
        )}
        {fill && (
          <Line
            label={t.filledLabel}
            actions={
              <Button
                size="xs"
                variant="ghost"
                className="text-primary"
                onClick={onUndoFill}
              >
                <Undo2 />
                {t.undoFill}
              </Button>
            }
          >
            <span>
              {t.filledWhat(
                fill.changed
                  .map((change) => t.filledField[change.field])
                  .filter((word): word is string => Boolean(word))
              )}
            </span>
            <span className="text-meta text-muted-foreground">
              {t.filledBy(closedBy(fill.by) ?? CLI_NAMES.claude)}
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
            {shown.settled && (task.wrapUp || detail.outcome) && (
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
            {shown.last && earlierLine(shown.last)}
            {shown.session && earlierLine(shown.session)}
            {shown.suggested.map((suggestion) => (
              <SuggestedLine
                key={suggestion.id}
                suggestion={suggestion}
                taskId={task.id}
                onAnswer={(entryId, yes) => void act.answer(entryId, yes)}
              />
            ))}
            {all && rest.map(earlierLine)}
            {shown.nothingEarlier && (
              <p className="flex min-h-[30px] items-center text-meta text-muted-foreground">
                {task.source.app === 'local'
                  ? writtenOf(task, t)
                  : t.nothingEarlier(
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

        {shown.showReply && (
          <ReplyDraft
            drafting={drafting}
            reply={reply}
            latestDraft={shown.latestDraft}
            replyText={shown.replyText}
            onReply={onReply}
            onCopy={copy}
            onDraft={onDraft}
          />
        )}
      </div>

      {shown.waiting && (
        <WaitingReply
          reply={shown.waiting}
          askedBy={task.askedBy}
          onCopy={copy}
          onEdit={onReply}
        />
      )}
    </div>
  )
}
