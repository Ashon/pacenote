import {
  CircleAlert,
  CircleCheck,
  Download,
  KeyRound,
  LoaderCircle,
} from 'lucide-react'
import { useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import type { Detected, useSandboxSetup } from '@/lib/setup'
import { cn } from '@/lib/utils'
import type { SettingsView } from '@src/settings/fields'
import type { SetupPart } from '@src/sandbox/vm-progress'
import { ChoiceCard, Chip, Note, StepFrame } from './parts'

type Runtime = 'vm' | 'none'

/**
 * 2. Where Pace works out answers: the built-in sandbox by default, where this
 * Mac runs it, or directly on this Mac. Choosing the sandbox starts preparing
 * it, which goes on while Slack is set up.
 */
export function RuntimeStep({
  detected,
  settings,
  sandbox,
  preparing,
  onPrepare,
  onBack,
  onDone,
}: {
  detected?: Detected
  settings: { view?: SettingsView; refresh: () => void }
  sandbox: ReturnType<typeof useSandboxSetup>
  /** Showing the sandbox being prepared (2b) */
  preparing: boolean
  onPrepare: () => void
  onBack: () => void
  onDone: () => void
}) {
  const unsupported = detected?.sandbox.unsupported
  const backend =
    settings.view?.values.REASONER === 'codex' ? 'codex' : 'claude'
  const saved = settings.view?.values.REASONER_SANDBOX
  const [chosen, setChosen] = useState<Runtime>()
  const runtime: Runtime = unsupported
    ? 'none'
    : (chosen ?? (saved === 'none' ? 'none' : 'vm'))
  const tokenSet = Boolean(
    settings.view?.secrets.SANDBOX_CLAUDE_OAUTH_TOKEN?.set
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  if (preparing)
    return (
      <Preparing
        sandbox={sandbox}
        onBack={onBack}
        onDone={onDone}
        retry={() => sandbox.run('vm')}
      />
    )

  const use = async () => {
    setSaving(true)
    setError(undefined)
    const result = await window.pacenoteDesktop?.settings.save({
      REASONER_SANDBOX: runtime,
    })
    setSaving(false)
    settings.refresh()
    if (result?.issues.length)
      return setError(result.issues.map((issue) => issue.message).join(' '))
    if (runtime === 'none' || sandbox.ready) return onDone()
    if (!sandbox.preparing) sandbox.run('vm')
    onPrepare()
  }

  return (
    <StepFrame
      step="runtime"
      title="Where should Pace work out answers?"
      lead="Pace answers messages other people write. Choose how much of this Mac it can see while it works."
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <span className="flex-1" />
          {error && <p className="text-body text-status-failed">{error}</p>}
          <Button onClick={() => void use()} disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            {runtime === 'vm'
              ? 'Use the built-in sandbox'
              : 'Run directly on this Mac'}
          </Button>
        </>
      }
    >
      {unsupported && (
        <Note>
          {unsupported} For now Pace can only run directly on this Mac.
        </Note>
      )}
      <div
        role="radiogroup"
        aria-label="Where Pace runs"
        className="grid grid-cols-1 gap-3 @min-[34rem]:grid-cols-2"
      >
        <ChoiceCard
          name="runtime"
          value="vm"
          checked={runtime === 'vm'}
          disabled={Boolean(unsupported)}
          onChoose={() => setChosen('vm')}
        >
          <span className="flex items-center gap-2">
            <b className="text-sm">Built-in sandbox</b>
            {unsupported ? (
              <Chip tone="neutral">Not on this Mac</Chip>
            ) : (
              <Chip tone="ok">Recommended</Chip>
            )}
          </span>
          <Point good>A small Linux VM per request, removed after</Point>
          <Point good>Can't see your files or your logins</Point>
          <Point good>
            Reaches only {backend === 'codex' ? 'ChatGPT' : 'Claude'} and the
            sites you allow
          </Point>
        </ChoiceCard>
        <ChoiceCard
          name="runtime"
          value="none"
          checked={runtime === 'none'}
          onChoose={() => setChosen('none')}
        >
          <b className="text-sm">Directly on this Mac</b>
          <Point>Nothing to install or prepare</Point>
          <Point warn>
            Uses your own login and can read the files you point it to
          </Point>
          <Point warn>No isolation, so diagrams and tools stay off</Point>
        </ChoiceCard>
      </div>
      {runtime === 'vm' && (
        <>
          <p className="flex items-start gap-2.5 text-body text-muted-foreground">
            <Download className="mt-px size-4 shrink-0" />
            {sandbox.ready ? (
              <span>
                <b className="font-semibold text-foreground">Ready:</b> it was
                prepared on this Mac already.
              </span>
            ) : sandbox.preparing ? (
              <span>
                <b className="font-semibold text-foreground">
                  Already preparing,{' '}
                  {Math.round((sandbox.progress?.fraction ?? 0) * 100)}%:
                </b>{' '}
                it started when setup opened, and carries on while you connect
                Slack. About 300 MB to download, 1.5 GB of disk.
              </span>
            ) : (
              <span>
                <b className="font-semibold text-foreground">
                  First time only:
                </b>{' '}
                downloads about 300 MB and uses about 1.5 GB of disk. It
                prepares in the background while you connect Slack.
              </span>
            )}
          </p>
          {backend === 'claude' ? (
            <SandboxLogin set={tokenSet} onSaved={settings.refresh} later />
          ) : (
            <Note>
              The sandbox uses this Mac's codex login (~/.codex/auth.json),
              without showing it anything else.
            </Note>
          )}
        </>
      )}
    </StepFrame>
  )
}

function Point({
  good,
  warn,
  children,
}: {
  good?: boolean
  warn?: boolean
  children: React.ReactNode
}) {
  const Icon = warn ? CircleAlert : CircleCheck
  return (
    <span className="flex items-start gap-2 text-body text-muted-foreground">
      <Icon
        className={cn(
          'mt-px size-4 shrink-0',
          good && 'text-primary',
          warn && 'text-status-interrupted'
        )}
      />
      {children}
    </span>
  )
}

/**
 * The sandbox's own Claude login: claude setup-token in the browser, saved
 * without showing it here
 */
export function SandboxLogin({
  set,
  onSaved,
  later,
}: {
  set: boolean
  onSaved: () => void
  /** It can wait: said beside the button, which is then not required yet */
  later?: boolean
}) {
  const sandbox = window.pacenoteDesktop?.sandbox
  const [state, setState] = useState<
    { step: 'idle' } | { step: 'waiting' } | { step: 'error'; message: string }
  >({ step: 'idle' })
  const get = async () => {
    if (!sandbox) return
    setState({ step: 'waiting' })
    const result = await sandbox.claudeToken()
    if (result.ok) {
      setState({ step: 'idle' })
      onSaved()
    } else setState({ step: 'error', message: result.error })
  }
  return (
    <div className="flex items-center gap-4 rounded-2xl px-4 py-3.5 ring-1 ring-border">
      <KeyRound className="size-5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="text-sm font-semibold">
          The sandbox needs its own Claude login
        </b>
        <span className="text-body text-muted-foreground">
          {state.step === 'error'
            ? state.message
            : state.step === 'waiting'
              ? 'Approve in your browser. Pacenote saves the token without showing it.'
              : later
                ? 'Pace needs it to answer from the sandbox. Get it now, or before Pace starts.'
                : "It can't see the login on this Mac. Approve once in your browser, and Pacenote saves a token for the sandbox."}
        </span>
      </span>
      {set && state.step === 'idle' ? (
        <Chip tone="ok">
          <CircleCheck />
          Signed in
        </Chip>
      ) : state.step === 'waiting' ? (
        <Button
          variant="ghost"
          onClick={() => void sandbox?.cancelClaudeToken()}
        >
          <LoaderCircle className="animate-spin" />
          Cancel
        </Button>
      ) : (
        <Button variant="outline" onClick={() => void get()}>
          Get a token from Claude
        </Button>
      )}
    </div>
  )
}

const PART_CHIP: Record<
  SetupPart['state'],
  { tone: 'ok' | 'working' | 'failed' | 'neutral'; text: string }
> = {
  done: { tone: 'ok', text: 'Ready' },
  working: { tone: 'working', text: 'Working' },
  failed: { tone: 'failed', text: 'Failed' },
  waiting: { tone: 'neutral', text: 'Next' },
}

/** 2b. The sandbox being prepared, which setup need not wait for */
function Preparing({
  sandbox,
  onBack,
  onDone,
  retry,
}: {
  sandbox: ReturnType<typeof useSandboxSetup>
  onBack: () => void
  onDone: () => void
  retry: () => void
}) {
  const progress = sandbox.progress
  const failed = sandbox.job?.state === 'failed'
  const done = sandbox.job?.state === 'succeeded' || sandbox.ready
  const working = progress?.parts.find((part) => part.state === 'working')
  const percent = done ? 100 : Math.round((progress?.fraction ?? 0) * 100)
  return (
    <StepFrame
      step="runtime"
      title="Preparing the built-in sandbox"
      lead="The first time takes a few minutes. You don't have to wait here: keep going with setup, and this carries on in the background."
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <span className="flex-1" />
          {failed && (
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          )}
          <Button onClick={onDone}>Continue setup</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5 rounded-2xl bg-well px-5 py-4">
        <span className="text-sm font-semibold">
          {failed
            ? 'Preparing stopped'
            : done
              ? 'The built-in sandbox is ready'
              : working
                ? `${working.doing}…`
                : 'Starting…'}
        </span>
        <div
          role="progressbar"
          aria-label="Preparing the built-in sandbox"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'motion-progress h-full rounded-full',
              failed ? 'bg-status-failed' : 'bg-primary'
            )}
            style={{ width: `${Math.max(percent, 4)}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          Done once. After this, each request starts its sandbox in about a
          second.
        </span>
      </div>
      <ul className="flex flex-col">
        {progress?.parts.map((part) => (
          <li
            key={part.id}
            className="flex items-center gap-3 border-b border-border py-2.5 text-sm last:border-b-0"
          >
            <span
              className={cn(
                'flex-1',
                part.state === 'waiting' && 'text-muted-foreground',
                part.state === 'working' && 'font-semibold'
              )}
            >
              {part.label}
            </span>
            <Chip tone={PART_CHIP[part.state].tone}>
              {part.state === 'working' && (
                <LoaderCircle className="animate-spin" />
              )}
              {PART_CHIP[part.state].text}
            </Chip>
          </li>
        ))}
      </ul>
      {failed && sandbox.job && (
        <pre className="max-h-32 overflow-auto rounded-xl bg-well px-4 py-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
          {sandbox.job.output.slice(-6).join('\n')}
        </pre>
      )}
      <Note>
        Quitting Pacenote pauses this, and it picks up where it stopped next
        time.
      </Note>
    </StepFrame>
  )
}
