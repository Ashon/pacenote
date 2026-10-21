import type { SetupView } from '@src/settings/setup'
import { Button } from '@/components/ui/button'
import { useSupervisor } from '@/lib/desktop'
import { useText } from '@/lib/i18n'
import {
  SETUP_STEPS,
  stepIndex,
  stepNext,
  useSandboxSetup,
  useSettingsView,
} from '@/lib/setup'
import { cn } from '@/lib/utils'
import { PacenoteMark } from '../logo'
import { text } from './resume.text'
import { preparingProblem } from './runtime-step'

/**
 * Overview while setup is unfinished: how far it got and the way back to it,
 * or to Settings for someone who would rather set things up there
 */
export function ResumeSetup({
  view,
  onFinish,
}: {
  view: SetupView
  /** Setting it up in Settings instead: setup is over */
  onFinish: () => void
}) {
  const t = useText(text)
  const done = stepIndex(view.record.step)
  return (
    <section
      aria-labelledby="resume-setup"
      className="mt-6 flex items-center gap-5 rounded-xl bg-card-accent px-6 py-5"
    >
      <PacenoteMark className="size-10 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <b id="resume-setup" className="text-section">
          {t.title}
        </b>
        <span className="text-body text-muted-foreground">
          {t.progress(done, SETUP_STEPS.length, stepNext(view.record.step))}
        </span>
        <span aria-hidden="true" className="flex max-w-80 gap-1">
          {SETUP_STEPS.map((step, index) => (
            <span
              key={step}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                index < done ? 'bg-primary' : 'bg-primary/15'
              )}
            />
          ))}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <Button asChild>
          <a href="#/setup">{t.resume}</a>
        </Button>
        <button
          type="button"
          onClick={onFinish}
          className="text-meta font-semibold text-primary hover:underline"
        >
          {t.inSettings}
        </button>
      </span>
    </section>
  )
}

/** Where things stand while setup is unfinished, in place of the totals */
export function SetupFacts() {
  const t = useText(text)
  const supervisor = useSupervisor()
  const settings = useSettingsView()
  const sandbox = useSandboxSetup({
    renderer: settings.view?.values.RENDER_DIAGRAMS !== 'off',
  })
  // Prepared from the start, until this Mac is chosen instead
  const unsupported = sandbox.status?.vm?.unsupported
  const used = settings.view?.values.REASONER_SANDBOX !== 'none' && !unsupported
  const stopped = used && preparingProblem(sandbox) !== undefined
  const running = supervisor?.phase === 'running'
  return (
    <section
      aria-label={t.factsLabel}
      className="mt-9 grid grid-cols-1 gap-y-6 @min-[40rem]:grid-cols-3 @min-[40rem]:divide-x @min-[40rem]:divide-border"
    >
      <Fact
        label="Pace"
        value={running ? t.running : t.notRunning}
        hint={running ? t.answering : t.startsAfter}
      />
      <Fact label={t.answers} value={t.noneYet} hint={t.answersHint} />
      <Fact
        label={t.sandbox}
        value={
          !used
            ? unsupported
              ? t.notOnThisMac
              : t.notUsed
            : sandbox.ready
              ? t.ready
              : sandbox.preparing
                ? t.preparing(
                    Math.round((sandbox.progress?.fraction ?? 0) * 100)
                  )
                : stopped
                  ? t.preparingStopped
                  : t.notPrepared
        }
        hint={
          !used
            ? t.directly
            : sandbox.ready
              ? t.answersInIt
              : sandbox.preparing
                ? t.background
                : stopped
                  ? t.tryAgain
                  : t.preparesOnResume
        }
        accent={used && sandbox.preparing}
      />
    </section>
  )
}

function Fact({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 @min-[40rem]:px-6 @min-[40rem]:first:pl-0">
      <span className="text-meta font-semibold text-muted-foreground">
        {label}
      </span>
      <span className={cn('text-heading', accent && 'text-status-running')}>
        {value}
      </span>
      <span className="text-meta text-muted-foreground">{hint}</span>
    </div>
  )
}
