import { localized } from '@src/i18n/locale'
import { CLI_NAMES, isOwnCli } from '@src/tasks/own-ai'
import { text as sourcesText } from '@src/tasks/sources.text'
import {
  Check,
  LoaderCircle,
  MessageSquare,
  MonitorSmartphone,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { botControl } from '@/lib/desktop'
import { useText } from '@/lib/i18n'
import { readStored, writeStored } from '@/lib/storage'
import { useDetect, useFromMac, useSettingsView, useSetup } from '@/lib/setup'
import { useCollect, useTasks } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { useYou } from '@/lib/you'
import { PacenoteMark } from '../logo'
import { AiStep } from './ai-step'
import { text } from './first-run.text'
import { FromMacBody } from './from-mac'
import { Note, StepFrame } from './parts'

type Step = 'ai' | 'sources' | 'look'
const STEPS: Step[] = ['ai', 'sources', 'look']

/**
 * The furthest step reached, kept in this window, so the first run picks up
 * where it was when the window draws it again (a language change)
 */
const REACHED_KEY = 'pacenote.first-run.reached'

function lastReached(): number {
  const reached = Number(readStored(REACHED_KEY))
  return reached > 0 && reached < STEPS.length ? reached : 0
}

/**
 * A new install's first run (the task-first canvas, T5): your AI, where your
 * work is, and a first look at what is asked of you, with your projects. It
 * turns Todo on and ends on it, with no Slack app to make: Pace stays off
 * until you set it up, here or in Settings. It takes the whole window, as
 * Pace's setup does.
 */
export function FirstRun({ onLeave }: { onLeave: (hash: string) => void }) {
  const t = useText(text)
  const setup = useSetup()
  const detect = useDetect()
  const settings = useSettingsView()
  const [reached, setReached] = useState(lastReached)
  const [step, setStep] = useState<Step>(STEPS[reached]!)
  const isMac = window.pacenoteDesktop?.platform === 'darwin'
  const go = (next: Step) => {
    const furthest = Math.max(reached, STEPS.indexOf(next))
    setStep(next)
    setReached(furthest)
    writeStored(REACHED_KEY, String(furthest))
    settings.refresh()
  }
  const chosen = settings.view?.values.TASKS_AI
  const cli = isOwnCli(chosen) ? chosen : 'claude'
  const finish = async () => {
    writeStored(REACHED_KEY, '0')
    await setup.save({ finished: true })
    onLeave('#/tasks')
  }

  const body =
    step === 'ai' ? (
      <AiStep
        detect={detect}
        settings={settings.view}
        of={[1, 3]}
        lead={t.aiLead}
        onDone={() => go('sources')}
      />
    ) : step === 'sources' ? (
      <SourcesStep
        cli={cli}
        onDone={async () => {
          // Todo on, written down, so it goes to your other Macs too
          await window.pacenoteDesktop?.settings.save({ TASKS: 'on' })
          go('look')
        }}
        // Paired with your other Mac: Todo came on with what it sent, and
        // your tasks follow from there, so no first look is needed
        onFromMac={() => void finish()}
      />
    ) : (
      <LookStep cli={cli} onDone={() => void finish()} />
    )

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <header
        className={cn(
          'titlebar-drag grid h-12 shrink-0 place-items-center text-body font-semibold text-muted-foreground',
          isMac && 'pl-[72px]'
        )}
      >
        {t.title}
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={t.stepsLabel}
          className="flex w-56 shrink-0 flex-col px-3 pb-4"
        >
          <div className="flex h-10 items-center gap-2.5 px-2.5 pb-3">
            <PacenoteMark className="size-6 shrink-0" />
            <span className="text-heading">Pacenote</span>
          </div>
          <ol className="flex flex-col gap-0.5">
            {STEPS.map((each, index) => {
              const current = each === step
              // Done: passed on the way to the furthest step reached
              const done = !current && index < reached
              const inner = (
                <>
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full text-meta font-semibold',
                      current
                        ? 'bg-primary text-primary-foreground'
                        : index <= reached
                          ? 'bg-primary/12 text-primary'
                          : 'text-muted-foreground ring-1 ring-border'
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" strokeWidth={2.5} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {t.steps[each]}
                </>
              )
              const className = cn(
                'flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-body',
                current
                  ? 'bg-selected font-semibold text-foreground'
                  : index <= reached
                    ? 'text-foreground hover:bg-selected/50'
                    : 'text-muted-foreground'
              )
              return (
                <li key={each}>
                  {current ? (
                    <span aria-current="step" className={className}>
                      {inner}
                    </span>
                  ) : index <= reached ? (
                    <button
                      type="button"
                      className={className}
                      onClick={() => go(each)}
                    >
                      {inner}
                    </button>
                  ) : (
                    <span className={className}>{inner}</span>
                  )}
                </li>
              )
            })}
          </ol>
          <span className="flex-1" />
          <div className="flex flex-col gap-1 px-2.5">
            <span className="text-body font-semibold">{t.pace}</span>
            <span className="text-meta text-muted-foreground">{t.paceHow}</span>
            <button
              type="button"
              onClick={() =>
                void botControl()
                  ?.setUp()
                  .then(() => onLeave('#/setup'))
              }
              className="mt-1 self-start text-body font-semibold text-primary hover:underline"
            >
              {t.setUpPace}
            </button>
          </div>
        </nav>
        <main
          className="content-surface mr-3 mb-3 min-w-0 flex-1 overflow-hidden rounded-[20px] bg-card"
          style={{ boxShadow: 'var(--card-shadow)' }}
        >
          {body}
        </main>
      </div>
    </div>
  )
}

