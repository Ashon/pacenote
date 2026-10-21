import type { RunRecord, RunSummary } from '@src/history/types'
import { failureAdvice, failureCause } from '@src/mention/failure'
import type { SetupRecord } from '@src/settings/setup'
import {
  ArrowRightLeft,
  CircleCheck,
  CircleX,
  LoaderCircle,
} from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Swap } from '@/components/ui/motion'
import { useRun, useRuns } from '@/lib/api'
import { useSupervisor } from '@/lib/desktop'
import { useText } from '@/lib/i18n'
import { useMacs, whereAnswers } from '@/lib/macs'
import { PaceSpinner } from '../pace-spinner'
import { text } from './answer-step.text'
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
  const t = useText(text)
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
  // Set up from your other Mac: Pace moves here, the Mac you're using
  const macs = useMacs()
  const where = record.fromMac ? whereAnswers(macs) : undefined

  return (
    <StepFrame
      step="answer"
      title={done ? t.titleDone : t.title}
      lead={done ? t.leadDone : t.lead}
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={() => onLeave('#/')}>{t.toOverview}</Button>
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
                {t.start}
              </Button>
            ) : undefined
          }
        >
          {phase === 'starting'
            ? t.starting
            : t.notRunning(supervisor?.message)}
        </Problem>
      )}
      {where && (
        <p
          className="flex items-center gap-2 text-body text-muted-foreground"
          data-where-answers={where.here ? 'here' : 'other'}
        >
          <ArrowRightLeft className="size-4 shrink-0" />
          {where.here
            ? t.movedHere(macs?.moved?.from ?? record.fromMac?.name)
            : t.movingHere(where.other?.name ?? record.fromMac?.name)}
        </p>
      )}
      {!done && (
        <div className="flex flex-col gap-2.5">
          <b className="text-section">{t.askSomething}</b>
          <CommandLine text={t.question} />
          <p className="text-body text-muted-foreground">
            {t.inviteFirst(
              <code className="rounded-sm bg-well px-1.5 font-mono text-meta">
                /invite @Pace
              </code>
            )}
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
              <span className="text-shimmer">{t.waiting}</span>
            </p>
          )}
        </Swap>
      </div>
      {shown && shown.status !== 'running' && !answered && (
        <Failed run={shown} />
      )}
      {waited && <Hint>{t.nothingYet}</Hint>}
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
  const t = useText(text)
  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2.5">
        {run.status === 'running' ? (
          <Chip tone="working">
            <LoaderCircle className="animate-spin" />
            {t.answering}
          </Chip>
        ) : run.status === 'succeeded' ? (
          <Chip tone="ok">
            <CircleCheck />
            {t.sent}
          </Chip>
        ) : (
          <Chip tone="failed">
            <CircleX />
            {t.couldNot}
          </Chip>
        )}
      </span>
      <div className="flex items-center gap-4 rounded-xl bg-well px-4 py-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-section">"{run.request}"</span>
          <span className="text-body text-muted-foreground">
            {run.conversationLabel}
            {run.userName ? ` · @${run.userName}` : ''}
            {run.status === 'succeeded' ? t.inThread : ''}
          </span>
        </span>
        <Button
          variant="ghost"
          onClick={() => onLeave(`#/runs/${encodeURIComponent(run.id)}`)}
        >
          {t.openRun}
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
  const t = useText(text)
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
    advice?.text ?? (run.status === 'interrupted' ? t.interrupted : t.noAnswer)
  return <Problem details={error || undefined}>{t.failed(reason)}</Problem>
}
