import { localized } from '@src/i18n/locale'
import { todoFirstRun } from '@src/settings/setup'
import { CLI_NAMES, isOwnCli } from '@src/tasks/own-ai'
import { text as sourcesText } from '@src/tasks/sources.text'
import { LoaderCircle, MessageSquare, MonitorSmartphone, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AI_STEPS,
  type AiSheetStart,
  closeAiSheet,
  type Found,
  lastReached,
  REACHED_KEY,
  useAiSheet,
} from '@/lib/ai-sheet'
import { useText } from '@/lib/i18n'
import { writeStored } from '@/lib/storage'
import { useDetect, useFromMac, useSettingsView, useSetup } from '@/lib/setup'
import { useCollect, useTasks } from '@/lib/tasks'
import { cn, go } from '@/lib/utils'
import { useYou } from '@/lib/you'
import { AiStep } from './ai-step'
import { text } from './first-run.text'
import { FromMacBody } from './from-mac'
import { Note, StepFrame } from './parts'

type Step = (typeof AI_STEPS)[number]

/**
 * Let your AI help (the task-first canvas's "처음 시작", O2): a sheet over the
 * window's right side with the three steps a new install's first run took
 * the whole window for, your AI, where your work is, and a first look at what
 * is asked of you. Todo's start card opens it, and so does every place an AI
 * would help before one is set up (Find tasks with AI, Recap's Set up AI).
 * It ends on Todo, which says what the look added; Pace stays off until it
 * is set up from the start card or Settings.
 */
export function AiSheet() {
  const t = useText(text)
  const { open } = useAiSheet()
  // Closing, it keeps what it showed while it slides out
  const shown = useRef<AiSheetStart>('ai')
  if (open) shown.current = open
  return (
    <Dialog
      open={Boolean(open)}
      onOpenChange={(next) => {
        if (!next) closeAiSheet()
      }}
    >
      <DialogContent
        variant="sheet"
        aria-describedby={undefined}
        className="w-[min(40rem,calc(100vw-1rem))]"
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border pr-2 pl-6">
          <DialogTitle className="text-body font-semibold">
            {t.sheetTitle}
          </DialogTitle>
          <span className="flex-1" />
          <DialogClose asChild>
            <Button size="icon-sm" variant="ghost" aria-label={t.close}>
              <X />
            </Button>
          </DialogClose>
        </header>
        <div className="min-h-0 flex-1">
          <SheetSteps start={shown.current} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The steps, from where they were left, or your other Mac's at once */
function SheetSteps({ start }: { start: AiSheetStart }) {
  const t = useText(text)
  const setup = useSetup()
  const detect = useDetect()
  const settings = useSettingsView()
  const [reached, setReached] = useState(lastReached)
  const [step, setStep] = useState<Step>(
    start === 'mac' ? 'sources' : AI_STEPS[reached]!
  )
  const goTo = (next: Step) => {
    const furthest = Math.max(reached, AI_STEPS.indexOf(next))
    setStep(next)
    setReached(furthest)
    writeStored(REACHED_KEY, String(furthest))
    settings.refresh()
  }
  const chosen = settings.view?.values.TASKS_AI
  const cli = isOwnCli(chosen) ? chosen : 'claude'
  // A first run ends here (the start card goes); Pace's setup is its own.
  const finish = async (found?: Found) => {
    writeStored(REACHED_KEY, '0')
    if (setup.view && todoFirstRun(setup.view))
      await setup.save({ finished: true })
    closeAiSheet(found)
    go('#/tasks')
  }

  if (start === 'mac')
    return (
      <SourcesStep
        cli={cli}
        fromMacFirst
        onDone={async () => {}}
        onFromMac={() => void finish()}
      />
    )
  return step === 'ai' ? (
    <AiStep
      detect={detect}
      settings={settings.view}
      of={[1, 3]}
      lead={t.aiLead}
      onDone={() => goTo('sources')}
    />
  ) : step === 'sources' ? (
    <SourcesStep
      cli={cli}
      onDone={async () => {
        // Todo on, written down, so it goes to your other Macs too
        await window.pacenoteDesktop?.settings.save({ TASKS: 'on' })
        goTo('look')
      }}
      // Paired with your other Mac: Todo came on with what it sent, and
      // your tasks follow from there, so no first look is needed
      onFromMac={() => void finish()}
    />
  ) : (
    <LookStep cli={cli} onDone={(found) => void finish(found)} />
  )
}

/**
 * 2. Where your work is: Slack through your AI's connector, and this Mac; or
 * your other Mac, which sends how Todo collects and pairs with this one
 */
function SourcesStep({
  cli,
  fromMacFirst = false,
  onDone,
  onFromMac,
}: {
  cli: 'claude' | 'codex' | 'opencode'
  /** Opened for your other Mac (the start card's): that alone, no step */
  fromMacFirst?: boolean
  onDone: () => Promise<void>
  onFromMac: () => void
}) {
  const t = useText(text)
  const [saving, setSaving] = useState(false)
  const [fromMac, setFromMac] = useState(fromMacFirst)
  const mac = useFromMac('todo')
  // Opened for it, it looks for your other Mac at once
  useEffect(() => {
    if (fromMacFirst) void window.pacenoteDesktop?.setup?.macLook('todo')
  }, [fromMacFirst])
  // Leaving the step lets your other Mac go
  useEffect(() => () => void window.pacenoteDesktop?.setup?.macCancel(), [])
  // opencode collects through Claude Code or Codex (src/tasks/own-ai.ts)
  const reader = cli === 'codex' ? 'codex' : 'claude'
  const where = localized(sourcesText).slackWhere[reader]
  const paired = fromMac && mac.state.step === 'copied'
  return (
    <StepFrame
      step="slack"
      of={fromMacFirst ? null : [2, 3]}
      title={fromMac ? t.fromMac : t.sourcesTitle}
      lead={fromMac ? t.fromMacLead : t.sourcesLead}
      footer={
        <>
          {fromMacFirst ? (
            <DialogClose asChild>
              <Button variant="ghost">{t.cancel}</Button>
            </DialogClose>
          ) : (
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
          )}
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
  /** With what the look added, when it ran and found */
  onDone: (found?: Found) => void
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
          <Button
            disabled={Boolean(running)}
            onClick={() =>
              onDone(
                last?.ok
                  ? {
                      by: CLI_NAMES[last.by ?? cli],
                      added: last.added,
                      maybe: last.maybe,
                    }
                  : undefined
              )
            }
          >
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
