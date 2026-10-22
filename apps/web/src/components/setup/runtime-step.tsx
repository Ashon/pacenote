import { CircleAlert, CircleCheck, Download, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { useText } from '@/lib/i18n'
import type { Detected, useSandboxSetup } from '@/lib/setup'
import { cn } from '@/lib/utils'
import { localized } from '@src/i18n/locale'
import type { SettingsView } from '@src/settings/fields'
import type { SetupPart } from '@src/sandbox/vm-progress'
import { SandboxSignIn } from '../sandbox-sign-in'
import { ChoiceCard, Chip, Note, Problem, StepFrame } from './parts'
import { text } from './runtime-step.text'

type Runtime = 'vm' | 'none'

/**
 * Why the built-in sandbox is not being prepared, when it stopped or could not
 * start: what to check, and the job's last lines for Details
 */
export function preparingProblem(
  sandbox: ReturnType<typeof useSandboxSetup>
): { text: string; details?: string } | undefined {
  const t = localized(text)
  if (sandbox.error?.kind === 'vm' && !sandbox.preparing)
    return { text: t.couldNotStart(sandbox.error.message) }
  if (sandbox.job?.state !== 'failed' || sandbox.ready) return undefined
  const part = sandbox.progress?.parts.find((each) => each.state === 'failed')
  return {
    text: t.stopped(part?.label),
    details: sandbox.job.output.slice(-12).join('\n'),
  }
}

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
  const t = useText(text)
  const unsupported = detected?.sandbox.unsupported
  const backend =
    settings.view?.values.REASONER === 'codex' ? 'codex' : 'claude'
  const saved = settings.view?.values.REASONER_SANDBOX
  const [chosen, setChosen] = useState<Runtime>()
  const runtime: Runtime = unsupported
    ? 'none'
    : (chosen ?? (saved === 'none' ? 'none' : 'vm'))
  // Signed in inside the sandbox, or, for claude, a token or key set by hand
  const signedIn = Boolean(
    sandbox.status?.signedIn ||
    (backend === 'claude' &&
      (settings.view?.secrets.SANDBOX_CLAUDE_OAUTH_TOKEN?.set ||
        settings.view?.secrets.SANDBOX_ANTHROPIC_API_KEY?.set))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const problem = preparingProblem(sandbox)

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
      title={t.title}
      lead={t.lead}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            {t.back}
          </Button>
          <span className="flex-1" />
          {error && <p className="text-body text-status-failed">{error}</p>}
          <Button onClick={() => void use()} disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            {runtime === 'vm' ? t.useSandbox : t.runDirectly}
          </Button>
        </>
      }
    >
      {unsupported && <Note>{t.unsupported(unsupported)}</Note>}
      <div
        role="radiogroup"
        aria-label={t.runtimeLabel}
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
            <b className="text-section">{t.sandbox}</b>
            {unsupported ? (
              <Chip tone="neutral">{t.notOnThisMac}</Chip>
            ) : (
              <Chip tone="accent">{t.recommended}</Chip>
            )}
          </span>
          <Point good>{t.vmPerRequest}</Point>
          <Point good>{backend === 'codex' ? t.noFilesCodex : t.noFiles}</Point>
          <Point good>
            {t.reachesOnly(backend === 'codex' ? 'ChatGPT' : 'Claude')}
          </Point>
        </ChoiceCard>
        <ChoiceCard
          name="runtime"
          value="none"
          checked={runtime === 'none'}
          onChoose={() => setChosen('none')}
        >
          <b className="text-section">{t.directly}</b>
          <Point>{t.nothingToInstall}</Point>
          <Point warn>{t.ownLogin}</Point>
          <Point warn>{t.noIsolation}</Point>
        </ChoiceCard>
      </div>
      {runtime === 'vm' && (
        <>
          {problem && (
            <Problem
              details={problem.details}
              action={
                <Button variant="outline" onClick={() => sandbox.run('vm')}>
                  {t.tryAgain}
                </Button>
              }
            >
              {problem.text}
            </Problem>
          )}
          <p className="flex items-start gap-2.5 text-body text-muted-foreground">
            <Download className="mt-px size-4 shrink-0" />
            <span>
              {sandbox.ready
                ? t.ready(bold)
                : sandbox.preparing
                  ? t.alreadyPreparing(
                      bold,
                      Math.round((sandbox.progress?.fraction ?? 0) * 100)
                    )
                  : t.firstTime(bold)}
            </span>
          </p>
          <SandboxLogin
            cli={backend}
            signedIn={signedIn}
            ready={sandbox.ready}
            onSignedIn={() => {
              sandbox.refresh()
              settings.refresh()
            }}
            later
          />
        </>
      )}
    </StepFrame>
  )
}

