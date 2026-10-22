import { ChevronRight, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { useText } from '@/lib/i18n'
import type { Detected } from '@/lib/setup'
import type { SettingsView } from '@src/settings/fields'
import type { CliCheck } from '@src/settings/setup'
import { text } from './ai-step.text'
import { ChoiceCard, Chip, CommandLine, Note, StepFrame } from './parts'

type Backend = 'claude' | 'codex'

const SERVICES: Record<
  Backend,
  {
    name: string
    command: string
    /** What signs it in, typed in Terminal */
    signIn: string
    install: string
  }
> = {
  claude: {
    name: 'Claude',
    command: 'claude',
    signIn: 'claude auth login',
    install: 'https://docs.anthropic.com/en/docs/claude-code/setup',
  },
  codex: {
    name: 'ChatGPT',
    command: 'codex',
    signIn: 'codex login',
    install: 'https://developers.openai.com/codex/cli',
  },
}

/** A CLI that can answer: installed, signed in, new enough */
const otherBackend = (backend: Backend): Backend =>
  backend === 'claude' ? 'codex' : 'claude'

const cliReady = (check: CliCheck | undefined) =>
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
  const t = useText(text)
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
      title={t.title}
      lead={t.lead}
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
            {t.checkAgain}
          </Button>
          <span className="flex-1" />
          {error ? (
            <p className="text-body text-status-failed">{error}</p>
          ) : (
            cli &&
            !choice && (
              <p className="text-body text-muted-foreground">{t.signInFirst}</p>
            )
          )}
          <Button onClick={() => void use()} disabled={!choice || saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            {choice ? t.use(SERVICES[choice].name) : t.continue}
          </Button>
        </>
      }
    >
      {!cli ? (
        <p className="flex items-center gap-2 text-copy text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t.looking}
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label={t.serviceLabel}
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
        {t.note(
          choice && SERVICES[choice].name,
          choice && cliReady(cli?.claude) && cliReady(cli?.codex)
            ? SERVICES[otherBackend(choice)].name
            : undefined
        )}
      </Note>
      <Collapsible>
        <CollapsibleTrigger className="group inline-flex items-center gap-1.5 text-body font-semibold text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
          {t.modelAndLimit}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-4 pt-3">
            <label className="flex flex-col gap-1.5 text-body font-medium">
              {t.model}
              <Input
                value={model ?? settings?.values.REASONER_MODEL ?? ''}
                placeholder={t.modelPlaceholder}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-body font-medium">
              {t.timeLimit}
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
  const t = useText(text)
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
        <span className="text-body text-muted-foreground">
          {t.plans[backend]}
        </span>
        <span className="flex-1" />
        {ready ? (
          <Chip tone="ok">{t.signedIn}</Chip>
        ) : !check.installed ? (
          <Chip tone="neutral">{t.notOnThisMac}</Chip>
        ) : check.tooOld ? (
          <Chip tone="warn">{t.tooOldChip}</Chip>
        ) : (
          <Chip tone="warn">{t.notSignedIn}</Chip>
        )}
      </span>
      <span className="text-body text-muted-foreground">
        {ready ? (
          t.found(
            <code className="rounded-sm bg-well px-1.5 font-mono text-meta">
              {service.command}
              {check.version && ` ${check.version}`}
            </code>
          )
        ) : !check.installed ? (
          <>
            {t.installThen}{' '}
            <a
              href={service.install}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              {t.howToInstall(service.command)}
            </a>
          </>
        ) : check.tooOld ? (
          t.tooOld(service.command, check.version ?? '')
        ) : (
          t.signInHint
        )}
      </span>
      {check.installed && !check.tooOld && !ready && (
        <CommandLine text={service.signIn} />
      )}
    </ChoiceCard>
  )
}
