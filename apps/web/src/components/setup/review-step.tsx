import type { SettingsView } from '@src/settings/fields'
import { stepToFix, type SetupRecord } from '@src/settings/setup'
import type { SupervisorState } from '@src/runtime/types'
import { LoaderCircle, Lock } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { useSupervisor } from '@/lib/desktop'
import { useText } from '@/lib/i18n'
import {
  allowedIds,
  stepLabel,
  type Detected,
  type SetupStep,
  type useSandboxSetup,
} from '@/lib/setup'
import { cn } from '@/lib/utils'
import { Chip, Problem, StepFrame } from './parts'
import { text } from './review-step.text'
import { preparingProblem, SandboxLogin } from './runtime-step'

const SERVICE = { claude: 'Claude', codex: 'ChatGPT' } as const

/** What stopped Pace from starting, and the step that fixes it */
type Stopped = { error: string; step?: SetupStep; part?: string }

type Starting = 'idle' | 'saving' | 'waiting' | 'starting' | Stopped

/**
 * 4. Who Pace answers and what it may use, once more before it starts: these
 * shape what it can reach, so they are confirmed together. Starting waits for
 * the built-in sandbox, if it is still being prepared, and says what stopped
 * it, with the way to fix it, when it does not start.
 */
export function ReviewStep({
  record,
  settings,
  detected,
  sandbox,
  onChange,
  onStarted,
  onBusy,
}: {
  record: SetupRecord
  settings: { view?: SettingsView; refresh: () => void }
  detected?: Detected
  sandbox: ReturnType<typeof useSandboxSetup>
  onChange: (step: SetupStep, part?: string) => void
  /** Pace started; since: when you chose to start it */
  onStarted: (since: string) => void
  /** Starting or not: the other steps wait meanwhile */
  onBusy: (busy: boolean) => void
}) {
  const t = useText(text)
  const values = settings.view?.values
  const backend = values?.REASONER === 'codex' ? 'codex' : 'claude'
  const vm = values?.REASONER_SANDBOX === 'vm'
  const hub = values?.SLACK_CONNECTION === 'hub'
  const [diagrams, setDiagrams] = useState<boolean>()
  const diagramsOn = vm && (diagrams ?? values?.RENDER_DIAGRAMS !== 'off')
  const supervisor = useSupervisor()
  const [starting, setStarting] = useState<Starting>('idle')
  const percent = Math.round((sandbox.progress?.fraction ?? 0) * 100)
  /** When Start was chosen */
  const startedAt = useRef<number>(undefined)
  /** Start set the sandbox preparing again, so only that job's end counts */
  const kicked = useRef(false)
  /** Pace's state once asked to start: anything older is passed over */
  const launched = useRef<SupervisorState | null>(undefined)

  const busy =
    starting === 'saving' || starting === 'waiting' || starting === 'starting'
  useEffect(() => onBusy(busy), [busy, onBusy])
  useEffect(() => () => onBusy(false), [onBusy])

  // Starts Pace, or starts it again so it reads what setup saved.
  const launch = async () => {
    setStarting('starting')
    const bot = window.pacenoteDesktop?.bot
    const now = await bot?.state()
    if (now?.phase === 'external') return setStarting({ error: t.elsewhere })
    if (now?.phase === 'running' || now?.phase === 'starting')
      await bot?.restart()
    else await bot?.start()
    const after = (await bot?.state()) ?? null
    launched.current = after
    settle(after)
  }
  const settle = (state: SupervisorState | null) => {
    if (!state) return
    if (state.phase === 'running')
      onStarted(new Date(startedAt.current ?? Date.now()).toISOString())
    else if (
      state.phase === 'setup' ||
      state.phase === 'failed' ||
      state.phase === 'crashed' ||
      state.phase === 'idle' ||
      state.phase === 'external'
    ) {
      const message =
        state.phase === 'external'
          ? t.elsewhere
          : state.phase === 'idle' || !state.message
            ? t.didNotStart
            : state.message
      const step = stepToFix(state.issues, state.message)
      const allowlist = state.issues?.some(
        (issue) => issue.key === 'MENTION_ALLOWED_USERS'
      )
      setStarting({
        error: message,
        step,
        ...(allowlist && !hub ? { part: 'me' } : {}),
      })
    }
  }

  // Waiting for the sandbox: start Pace once it is ready.
  useEffect(() => {
    if (starting !== 'waiting') return
    const job = sandbox.job
    const fresh = Boolean(
      job &&
      (!kicked.current || Date.parse(job.startedAt) >= (startedAt.current ?? 0))
    )
    if (vm && kicked.current && sandbox.error?.kind === 'vm')
      setStarting({
        error: t.sandboxCouldNotStart(sandbox.error.message),
        step: 'runtime',
      })
    else if (vm && fresh && job?.state === 'failed')
      setStarting({ error: t.sandboxStopped, step: 'runtime' })
    else if (!vm || sandbox.ready || (fresh && job?.state === 'succeeded'))
      void launch()
  }, [starting, vm, sandbox.ready, sandbox.job, sandbox.error])
  // Started: on to the first answer, or what stopped it. The state Pace was
  // in as it was asked to start is news already settled.
  useEffect(() => {
    if (starting !== 'starting' || launched.current === undefined) return
    if (!supervisor || supervisor === launched.current) return
    if (supervisor.phase === 'starting' || supervisor.phase === 'stopping')
      return
    settle(supervisor)
  }, [starting, supervisor])

  // The diagrams setting is saved before Pace starts, so it reads it.
  const start = async () => {
    startedAt.current = Date.now()
    launched.current = undefined
    kicked.current = false
    setStarting('saving')
    await window.pacenoteDesktop?.settings.save({
      RENDER_DIAGRAMS: diagramsOn || !vm ? null : 'off',
    })
    settings.refresh()
    if (vm && !sandbox.ready && !sandbox.preparing) {
      kicked.current = true
      sandbox.run('vm')
    }
    setStarting('waiting')
  }

  const waitingForSandbox =
    vm && !sandbox.ready && sandbox.job?.state !== 'succeeded'
  const background = vm && !busy ? preparingProblem(sandbox) : undefined
  const cli = detected?.cli[backend]
  // claude in the sandbox answers with a login of its own, asked for here at
  // the latest
  const needsLogin =
    vm &&
    !sandbox.status?.signedIn &&
    !(
      backend === 'claude' &&
      (settings.view?.secrets.SANDBOX_CLAUDE_OAUTH_TOKEN?.set ||
        settings.view?.secrets.SANDBOX_ANTHROPIC_API_KEY?.set)
    )
  // Pace answers only you: your own app, once it knows who you are (one
  // member ID; a list from before Pace answered only you is not you yet).
  const allowed = allowedIds(values?.MENTION_ALLOWED_USERS)
  const owner = !hub && allowed.length === 1 ? allowed[0] : undefined
  const unknown = !hub && !owner
  const blocked = needsLogin
    ? t.signInFirst(backend === 'codex' ? 'Codex' : 'Claude')
    : unknown
      ? t.sayWhoFirst
      : undefined
  const stopped = typeof starting === 'object' ? starting : undefined
  /** A row's way back to its step, while nothing is starting */
  const change = (step: SetupStep) => (busy ? undefined : () => onChange(step))

  return (
    <StepFrame
      step="review"
      title={t.title}
      lead={t.lead}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onChange('slack')}
          >
            {t.back}
          </Button>
          <span className="flex-1" />
          {blocked && !busy && (
            <p className="text-body text-muted-foreground">{blocked}</p>
          )}
          <Button
            onClick={() => void start()}
            disabled={busy || Boolean(blocked)}
          >
            {busy && <LoaderCircle className="animate-spin" />}
            {starting === 'waiting' && waitingForSandbox
              ? t.waitingForSandbox(percent)
              : busy
                ? t.startingPace
                : stopped
                  ? t.tryAgain
                  : waitingForSandbox
                    ? t.startOnceReady
                    : t.start}
          </Button>
        </>
      }
    >
      {stopped && (
        <Problem
          action={
            stopped.step && (
              <Button
                variant="outline"
                onClick={() => onChange(stopped.step!, stopped.part)}
              >
                {t.changeStep(stepLabel(stopped.step))}
              </Button>
            )
          }
        >
          {stopped.error}
        </Problem>
      )}
      {background && (
        <Problem
          details={background.details}
          action={
            <Button variant="outline" onClick={() => sandbox.run('vm')}>
              {t.tryAgain}
            </Button>
          }
        >
          {background.text}
        </Problem>
      )}
      {needsLogin && (
        <SandboxLogin
          cli={backend}
          signedIn={false}
          ready={sandbox.ready}
          onSignedIn={() => {
            sandbox.refresh()
            settings.refresh()
          }}
          required
        />
      )}
      {record.fromMac && (
        <section
          className="flex flex-col gap-1.5 rounded-xl bg-well px-5 py-4"
          data-from-mac-review
        >
          <b className="text-section">{t.fromMac(record.fromMac.name)}</b>
          <span className="text-body text-muted-foreground">
            {t.fromMacWhat}
          </span>
          <span className="text-meta text-muted-foreground">
            {t.fromMacFollows}
          </span>
        </section>
      )}
      <section className="flex flex-col gap-2.5 rounded-xl bg-well px-5 py-4">
        <b className="text-section">{t.whoCanAsk}</b>
        <span className="flex flex-wrap items-center gap-2">
          {unknown ? (
            <span className="text-body text-status-failed">
              {allowed.length > 1 ? t.moreThanOne : t.unknown}{' '}
              <button
                type="button"
                disabled={busy}
                onClick={() => onChange('slack', 'me')}
                className="font-semibold text-primary hover:underline"
              >
                {t.showItsYou}
              </button>
            </span>
          ) : (
            <>
              <Person
                name={
                  hub || owner === record.me?.id ? record.me?.name : undefined
                }
                id={hub ? undefined : owner}
              />
              <span className="text-body text-muted-foreground">
                {t.onlyYou}
              </span>
            </>
          )}
        </span>
        <span className="flex items-center gap-2 text-body text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          {t.publicOnly}
        </span>
      </section>

      <dl className="flex flex-col rounded-xl ring-1 ring-border">
        <Row label={t.aiService} onChange={change('ai')}>
          {t.serviceState(SERVICE[backend], cli?.signedIn)}
        </Row>
        <Row label={t.runsIn} onChange={change('runtime')}>
          {vm ? (
            <>
              {t.sandbox}
              {sandbox.ready || sandbox.job?.state === 'succeeded' ? (
                <Chip tone="ok" className="ml-2">
                  {t.ready}
                </Chip>
              ) : sandbox.preparing ? (
                <Chip tone="working" className="ml-2">
                  {t.preparing(percent)}
                </Chip>
              ) : background ? (
                <Chip tone="failed" className="ml-2">
                  {t.stopped}
                </Chip>
              ) : null}
            </>
          ) : (
            <>
              {t.thisMac}
              <Chip tone="warn" className="ml-2">
                {t.noIsolation}
              </Chip>
            </>
          )}
        </Row>
        <Row label="Slack" onChange={change('slack')}>
          {hub ? t.throughHub(values?.HUB_URL ?? '') : t.ownApp}
        </Row>
        {vm && (
          <Row label={t.diagrams}>
            <span className="flex flex-1 items-center gap-3">
              <span className="flex-1">{t.diagramsWhat}</span>
              <button
                type="button"
                role="switch"
                aria-checked={diagramsOn}
                aria-label={t.diagrams}
                disabled={busy}
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
        )}
        <Row label={t.opsTools}>
          <span className="text-muted-foreground">{t.opsOff}</span>
        </Row>
        <Row label={t.runHistory}>
          <span className="text-muted-foreground">
            {t.keptIn(
              <PathText
                path={homePath(settings.view?.dataDir ?? '~/.pacenote')}
              />
            )}
          </span>
        </Row>
      </dl>
    </StepFrame>
  )
}

/** A path that breaks after its slashes, not inside a folder's name */
function PathText({ path }: { path: string }) {
  return (
    <span>
      {path.split('/').map((part, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <>
              /<wbr />
            </>
          )}
          {part}
        </Fragment>
      ))}
    </span>
  )
}

/** A folder in your home as you would type it: ~/.pacenote */
const homePath = (dir: string) => dir.replace(/^\/Users\/[^/]+(?=\/|$)/, '~')

/** You, the one who may ask: by the name Slack showed, or your member ID */
function Person({ name, id }: { name?: string; id?: string }) {
  const t = useText(text)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-copy ring-1 ring-border">
      {t.you}
      {name ? (
        <span className="text-body text-muted-foreground">@{name}</span>
      ) : (
        id && (
          <span className="font-mono text-meta text-muted-foreground">
            {id}
          </span>
        )
      )}
    </span>
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
  const t = useText(text)
  return (
    <div className="flex min-h-12 items-center gap-4 border-b border-border px-5 py-2.5 text-copy last:border-b-0">
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
          {t.change}
        </button>
      )}
    </div>
  )
}
