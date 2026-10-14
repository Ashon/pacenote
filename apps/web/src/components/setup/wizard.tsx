import { Check, LogOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Swap, useIndicator } from '@/components/ui/motion'
import {
  SETUP_STEPS,
  STEP_LABELS,
  stepIndex,
  useDetect,
  useSandboxSetup,
  useSettingsView,
  useSetup,
  type SetupStep,
} from '@/lib/setup'
import { cn } from '@/lib/utils'
import { prepareEarly } from '@src/settings/setup'
import { PacenoteMark } from '../logo'
import { useWindowWidth } from '../resize-handle'
import { AiStep } from './ai-step'
import { AnswerStep } from './answer-step'
import { ReviewStep } from './review-step'
import { preparingProblem, RuntimeStep } from './runtime-step'
import { SlackStep, type SlackPart } from './slack-step'

/** Below this window width the step list keeps only its numbers */
const COMPACT_BELOW = 880

/**
 * Setting up Pace, from the first run to its first answer, in five steps
 * (the Pacenote onboarding canvas). It takes the whole window: the list of
 * steps on the left, where you are and where you have been, and the step on
 * the one content surface. Each step's choices are saved as they are made,
 * so it can be left at any point and picked up from Overview.
 */
export function SetupWizard({ onLeave }: { onLeave: (hash: string) => void }) {
  const setup = useSetup()
  const detect = useDetect()
  const settings = useSettingsView()
  const sandbox = useSandboxSetup({
    renderer: settings.view?.values.RENDER_DIAGRAMS !== 'off',
  })
  const record = setup.view?.record
  const [step, setStep] = useState<SetupStep>()
  /** The part of a step it is on: the sandbox being prepared, the own app */
  const [part, setPart] = useState<string>()
  const compact = useWindowWidth() < COMPACT_BELOW
  const isMac = window.pacenoteDesktop?.platform === 'darwin'

  // It opens where it got to.
  useEffect(() => {
    if (record && !step) setStep(record.step)
  }, [record, step])
  // The built-in sandbox starts preparing at once where this Mac runs it: it
  // is the default, it takes minutes, and it needs no login. One left half
  // prepared (Pacenote quit meanwhile) carries on the same way.
  const setting = settings.view?.values.REASONER_SANDBOX
  const unsupported = detect.detected?.sandbox.unsupported
  const started = useRef(false)
  const { status, ready, job, run } = sandbox
  useEffect(() => {
    if (!detect.detected || !settings.view || !status || started.current) return
    if (prepareEarly({ unsupported, setting, ready, started: Boolean(job) })) {
      started.current = true
      run('vm')
    }
  }, [
    detect.detected,
    settings.view,
    status,
    unsupported,
    setting,
    ready,
    job,
    run,
  ])
  /** Preparing shows under its step until this Mac is chosen instead */
  const preparingShown = sandbox.preparing && setting !== 'none'
  /** As does preparing that stopped, so it is not found out only at Start */
  const stoppedShown =
    !sandbox.preparing &&
    setting !== 'none' &&
    !unsupported &&
    preparingProblem(sandbox) !== undefined
  /** Pace is being started: the steps wait until it has or has not */
  const [locked, setLocked] = useState(false)

  const save = setup.save
  const { refresh } = settings
  // Each step reads the settings again: the one before may have changed them
  // in the app (pairing with the hub saves its address and token there).
  const go = useCallback(
    (next: SetupStep, nextPart?: string) => {
      setPart(nextPart)
      setStep(next)
      refresh()
      void save({ step: next })
    },
    [save, refresh]
  )
  const finished = useCallback(() => void save({ finished: true }), [save])

  const steps = useIndicator<HTMLOListElement>({
    selected: '[aria-current="step"]',
    items: '[data-step]',
    attribute: 'aria-current',
  })

  const body = (() => {
    if (!record || !step) return null
    switch (step) {
      case 'ai':
        return (
          <AiStep
            detect={detect}
            settings={settings.view}
            onDone={() => go('runtime')}
          />
        )
      case 'runtime':
        return (
          <RuntimeStep
            detected={detect.detected}
            settings={settings}
            sandbox={sandbox}
            preparing={part === 'preparing'}
            onPrepare={() => setPart('preparing')}
            onBack={() => (part ? setPart(undefined) : go('ai'))}
            onDone={() => go('slack')}
          />
        )
      case 'slack':
        return (
          <SlackStep
            part={(part as SlackPart | undefined) ?? 'choose'}
            onPart={(next) => setPart(next === 'choose' ? undefined : next)}
            settings={settings}
            connection={record.slack}
            me={record.me}
            onBack={() => go('runtime')}
            onDone={(connection, me) => {
              void save({ slack: connection, me })
              go('review')
            }}
          />
        )
      case 'review':
        return (
          <ReviewStep
            record={record}
            settings={settings}
            detected={detect.detected}
            sandbox={sandbox}
            onChange={go}
            onBusy={setLocked}
            onStarted={(since) => {
              void save({ step: 'answer', answerSince: since })
              setPart(undefined)
              setStep('answer')
            }}
          />
        )
      case 'answer':
        return (
          <AnswerStep record={record} onFinished={finished} onLeave={onLeave} />
        )
    }
  })()

  const furthest = record ? stepIndex(record.step) : 0
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <header
        className={cn(
          'titlebar-drag grid h-12 shrink-0 place-items-center text-body font-semibold text-muted-foreground',
          isMac && 'pl-[72px]'
        )}
      >
        Set up Pace
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Setup steps"
          className={cn(
            'motion-layout flex shrink-0 flex-col pb-4',
            compact ? 'w-16 px-2' : 'w-56 px-3'
          )}
        >
          <div className="flex h-10 items-center gap-2.5 px-2.5 pb-3">
            <PacenoteMark className="size-6 shrink-0" />
            <span
              data-hidden={compact || undefined}
              className="motion-layout-label text-base font-semibold tracking-tight"
            >
              Pacenote
            </span>
          </div>
          <ol ref={steps.ref} className="relative flex flex-col gap-0.5">
            {steps.box && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-0 left-0 rounded-xl bg-selected',
                  steps.className
                )}
                style={{
                  width: steps.box.width,
                  height: steps.box.height,
                  translate: `0 ${steps.box.y}px`,
                }}
              />
            )}
            {SETUP_STEPS.map((each, index) => {
              const current = each === step
              const reached = index <= furthest
              // Done: passed on the way to the furthest step, or the last
              // one once setup is over
              const done =
                !current && (index < furthest || Boolean(record?.finishedAt))
              const preparing = each === 'runtime' && preparingShown && !current
              const stopped = each === 'runtime' && stoppedShown && !current
              const inner = (
                <>
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors',
                      current
                        ? 'bg-primary text-primary-foreground'
                        : reached
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
                  <span
                    className={cn(
                      'flex min-w-0 flex-1 flex-col gap-1',
                      compact && 'sr-only'
                    )}
                  >
                    {STEP_LABELS[each]}
                    {preparing && (
                      <span className="flex items-center gap-1.5 text-2xs font-semibold text-status-running">
                        <span
                          role="progressbar"
                          aria-label="Preparing the built-in sandbox"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(
                            (sandbox.progress?.fraction ?? 0) * 100
                          )}
                          className="h-1 w-12 overflow-hidden rounded-full bg-muted"
                        >
                          <span
                            className="motion-progress block h-full rounded-full bg-status-running"
                            style={{
                              width: `${Math.max(
                                (sandbox.progress?.fraction ?? 0) * 100,
                                6
                              )}%`,
                            }}
                          />
                        </span>
                        Preparing
                      </span>
                    )}
                    {stopped && (
                      <span className="text-2xs font-semibold text-status-failed">
                        Preparing stopped
                      </span>
                    )}
                  </span>
                </>
              )
              const className = cn(
                'relative flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-body transition-colors',
                current
                  ? 'font-semibold text-foreground'
                  : reached
                    ? 'text-foreground hover:bg-selected/50'
                    : 'text-muted-foreground'
              )
              return (
                <li key={each} data-step={each}>
                  {current ? (
                    <span aria-current="step" className={className}>
                      {inner}
                    </span>
                  ) : reached ? (
                    <button
                      type="button"
                      className={className}
                      disabled={locked}
                      title={compact ? STEP_LABELS[each] : undefined}
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
          {!record?.finishedAt && (
            <div className="flex flex-col gap-1 px-2.5">
              <button
                type="button"
                onClick={() => onLeave('#/')}
                aria-label={compact ? 'Finish later' : undefined}
                title={compact ? 'Finish later' : undefined}
                className="flex items-center gap-2 self-start text-body font-semibold text-primary hover:underline"
              >
                {compact ? <LogOut className="size-4" /> : 'Finish later'}
              </button>
              {!compact && (
                <span className="text-xs text-muted-foreground">
                  Your choices are saved. Pick up from Overview.
                </span>
              )}
            </div>
          )}
        </nav>
        <main
          className="content-surface mr-3 mb-3 min-w-0 flex-1 overflow-hidden rounded-[20px] bg-card"
          style={{ boxShadow: 'var(--card-shadow)' }}
        >
          {body && (
            <Swap id={`${step}/${part ?? ''}`} className="h-full">
              {body}
            </Swap>
          )}
        </main>
      </div>
    </div>
  )
}
