import type { SetupView } from '@src/settings/setup'
import { Button } from '@/components/ui/button'
import { useSupervisor } from '@/lib/desktop'
import {
  SETUP_STEPS,
  STEP_NEXT,
  stepIndex,
  useSandboxSetup,
  useSettingsView,
} from '@/lib/setup'
import { cn } from '@/lib/utils'
import { PacenoteMark } from '../logo'
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
  const done = stepIndex(view.record.step)
  return (
    <section
      aria-labelledby="resume-setup"
      className="mt-6 flex items-center gap-5 rounded-2xl bg-card-accent px-6 py-5"
    >
      <PacenoteMark className="size-10 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <b id="resume-setup" className="text-sm font-semibold">
          Finish setting up Pace
        </b>
        <span className="text-body text-muted-foreground">
          {done} of {SETUP_STEPS.length} steps done. Next:{' '}
          {STEP_NEXT[view.record.step]}.
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
          <a href="#/setup">Resume setup</a>
        </Button>
        <button
          type="button"
          onClick={onFinish}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Set it up in Settings instead
        </button>
      </span>
    </section>
  )
}

/** Where things stand while setup is unfinished, in place of the totals */
export function SetupFacts() {
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
      aria-label="Where setup stands"
      className="mt-9 grid grid-cols-1 gap-y-6 @min-[40rem]:grid-cols-3 @min-[40rem]:divide-x @min-[40rem]:divide-border"
    >
      <Fact
        label="Pace"
        value={running ? 'Running' : 'Not running yet'}
        hint={running ? 'Answering mentions' : 'Starts when setup finishes'}
      />
      <Fact
        label="Answers"
        value="None yet"
        hint="Each answer and its steps show up in Runs"
      />
      <Fact
        label="Built-in sandbox"
        value={
          !used
            ? unsupported
              ? 'Not on this Mac'
              : 'Not used'
            : sandbox.ready
              ? 'Ready'
              : sandbox.preparing
                ? `Preparing, ${Math.round((sandbox.progress?.fraction ?? 0) * 100)}%`
                : stopped
                  ? 'Preparing stopped'
                  : 'Not prepared yet'
        }
        hint={
          !used
            ? 'Pace runs directly on this Mac'
            : sandbox.ready
              ? 'Pace answers in it'
              : sandbox.preparing
                ? 'Keeps going in the background'
                : stopped
                  ? 'Try again in setup, under Where it runs'
                  : 'Prepares once you resume setup'
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
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-base font-semibold',
          accent && 'text-status-running'
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  )
}
