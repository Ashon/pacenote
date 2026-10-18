import type { RunRecord, RunSummary } from '@src/history/types'
import { failureAdvice, failureCause } from '@src/mention/failure'
import type { SetupRecord } from '@src/settings/setup'
import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Swap } from '@/components/ui/motion'
import { useRun, useRuns } from '@/lib/api'
import { useSupervisor } from '@/lib/desktop'
import { PaceSpinner } from '../pace-spinner'
import { Chip, CommandLine, Hint, Problem, StepFrame, useWaited } from './parts'

/**
 * 5. The first answer: Pace is running, and a mention in Slack shows the whole
 * path working, from Slack to the AI and back. Any answer since Pace started
 * here finishes setup, so one that failed is fixed and asked again, not a
 * dead end.
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
  const asked = [...(runs.data ?? [])]
    .filter((run) => Date.parse(run.startedAt) >= since)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  const answered = asked.find((run) => run.status === 'succeeded')
  // The answer that finished it, or else the latest try
  const shown = answered ?? asked.at(-1)
  const done = Boolean(answered || record.finishedAt)
  useEffect(() => {
    if (answered && !record.finishedAt) onFinished()
  }, [answered, record.finishedAt, onFinished])

  const supervisor = useSupervisor()
  const phase = supervisor?.phase
  const running =
    phase === undefined || phase === 'running' || phase === 'external'
  const waited = useWaited(running && !shown && !done, 30_000)

  return (
    <StepFrame
      step="answer"
      title={done ? 'Pace is set up' : 'Say hello to Pace in Slack'}
      lead={
        done
          ? 'It answered in Slack, so the whole path works. Overview shows how it is doing from here.'
          : 'Pace is running. Mention it once to see the whole path work, from Slack to the AI and back.'
      }
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={() => onLeave('#/')}>Go to Overview</Button>
        </>
      }
    >
      {!running && !done && (
        <Problem
          action={
            phase !== 'starting' && phase !== 'stopping' ? (
              <Button
                variant="outline"
                onClick={() => void window.pacenoteDesktop?.bot.start()}
              >
                Start Pace
              </Button>
            ) : undefined
          }
        >
          {phase === 'starting'
            ? 'Pace is starting.'
            : `Pace isn't running, so it can't answer yet.${supervisor?.message ? ` ${supervisor.message}` : ''}`}
        </Problem>
      )}
      {!done && (
        <div className="flex flex-col gap-2.5">
          <b className="text-section">Ask it something in a channel it is in</b>
          <CommandLine text="@Pace what can you help me with?" />
          <p className="text-body text-muted-foreground">
            In another channel, invite it first with{' '}
            <code className="rounded-sm bg-well px-1.5 font-mono text-meta">
              /invite @Pace
            </code>
            .
          </p>
        </div>
      )}
      <div
        aria-live="polite"
        className="rounded-xl px-5 py-4 ring-1 ring-border"
      >
        <Swap id={shown ? `${shown.id}:${shown.status}` : 'waiting'}>
          {shown ? (
            <Answer run={shown} onLeave={onLeave} />
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
      {shown && shown.status !== 'running' && !answered && (
        <Failed run={shown} />
      )}
      {waited && (
        <Hint>
          Nothing yet? If Pace said in Slack that it can't answer there, mention
          it in a public channel it's in, as yourself.
        </Hint>
      )}
    </StepFrame>
  )
}

/** The mention Pace is answering, or answered, and where to see it */
function Answer({
  run,
  onLeave,
}: {
  run: RunSummary
  onLeave: (hash: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2.5">
        {run.status === 'running' ? (
          <Chip tone="working">
            <LoaderCircle className="animate-spin" />
            Pace is answering
          </Chip>
        ) : run.status === 'succeeded' ? (
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
          <span className="truncate text-section">"{run.request}"</span>
          <span className="text-body text-muted-foreground">
            {run.conversationLabel}
            {run.userName ? ` · @${run.userName}` : ''}
            {run.status === 'succeeded' ? ' · answered in the thread' : ''}
          </span>
        </span>
        <Button
          variant="ghost"
          onClick={() => onLeave(`#/runs/${encodeURIComponent(run.id)}`)}
        >
          Open the run
        </Button>
      </div>
    </div>
  )
}

/**
 * Why the try failed, in the operator's words (failureAdvice), the error
 * itself under Details, and that the next mention, once fixed, finishes setup
 */
function Failed({ run }: { run: RunSummary }) {
  const { data } = useRun(run.id)
  const record =
    data && data.kind !== 'collection' ? (data as RunRecord) : undefined
  const error = record?.error ?? ''
  const advice = record
    ? failureAdvice(
        record.cause ?? failureCause(error),
        record.backend.reasoner,
        record.backend.sandbox
      )
    : undefined
  const reason =
    advice?.text ??
    (run.status === 'interrupted'
      ? 'Pace stopped before it answered.'
      : "Pace couldn't produce an answer.")
  return (
    <Problem details={error || undefined}>
      {reason} Fix it, then mention Pace again: its next answer finishes setup.
    </Problem>
  )
}
