import type { RunEvent, RunRecord } from '@history/types'
import { failureAdvice } from '@src/mention/failure'
import {
  Brain,
  ChevronRight,
  CircleCheck,
  CircleX,
  Info,
  SquareTerminal,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import type * as React from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { artifactUrl } from '@/lib/api'
import {
  formatClock,
  formatDateTime,
  formatDuration,
  previewArgs,
  stepDuration,
} from '@/lib/format'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { CodeBlock } from './code-block'
import { PaceSpinner } from './pace-spinner'
import { Markdown } from './markdown'
import { text } from './timeline.text'
import { recordText } from '@src/history/record-text'

/** Shows the request -> steps -> reply -> outputs in order. */
export function Timeline({ run }: { run: RunRecord }) {
  const t = useText(text)
  const answer = run.answer?.trim()
  const working = run.status === 'running'
  // The last message is the same as the final reply, so it is left out of the
  // steps.
  const lastMessageIndex = run.events.findLastIndex((e) => e.kind === 'message')
  const steps = run.events.filter(
    (event, i) =>
      event.kind !== 'usage' &&
      !(
        answer &&
        event.kind === 'message' &&
        i === lastMessageIndex &&
        event.text.trim() === answer
      )
  )

  return (
    <div className="space-y-5">
      <Bubble
        avatar={
          <span className="grid size-7 place-items-center rounded-full bg-secondary text-meta font-semibold text-secondary-foreground">
            {(run.origin.userName ?? '?').slice(0, 1).toUpperCase()}
          </span>
        }
        title={`@${run.origin.userName ?? run.origin.userId}`}
        meta={`${run.origin.conversationLabel} / ${formatDateTime(run.startedAt)}`}
      >
        <p className="text-copy leading-relaxed whitespace-pre-wrap">
          {run.request || (
            <span className="text-muted-foreground">{t.emptyRequest}</span>
          )}
        </p>
        {run.context.messages > 0 && (
          <p className="mt-1.5 text-caption text-muted-foreground">
            {t.context(run.context.messages, run.attachments.length)}
          </p>
        )}
      </Bubble>

      {steps.length > 0 && (
        <div className="ml-3.5 space-y-1 border-l border-dashed pl-6">
          {steps.map((event, i) => (
            <Step
              key={'id' in event ? event.id : `${event.kind}-${i}`}
              event={event}
            />
          ))}
        </div>
      )}

      {/* Pace's reply. While Pace works, its mark looks around where the
          reply will appear; when the reply comes, the mark eases into the
          logo and stays as Pace's avatar. */}
      {(working || answer) && (
        <Bubble
          avatar={<PaceSpinner active={working} />}
          title="Pace"
          meta={
            working ? (
              <span className="text-shimmer font-medium text-status-running">
                {t.working}
              </span>
            ) : run.finishedAt ? (
              formatDateTime(run.finishedAt)
            ) : undefined
          }
          accent
        >
          {answer && <Markdown>{answer}</Markdown>}
        </Bubble>
      )}

      {run.outputs.length > 0 && (
        <div className="ml-10 grid grid-cols-2 gap-3">
          {run.outputs.map((output) => (
            <figure key={output.file} className="surface-card overflow-hidden">
              <a
                href={artifactUrl(run.id, output.file)}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={artifactUrl(run.id, output.file)}
                  alt={recordText(output.title)}
                  className="max-h-80 w-full bg-white object-contain"
                />
              </a>
              <figcaption className="border-t border-canvas px-3 py-1.5 text-meta text-muted-foreground">
                {t.output(recordText(output.title), output.kind === 'diagram')}
              </figcaption>
              {output.source && (
                <Disclosure label={t.source} className="border-t border-canvas">
                  <CodeBlock
                    code={output.source}
                    className="m-2 mt-0"
                    maxHeight="max-h-60"
                  />
                </Disclosure>
              )}
            </figure>
          ))}
        </div>
      )}

      {run.error && run.status !== 'succeeded' && (
        <div className="flex gap-2 rounded-xl bg-status-failed/10 px-4 py-3 text-copy">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-failed" />
          <div className="min-w-0">
            <p className="font-medium text-status-failed">
              {run.status === 'interrupted' ? t.interrupted : t.failed}
            </p>
            <p className="mt-0.5 font-mono text-meta break-words whitespace-pre-wrap text-muted-foreground">
              {recordText(run.error)}
            </p>
            {run.cause && <Advice run={run} cause={run.cause} />}
          </div>
        </div>
      )}
    </div>
  )
}

/** What the failure means for the operator, and where to fix it */
function Advice({
  run,
  cause,
}: {
  run: RunRecord
  cause: NonNullable<RunRecord['cause']>
}) {
  const t = useText(text)
  const advice = failureAdvice(cause, run.backend.reasoner, run.backend.sandbox)
  if (!advice) return null
  return (
    <p className="mt-2 text-copy text-foreground">
      {advice.text}
      {advice.route && (
        <>
          {' '}
          <a
            href={advice.route}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {advice.route.startsWith('#/settings')
              ? t.openSettings
              : t.openPace}
          </a>
        </>
      )}
    </p>
  )
}

function Bubble({
  avatar,
  title,
  meta,
  accent,
  children,
}: {
  avatar: React.ReactNode
  title: string
  meta?: React.ReactNode
  accent?: boolean
  /** None: only the header, as while Pace works on its reply */
  children?: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 pt-1">{avatar}</div>
      <div
        className={cn(
          'min-w-0 flex-1 px-5 py-4',
          // Bot replies use the mint surface and requests the card surface.
          // (same look as the Overview cards)
          accent
            ? 'surface-card-accent [--code-bg:var(--card)]'
            : 'surface-card'
        )}
      >
        <div className={cn('flex items-baseline gap-2', children && 'mb-2')}>
          <span className="text-section">{title}</span>
          {meta && (
            <span className="text-caption text-muted-foreground">{meta}</span>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

function Disclosure({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-caption text-muted-foreground hover:text-foreground">
        <ChevronRight
          className={cn('size-3 transition-transform', open && 'rotate-90')}
        />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

function Step({ event }: { event: RunEvent }) {
  const t = useText(text)
  switch (event.kind) {
    case 'tool':
    case 'command':
      return <ToolStep event={event} />
    case 'message':
      return (
        <div className="py-1 text-body leading-relaxed text-muted-foreground">
          <Markdown className="prose-p:my-0 text-muted-foreground">
            {event.text}
          </Markdown>
        </div>
      )
    case 'reasoning':
      return (
        <ExpandableRow
          icon={<Brain className="size-3.5 text-muted-foreground" />}
          label={t.thinking}
          preview={event.text}
        >
          <p className="px-3 py-2 text-meta leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {event.text}
          </p>
        </ExpandableRow>
      )
    case 'note':
      return (
        <div className="flex items-center gap-1.5 py-1 text-caption text-status-interrupted">
          <Info className="size-3.5 shrink-0" />
          {recordText(event.text)}
          <span className="text-muted-foreground">{formatClock(event.at)}</span>
        </div>
      )
    case 'error':
      return (
        <div className="flex items-start gap-1.5 py-1 text-meta text-status-failed">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span className="break-words">{recordText(event.message)}</span>
        </div>
      )
    default:
      return null
  }
}

function ToolStep({
  event,
}: {
  event: Extract<RunEvent, { kind: 'tool' | 'command' }>
}) {
  const t = useText(text)
  const isTool = event.kind === 'tool'
  const preview = isTool ? previewArgs(event.arguments) : event.command
  const output = isTool ? (event.error ?? event.result) : event.output
  const failed =
    event.status === 'failed' || (!isTool && (event.exitCode ?? 0) !== 0)
  const icon =
    event.status === 'running' ? (
      <span className="grid size-3.5 place-items-center">
        <span className="size-2 animate-pulse-dot rounded-full bg-status-running" />
      </span>
    ) : failed ? (
      <CircleX className="size-3.5 text-status-failed" />
    ) : (
      <CircleCheck className="size-3.5 text-status-succeeded" />
    )

  return (
    <ExpandableRow
      icon={icon}
      label={
        // The server (ops, codex_apps, etc.) is a small tag; only the tool name
        // is shown large.
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-md bg-well px-1.5 py-px text-caption text-muted-foreground [&_svg]:size-3">
            {isTool ? <Wrench /> : <SquareTerminal />}
            {isTool ? event.server : 'shell'}
          </span>
          {isTool && <span className="font-mono">{event.tool}</span>}
        </span>
      }
      preview={preview}
      trailing={formatDuration(stepDuration(event.at, event.finishedAt))}
    >
      <div className="space-y-2 p-2">
        {isTool && event.arguments !== undefined && (
          <CodeBlock
            label={t.arguments}
            code={JSON.stringify(event.arguments, null, 2)}
            maxHeight="max-h-52"
          />
        )}
        {!isTool && (
          <CodeBlock
            label={t.command}
            code={event.command}
            maxHeight="max-h-40"
          />
        )}
        {output ? (
          <CodeBlock
            label={
              failed
                ? t.error
                : isTool
                  ? t.result
                  : t.commandOutput(event.exitCode)
            }
            code={output}
          />
        ) : (
          event.status === 'running' && (
            <p className="px-1 text-meta text-muted-foreground">{t.running}</p>
          )
        )}
      </div>
    </ExpandableRow>
  )
}

function ExpandableRow({
  icon,
  label,
  preview,
  trailing,
  children,
}: {
  icon: React.ReactNode
  label: React.ReactNode
  preview?: string
  trailing?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('rounded-lg', open && 'bg-card')}
    >
      <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-meta transition-colors hover:bg-accent/60">
        {/* A long preview never shrinks the icon. Only the preview text
            shrinks. */}
        <span className="flex shrink-0">{icon}</span>
        <span className="shrink-0 font-medium">{label}</span>
        {preview && (
          <span className="min-w-0 truncate text-muted-foreground">
            {preview}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground tabular-nums">
          {trailing && trailing !== '-' && trailing}
          <ChevronRight
            className={cn('size-3.5 transition-transform', open && 'rotate-90')}
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