/**
 * 2. Where your work is: Slack through your AI's connector, and this Mac; or
 * your other Mac, which sends how Todo collects and pairs with this one
 */
function SourcesStep({
  cli,
  onDone,
  onFromMac,
}: {
  cli: 'claude' | 'codex' | 'opencode'
  onDone: () => Promise<void>
  onFromMac: () => void
}) {
  const t = useText(text)
  const [saving, setSaving] = useState(false)
  const [fromMac, setFromMac] = useState(false)
  const mac = useFromMac('todo')
  // Leaving the step lets your other Mac go
  useEffect(() => () => void window.pacenoteDesktop?.setup?.macCancel(), [])
  // opencode collects through Claude Code or Codex (src/tasks/own-ai.ts)
  const reader = cli === 'codex' ? 'codex' : 'claude'
  const where = localized(sourcesText).slackWhere[reader]
  const paired = fromMac && mac.state.step === 'copied'
  return (
    <StepFrame
      step="slack"
      of={[2, 3]}
      title={fromMac ? t.fromMac : t.sourcesTitle}
      lead={fromMac ? t.fromMacLead : t.sourcesLead}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              if (fromMac) mac.cancel()
              else mac.look()
              setFromMac(!fromMac)
            }}
          >
            {fromMac ? t.cancel : t.fromMac}
          </Button>
          <span className="flex-1" />
          {paired ? (
            <Button onClick={onFromMac}>{t.openTodo}</Button>
          ) : fromMac ? null : (
            <Button
              disabled={saving}
              onClick={() => {
                setSaving(true)
                void onDone().finally(() => setSaving(false))
              }}
            >
              {saving && <LoaderCircle className="animate-spin" />}
              {t.continue}
            </Button>
          )}
        </>
      }
    >
      {/* This Mac first: your own work is the ground, and Slack one source
          read through your AI's connector. Your other Mac instead: what it
          sends takes the step. */}
      <Collapsible open={!fromMac}>
        <CollapsibleContent className="flex flex-col gap-4">
          <ul className="flex flex-col divide-y divide-border rounded-xl bg-well">
            <li className="flex items-start gap-3 px-4 py-3">
              <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-row">{t.thisMac}</p>
                <p className="text-meta text-muted-foreground">
                  {t.thisMacHow}
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 px-4 py-3">
              <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-row">{t.slack}</p>
                <p className="text-meta text-muted-foreground">
                  {t.slackHow(CLI_NAMES[reader])}
                </p>
              </div>
            </li>
          </ul>
          <Note>{t.slackConnect(where)}</Note>
        </CollapsibleContent>
      </Collapsible>
      <Collapsible open={fromMac}>
        <CollapsibleContent>
          <FromMacBody
            mac={mac}
            took={<p className="text-body">{t.fromMacTook}</p>}
          />
        </CollapsibleContent>
      </Collapsible>
    </StepFrame>
  )
}

/**
 * 3. A first look: a collection of the last 7 days, what it added, and the
 * projects your work makes
 */
function LookStep({
  cli,
  onDone,
}: {
  cli: 'claude' | 'codex' | 'opencode'
  onDone: () => void
}) {
  const t = useText(text)
  const tasks = useTasks().data
  const { collect } = useCollect()
  const you = useYou().data
  const [asked, setAsked] = useState(false)
  const running = tasks?.collect.running
  const last = asked && !running ? tasks?.collect.last : undefined
  // No Slack connector yet: no failure, this Mac's own work is the look
  const quiet = last && !last.ok && last.unable === 'connector'
  const reader = cli === 'codex' ? 'codex' : 'claude'
  const where = localized(sourcesText).slackWhere[reader]
  const areas = you?.areas ?? []
  return (
    <StepFrame
      step="review"
      of={[3, 3]}
      title={t.lookTitle}
      lead={t.lookLead(CLI_NAMES[cli])}
      footer={
        <>
          {!asked && (
            <Button
              variant="outline"
              onClick={() => {
                setAsked(true)
                void collect()
              }}
            >
              {t.collect}
            </Button>
          )}
          {last && !last.ok && (
            <Button variant="outline" onClick={() => void collect()}>
              {t.tryAgain}
            </Button>
          )}
          <span className="flex-1" />
          <Button disabled={Boolean(running)} onClick={onDone}>
            {last?.ok ? t.looksRight : t.openTodo}
          </Button>
        </>
      }
    >
      {running && (
        <p
          role="status"
          className="flex items-center gap-2 text-copy text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" />
          {t.reading(running.reads)}
        </p>
      )}
      {last && (
        <p
          role={last.ok || quiet ? 'status' : 'alert'}
          className={cn(
            'text-copy',
            !last.ok && !quiet && 'text-status-failed'
          )}
        >
          {last.ok
            ? t.found(last.added, last.maybe)
            : quiet
              ? t.noConnector(CLI_NAMES[reader], where)
              : last.error}
        </p>
      )}
      {(last?.ok || quiet) && (
        <section
          aria-label={t.projects}
          className="rounded-xl bg-well px-4 py-3"
        >
          <p className="text-row">{t.projects}</p>
          <p className="text-meta text-muted-foreground">{t.projectsHow}</p>
          {areas.length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {areas.map((area) => (
                <li key={area.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-semibold">{area.name}</span>
                  <span className="font-mono text-meta text-muted-foreground">
                    {area.parts.map((part) => part.label).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-body text-muted-foreground">
              {t.noProjects}
            </p>
          )}
        </section>
      )}
    </StepFrame>
  )
}