/** The lead-in of a line, in bold */
const bold = (text: string) => (
  <b className="font-semibold text-foreground">{text}</b>
)

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
 * The sandbox's own sign-in, inside it (src/sandbox/vm-login.ts): Claude or
 * Codex keeps its login there, apart from this Mac's
 */
export function SandboxLogin({
  cli,
  signedIn,
  ready,
  onSignedIn,
  later,
  required,
}: {
  cli: 'claude' | 'codex'
  signedIn: boolean
  /** The sandbox is ready to run the sign-in */
  ready: boolean
  onSignedIn: () => void
  /** It can wait: said beside the button, which is then not required yet */
  later?: boolean
  /** Pace cannot answer without it: said beside its name */
  required?: boolean
}) {
  const t = useText(text)
  const name = cli === 'claude' ? 'Claude' : 'Codex'
  return (
    <div className="flex flex-col gap-2 rounded-xl px-4 py-3.5 ring-1 ring-border">
      <span className="flex flex-wrap items-center gap-2">
        <b className="text-section">{t.ownSignIn(name)}</b>
        {required && !signedIn && <Chip tone="warn">{t.required}</Chip>}
        {signedIn && (
          <Chip tone="ok">
            <CircleCheck />
            {t.signedIn}
          </Chip>
        )}
      </span>
      {later && !signedIn && (
        <span className="text-body text-muted-foreground">{t.signInLater}</span>
      )}
      <SandboxSignIn
        cli={cli}
        signedIn={signedIn}
        ready={ready}
        onSignedIn={onSignedIn}
      />
    </div>
  )
}

/** How each part's state looks; its words are in the text */
const PART_TONE: Record<
  SetupPart['state'],
  'ok' | 'working' | 'failed' | 'neutral'
> = { done: 'ok', working: 'working', failed: 'failed', waiting: 'neutral' }

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
  const t = useText(text)
  const progress = sandbox.progress
  const problem = preparingProblem(sandbox)
  const failed = Boolean(problem)
  const done = sandbox.job?.state === 'succeeded' || sandbox.ready
  const working = progress?.parts.find((part) => part.state === 'working')
  const percent = done ? 100 : Math.round((progress?.fraction ?? 0) * 100)
  return (
    <StepFrame
      step="runtime"
      title={t.preparingTitle}
      lead={t.preparingLead}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            {t.back}
          </Button>
          <span className="flex-1" />
          <Button variant={failed ? 'ghost' : undefined} onClick={onDone}>
            {t.continueSetup}
          </Button>
          {failed && <Button onClick={retry}>{t.tryAgain}</Button>}
        </>
      }
    >
      <div className="flex flex-col gap-2.5 rounded-xl bg-well px-5 py-4">
        <span aria-live="polite" className="text-section">
          {failed
            ? t.preparingStopped
            : done
              ? t.isReady
              : working
                ? `${working.doing}…`
                : t.starting}
        </span>
        <div
          role="progressbar"
          aria-label={t.preparingTitle}
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
        <span className="text-meta text-muted-foreground">{t.doneOnce}</span>
      </div>
      <ul className="flex flex-col">
        {progress?.parts.map((part) => (
          <li
            key={part.id}
            className="flex items-center gap-3 border-b border-border py-2.5 text-copy last:border-b-0"
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
            <Chip tone={PART_TONE[part.state]}>
              {part.state === 'working' && (
                <LoaderCircle className="animate-spin" />
              )}
              {t.parts[part.state]}
            </Chip>
          </li>
        ))}
      </ul>
      {problem && <Problem details={problem.details}>{problem.text}</Problem>}
      <Note>{t.quitPauses}</Note>
    </StepFrame>
  )
}
