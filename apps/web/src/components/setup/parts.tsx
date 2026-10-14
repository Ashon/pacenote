import { Check, Copy, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SETUP_STEPS, type SetupStep } from '@/lib/setup'
import { cn } from '@/lib/utils'

/**
 * One step of setup: which step it is, the question, a line on why it
 * matters, what to decide, and the buttons that decide it along the bottom
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
  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="@container mx-auto max-w-3xl px-10 pt-9 pb-8">
          <p className="text-body font-semibold text-primary">
            Step {SETUP_STEPS.indexOf(step) + 1} of {SETUP_STEPS.length}
            {part && ` · ${part}`}
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
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
        'flex gap-3 rounded-2xl p-4 ring-1 ring-border transition-colors',
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
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5',
        CHIP[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

/** Something to type in Slack, with a button that copies it */
export function CommandLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1_500)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-well py-1.5 pr-1.5 pl-3.5">
      <code className="min-w-0 flex-1 truncate font-mono text-sm select-all">
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
