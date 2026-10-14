import type { SetupRecord } from '@src/settings/setup'
import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Swap } from '@/components/ui/motion'
import { useRuns } from '@/lib/api'
import { PaceSpinner } from '../pace-spinner'
import { Chip, CommandLine, StepFrame } from './parts'

/**
 * 5. The first answer: Pace is running, and a mention in Slack shows the whole
 * path working, from Slack to the AI and back. Its answer finishes setup.
 */
export function AnswerStep({
  record,
  onFinished,
  onLeave,
}: {
  record: SetupRecord
  /** The first answer came */
  onFinished: () => void
  /** Leaving for Overview, or a run */
  onLeave: (hash: string) => void
}) {
  const runs = useRuns({ kind: 'mention' })
  const since = record.answerSince ? Date.parse(record.answerSince) : 0
  // The earliest mention since Pace started here
  const first = [...(runs.data ?? [])]
    .filter((run) => Date.parse(run.startedAt) >= since)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))[0]
  const answered = first && first.status !== 'running'
  useEffect(() => {
    if (answered && first.status === 'succeeded' && !record.finishedAt)
      onFinished()
  }, [answered, first?.status, record.finishedAt, onFinished])

  return (
    <StepFrame
      step="answer"
      title="Say hello to Pace in Slack"
      lead="Pace is running. Mention it once to see the whole path work, from Slack to the AI and back."
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={() => onLeave('#/')}>Go to Overview</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <b className="text-sm font-semibold">
          Ask it something in a channel it is in
        </b>
        <CommandLine text="@Pace what can you help me with?" />
        <p className="text-body text-muted-foreground">
          In another channel, invite it first with{' '}
          <code className="rounded bg-well px-1.5 font-mono text-xs">
            /invite @Pace
          </code>
          .
        </p>
      </div>
      <div className="rounded-2xl px-5 py-4 ring-1 ring-border">
        <Swap
          id={
            first
              ? `${first.id}:${answered ? first.status : 'running'}`
              : 'waiting'
          }
        >
          {first ? (
            <div className="flex flex-col gap-3">
              <span className="flex items-center gap-2.5">
                {!answered ? (
                  <Chip tone="working">
                    <LoaderCircle className="animate-spin" />
                    Pace is answering
                  </Chip>
                ) : first.status === 'succeeded' ? (
                  <Chip tone="ok">
                    <CircleCheck />
                    First answer sent
                  </Chip>
                ) : (
                  <Chip tone="failed">
                    <CircleX />
                    It could not answer
                  </Chip>
                )}
              </span>
              <div className="flex items-center gap-4 rounded-xl bg-well px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">
                    "{first.request}"
                  </span>
                  <span className="text-body text-muted-foreground">
                    {first.conversationLabel}
                    {first.userName ? ` · @${first.userName}` : ''}
                    {answered && first.status === 'succeeded'
                      ? ' · answered in the thread'
                      : ''}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    onLeave(`#/runs/${encodeURIComponent(first.id)}`)
                  }
                >
                  Open the run
                </Button>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2.5 text-body text-muted-foreground">
              <PaceSpinner className="size-6" />
              <span className="text-shimmer">
                Waiting for your first mention
              </span>
            </p>
          )}
        </Swap>
      </div>
    </StepFrame>
  )
}
