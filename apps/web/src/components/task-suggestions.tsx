import { CLI_NAMES } from '@src/tasks/own-ai'
import type { Proposal, TaskDetail } from '@src/tasks/types'
import { CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { taskHash } from '@/lib/tasks'
import { Line } from './task-line'
import { text } from './task-row.text'

/**
 * What Pacenote makes of a task's sessions for you to say: whether the task
 * looks done, and which sessions look like its work
 */

type Suggestion = NonNullable<TaskDetail['suggested']>[number]

/**
 * What the task's quiet session looked like: done, how it ended, what is left.
 * Close it closes the task with that; Not yet waits for the session to go on.
 * Each thing left can be kept as a task of its own.
 */
export function LooksDone({
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
export function SuggestedLine({
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
