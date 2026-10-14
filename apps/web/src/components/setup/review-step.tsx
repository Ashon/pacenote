import type { SettingsView } from '@src/settings/fields'
import type { SetupRecord } from '@src/settings/setup'
import { LoaderCircle, Lock, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { useSupervisor } from '@/lib/desktop'
import type { Detected, SetupStep, useSandboxSetup } from '@/lib/setup'
import { cn } from '@/lib/utils'
import { Chip, StepFrame } from './parts'
import { SandboxLogin } from './runtime-step'

const SERVICE = { claude: 'Claude', codex: 'ChatGPT' } as const

/**
 * 4. Who may ask and what Pace may use, once more before it starts: these
 * shape what it can reach, so they are confirmed together. Starting waits for
 * the built-in sandbox, if it is still being prepared.
 */
export function ReviewStep({
  record,
  settings,
  detected,
  sandbox,
  onChange,
  onStarted,
}: {
  record: SetupRecord
  settings: { view?: SettingsView; refresh: () => void }
  detected?: Detected
  sandbox: ReturnType<typeof useSandboxSetup>
  onChange: (step: SetupStep) => void
  /** Pace started; since: when you chose to start it */
  onStarted: (since: string) => void
}) {
  const values = settings.view?.values
  const backend = values?.REASONER === 'codex' ? 'codex' : 'claude'
  const vm = values?.REASONER_SANDBOX === 'vm'
  const [diagrams, setDiagrams] = useState<boolean>()
  const diagramsOn = vm && (diagrams ?? values?.RENDER_DIAGRAMS !== 'off')
  const supervisor = useSupervisor()
  const [starting, setStarting] = useState<
    'idle' | 'saving' | 'waiting' | 'starting' | { error: string }
  >('idle')
  const percent = Math.round((sandbox.progress?.fraction ?? 0) * 100)
  const startedAt = useRef<number>(undefined)

  // Waiting for the sandbox: start Pace once it is ready.
  useEffect(() => {
    if (starting !== 'waiting') return
    if (vm && sandbox.job?.state === 'failed')
      setStarting({
        error:
          'Preparing the built-in sandbox failed. Go back to Where it runs to try again.',
      })
    else if (!vm || sandbox.ready || sandbox.job?.state === 'succeeded') {
      setStarting('starting')
      void window.pacenoteDesktop?.bot.start()
    }
  }, [starting, vm, sandbox.ready, sandbox.job?.state])
  // Started: on to the first answer, or what stopped it.
  useEffect(() => {
    if (starting !== 'starting' || !supervisor) return
    if (supervisor.phase === 'running')
      onStarted(new Date(startedAt.current ?? Date.now()).toISOString())
    else if (
      (supervisor.phase === 'setup' ||
        supervisor.phase === 'failed' ||
        supervisor.phase === 'crashed') &&
      Date.now() - (startedAt.current ?? 0) > 500
    )
      setStarting({ error: supervisor.message ?? 'Pace did not start.' })
  }, [starting, supervisor, onStarted])

  // The diagrams setting is saved before Pace starts, so it reads it.
  const start = async () => {
    startedAt.current = Date.now()
    setStarting('saving')
    await window.pacenoteDesktop?.settings.save({
      RENDER_DIAGRAMS: diagramsOn || !vm ? null : 'off',
    })
    settings.refresh()
    if (vm && !sandbox.ready && !sandbox.preparing) sandbox.run('vm')
    setStarting('waiting')
  }

  const busy =
    starting === 'saving' || starting === 'waiting' || starting === 'starting'
  const waitingForSandbox =
    vm && !sandbox.ready && sandbox.job?.state !== 'succeeded'
  const cli = detected?.cli[backend]
  // claude in the sandbox answers with a login of its own, asked for here at
  // the latest
  const needsLogin =
    vm &&
    backend === 'claude' &&
    !settings.view?.secrets.SANDBOX_CLAUDE_OAUTH_TOKEN?.set
  return (
    <StepFrame
      step="review"
      title="Review and start Pace"
      lead="Check who can ask and what Pace can use. Everything here can be changed later in Settings."
      footer={
        <>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onChange('slack')}
          >
            Back
          </Button>
          <span className="flex-1" />
          {typeof starting === 'object' && (
            <p className="flex min-w-0 items-center gap-1.5 text-body text-status-failed">
              <TriangleAlert className="size-4 shrink-0" />
              <span className="truncate" title={starting.error}>
                {starting.error}
              </span>
            </p>
          )}
          <Button onClick={() => void start()} disabled={busy || needsLogin}>
            {busy && <LoaderCircle className="animate-spin" />}
            {starting === 'waiting' && waitingForSandbox
              ? `Waiting for the sandbox, ${percent}%`
              : busy
                ? 'Starting Pace'
                : waitingForSandbox
                  ? 'Start Pace when ready'
                  : 'Start Pace'}
          </Button>
        </>
      }
    >
      {needsLogin && <SandboxLogin set={false} onSaved={settings.refresh} />}
      <section className="flex flex-col gap-2.5 rounded-2xl bg-well px-5 py-4">
        <b className="text-sm font-semibold">Who can ask Pace</b>
        <span className="flex flex-wrap items-center gap-2">
          {record.me ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm ring-1 ring-border">
              You
              <span className="text-body text-muted-foreground">
                @{record.me.name}
              </span>
            </span>
          ) : (
            <span className="text-body text-muted-foreground">
              {values?.MENTION_ALLOWED_USERS || 'Anyone in your workspace'}
            </span>
          )}
          <span className="text-body text-muted-foreground">
            Let more people ask later in Settings.
          </span>
        </span>
        <span className="flex items-center gap-2 text-body text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          Pace answers only in public channels. Private channels and direct
          messages are refused.
        </span>
      </section>

      <dl className="flex flex-col rounded-2xl ring-1 ring-border">
        <Row label="AI service" onChange={() => onChange('ai')}>
          {SERVICE[backend]}
          {cli && (cli.signedIn ? ', signed in' : ', not signed in')}
        </Row>
        <Row label="Runs in" onChange={() => onChange('runtime')}>
          {vm ? (
            <>
              Built-in sandbox
              {sandbox.ready || sandbox.job?.state === 'succeeded' ? (
                <Chip tone="ok" className="ml-2">
                  Ready
                </Chip>
              ) : sandbox.preparing ? (
                <Chip tone="working" className="ml-2">
                  Preparing, {percent}%
                </Chip>
              ) : null}
            </>
          ) : (
            <>
              This Mac
              <Chip tone="warn" className="ml-2">
                No isolation
              </Chip>
            </>
          )}
        </Row>
        <Row label="Slack" onChange={() => onChange('slack')}>
          {record.slack === 'hub' || values?.SLACK_CONNECTION === 'hub'
            ? `Through the hub at ${values?.HUB_URL ?? ''}`
            : 'Your own Slack app'}
        </Row>
        <Row label="Diagrams">
          <span className="flex flex-1 items-center gap-3">
            <span className={cn('flex-1', !vm && 'text-muted-foreground')}>
              {vm
                ? 'Mermaid and chart blocks in answers become images, made in the sandbox'
                : 'Need the built-in sandbox; they stay as text'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={diagramsOn}
              aria-label="Diagrams"
              disabled={!vm}
              onClick={() => setDiagrams(!diagramsOn)}
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
                diagramsOn ? 'bg-primary' : 'bg-input'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
                  diagramsOn && 'translate-x-4'
                )}
              />
            </button>
          </span>
        </Row>
        <Row label="Ops tools">
          <span className="text-muted-foreground">
            Off. GitHub, Jira, Kubernetes and SSH are in Settings when you need
            them.
          </span>
        </Row>
        <Row label="Run history">
          <span className="text-muted-foreground">
            Kept on this Mac, in {settings.view?.dataDir ?? '~/.pacenote'}
          </span>
        </Row>
      </dl>
    </StepFrame>
  )
}

function Row({
  label,
  onChange,
  children,
}: {
  label: string
  onChange?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-12 items-center gap-4 border-b border-border px-5 py-2.5 text-sm last:border-b-0">
      <dt className="w-28 shrink-0 font-semibold text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center">{children}</dd>
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          className="text-body font-semibold text-primary hover:underline"
        >
          Change
        </button>
      )}
    </div>
  )
}
