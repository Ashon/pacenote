import { ChevronRight, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import type { Detected } from '@/lib/setup'
import type { SettingsView } from '@src/settings/fields'
import type { CliCheck } from '@src/settings/setup'
import { ChoiceCard, Chip, CommandLine, Note, StepFrame } from './parts'

type Backend = 'claude' | 'codex'

const SERVICES: Record<
  Backend,
  {
    name: string
    plans: string
    command: string
    /** What signs it in, typed in Terminal */
    signIn: string
    install: string
  }
> = {
  claude: {
    name: 'Claude',
    plans: 'Pro, Max, Team or Enterprise',
    command: 'claude',
    signIn: 'claude auth login',
    install: 'https://docs.anthropic.com/en/docs/claude-code/setup',
  },
  codex: {
    name: 'ChatGPT',
    plans: 'Plus, Pro or Business, through Codex',
    command: 'codex',
    signIn: 'codex login',
    install: 'https://developers.openai.com/codex/cli',
  },
}

/** A CLI that can answer: installed, signed in, new enough */
const otherBackend = (backend: Backend): Backend =>
  backend === 'claude' ? 'codex' : 'claude'

export const cliReady = (check: CliCheck | undefined) =>
  Boolean(check?.installed && check.signedIn && !check.tooOld)

/**
 * 1. Which AI service Pace answers with: the CLIs found on this Mac, signed in
 * or not, checked before anything else so Slack is not set up for nothing
 */
export function AiStep({
  detect,
  settings,
  onDone,
}: {
  detect: { detected?: Detected; checking: boolean; check: () => void }
  settings?: SettingsView
  onDone: () => void
}) {
  const cli = detect.detected?.cli
  const saved = settings?.values.REASONER as Backend | undefined
  const [chosen, setChosen] = useState<Backend>()
  const choice: Backend | undefined =
    chosen ??
    (saved && cliReady(cli?.[saved])
      ? saved
      : cliReady(cli?.claude)
        ? 'claude'
        : cliReady(cli?.codex)
          ? 'codex'
          : undefined)
  const [model, setModel] = useState<string>()
  const [timeout, setTimeoutSec] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  // Installed or signed in from Terminal meanwhile: looked for again on
  // coming back to the window, without a click.
  const missing = Boolean(cli && !(cliReady(cli.claude) && cliReady(cli.codex)))
  const { check } = detect
  useEffect(() => {
    if (!missing) return
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [missing, check])

  const use = async () => {
    if (!choice) return
    setSaving(true)
    setError(undefined)
    const result = await window.pacenoteDesktop?.settings.save({
      REASONER: choice,
      // Pacenote's own work (Todo, Recap) runs with the same one at first.
      TASKS_AI: choice,
      ...(model !== undefined ? { REASONER_MODEL: model || null } : {}),
      ...(timeout !== undefined
        ? { REASONER_TIMEOUT_SEC: timeout || null }
        : {}),
    })
    setSaving(false)
    if (result?.issues.length)
      return setError(result.issues.map((issue) => issue.message).join(' '))
    onDone()
  }

  return (
    <StepFrame
      step="ai"
      title="Which AI service do you already use?"
      lead="Pace answers with your own subscription, through that service's command-line tool. Pacenote doesn't bill you or manage the account."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={detect.check}
            disabled={detect.checking}
          >
            <RefreshCw
              className={detect.checking ? 'animate-spin' : undefined}
            />
            Check again
          </Button>
          <span className="flex-1" />
          {error ? (
            <p className="text-body text-status-failed">{error}</p>
          ) : (
            cli &&
            !choice && (
              <p className="text-body text-muted-foreground">
                Sign in to one of them first
              </p>
            )
          )}
          <Button onClick={() => void use()} disabled={!choice || saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            {choice ? `Use ${SERVICES[choice].name}` : 'Continue'}
          </Button>
        </>
      }
    >
      {!cli ? (
        <p className="flex items-center gap-2 text-copy text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Looking for Claude Code and Codex on this Mac
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="AI service"
          className="flex flex-col gap-3"
        >
          {(['claude', 'codex'] as const).map((backend) => (
            <ServiceCard
              key={backend}
              backend={backend}
              check={cli[backend]}
              checked={choice === backend}
              onChoose={() => setChosen(backend)}
            />
          ))}
        </div>
      )}
      <Note>
        Connectors and account settings stay in{' '}
        {choice ? SERVICES[choice].name : 'your AI service'}. Pacenote doesn't
        set them up or change them.
        {choice && cliReady(cli?.claude) && cliReady(cli?.codex) && (
          <>
            {' '}
            With both here, {SERVICES[otherBackend(choice)].name} takes over
            Todo and Recap when {SERVICES[choice].name} is at its limit.
          </>
        )}
      </Note>
      <Collapsible>
        <CollapsibleTrigger className="group inline-flex items-center gap-1.5 text-body font-semibold text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
          Model and time limit
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-4 pt-3">
            <label className="flex flex-col gap-1.5 text-body font-medium">
              Model
              <Input
                value={model ?? settings?.values.REASONER_MODEL ?? ''}
                placeholder="Leave empty for the default"
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-body font-medium">
              Time limit (seconds)
              <Input
                inputMode="numeric"
                value={timeout ?? settings?.values.REASONER_TIMEOUT_SEC ?? ''}
                placeholder="900"
                onChange={(e) => setTimeoutSec(e.target.value)}
              />
            </label>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </StepFrame>
  )
}

function ServiceCard({
  backend,
  check,
  checked,
  onChoose,
}: {
  backend: Backend
  check: CliCheck
  checked: boolean
  onChoose: () => void
}) {
  const service = SERVICES[backend]
  const ready = cliReady(check)
  return (
    <ChoiceCard
      name="ai"
      value={backend}
      checked={checked}
      disabled={!ready}
      onChoose={onChoose}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="text-section">{service.name}</b>
        <span className="text-body text-muted-foreground">{service.plans}</span>
        <span className="flex-1" />
        {ready ? (
          <Chip tone="ok">Signed in</Chip>
        ) : !check.installed ? (
          <Chip tone="neutral">Not on this Mac</Chip>
        ) : check.tooOld ? (
          <Chip tone="warn">Too old</Chip>
        ) : (
          <Chip tone="warn">Not signed in</Chip>
        )}
      </span>
      <span className="text-body text-muted-foreground">
        {ready ? (
          <>
            Found{' '}
            <code className="rounded-sm bg-well px-1.5 font-mono text-meta">
              {service.command}
              {check.version && ` ${check.version}`}
            </code>{' '}
            on this Mac
          </>
        ) : !check.installed ? (
          <>
            Install it, then check again.{' '}
            <a
              href={service.install}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              How to install {service.command}
            </a>
          </>
        ) : check.tooOld ? (
          `${service.command} ${check.version ?? ''} is too old for Pace. Update it, then check again.`
        ) : (
          'Sign in from Terminal with this, and Pacenote sees it when you come back.'
        )}
      </span>
      {check.installed && !check.tooOld && !ready && (
        <CommandLine text={service.signIn} />
      )}
    </ChoiceCard>
  )
}
