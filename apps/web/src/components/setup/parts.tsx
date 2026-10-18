import { Check, Copy, Info, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SETUP_STEPS, type SetupStep } from '@/lib/setup'
import { cn } from '@/lib/utils'

/**
 * One step of setup: which step it is, the question, a line on why it
 * matters, what to decide, and the buttons that decide it along the bottom.
 * Its question takes the focus as it comes in, so a keyboard or a screen
 * reader goes on from the top of the new step rather than from nowhere.
 */
export function StepFrame({
  step,
  part,
  title,
  lead,
  children,
  footer,
}: {
  step: SetupStep
  /** The part of the step it is on: "Your own Slack app" */
  part?: string
  title: string
  lead: React.ReactNode
  children: React.ReactNode
  footer: React.ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus({ preventScroll: true }), [])
  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="@container mx-auto max-w-3xl px-10 pt-9 pb-8">
          <p className="text-body font-semibold text-primary">
            Step {SETUP_STEPS.indexOf(step) + 1} of {SETUP_STEPS.length}
            {part && ` · ${part}`}
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="mt-1 text-title outline-none"
          >
            {title}
          </h1>
          <p className="mt-1.5 max-w-xl text-copy text-muted-foreground">
            {lead}
          </p>
          <div className="mt-6 flex flex-col gap-4">{children}</div>
        </div>
      </ScrollArea>
      <footer className="flex shrink-0 items-center gap-2 border-t border-border px-10 py-3">
        {footer}
      </footer>
    </div>
  )
}

/** A choice among a few, as a card with its radio button */
export function ChoiceCard({
  name,
  value,
  checked,
  disabled,
  onChoose,
  children,
}: {
  name: string
  value: string
  checked: boolean
  disabled?: boolean
  onChoose: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label
      className={cn(
        'flex gap-3 rounded-xl p-4 ring-1 ring-border transition-colors',
        disabled
          ? 'cursor-default bg-well/60'
          : checked
            ? 'cursor-pointer bg-card-accent ring-2 ring-primary'
            : 'cursor-pointer hover:bg-well'
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChoose(value)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">{children}</span>
    </label>
  )
}

const CHIP = {
  ok: 'bg-status-succeeded/12 text-status-succeeded',
  accent: 'bg-primary/12 text-primary',
  warn: 'bg-status-interrupted/12 text-status-interrupted',
  working: 'bg-status-running/12 text-status-running',
  failed: 'bg-status-failed/10 text-status-failed',
  neutral: 'bg-muted text-muted-foreground',
}

/** A short state beside what it is about: "Signed in", "Waiting for Slack" */
export function Chip({
  tone,
  children,
  className,
}: {
  tone: keyof typeof CHIP
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-meta font-semibold whitespace-nowrap [&_svg]:size-3.5',
        CHIP[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

/** Something to type in Slack or Terminal, with a button that copies it */
export function CommandLine({
  text,
  raised,
}: {
  text: string
  /** On a well already: set off from it */
  raised?: boolean
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1_500)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <span
      className={cn(
        'flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1.5 pr-1.5 pl-3.5',
        raised ? 'bg-card ring-1 ring-border' : 'bg-well'
      )}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-copy select-all">
        {text}
      </code>
      <Button
        size="sm"
        variant="outline"
        aria-label={`Copy ${text}`}
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => setCopied(true))
        }
      >
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  )
}

/** A line of context in a step: what it means, never what to do next */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl bg-well px-4 py-3 text-body text-muted-foreground">
      <Info className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * What went wrong, in a sentence that says what to do, with the way to do it
 * beside it. The raw words, when there are any, wait under Details.
 */
export function Problem({
  children,
  action,
  details,
}: {
  children: React.ReactNode
  action?: React.ReactNode
  details?: string
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl bg-status-failed/8 px-4 py-3.5"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-px size-4 shrink-0 text-status-failed" />
        <p className="min-w-0 flex-1 text-body text-foreground">{children}</p>
        {action && <span className="flex shrink-0 gap-2">{action}</span>}
      </div>
      {details && (
        <details className="group pl-7">
          <summary className="cursor-pointer text-meta font-semibold text-muted-foreground hover:text-foreground">
            Details
          </summary>
          <pre className="mt-1.5 max-h-32 overflow-auto rounded-xl bg-well px-3 py-2 font-mono text-meta whitespace-pre-wrap text-muted-foreground">
            {details}
          </pre>
        </details>
      )}
    </div>
  )
}

/** Whether something has been going on for a while: a hint is due */
export function useWaited(active: boolean, ms: number): boolean {
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    setWaited(false)
    if (!active) return
    const timer = setTimeout(() => setWaited(true), ms)
    return () => clearTimeout(timer)
  }, [active, ms])
  return waited
}

/** A hint that comes after a while of nothing: what to check */
export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p data-motion="in" className="motion-swap text-body text-muted-foreground">
      {children}
    </p>
  )
}
