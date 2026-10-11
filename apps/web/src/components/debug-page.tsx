import type {
  BotPhase,
  BotStatusView,
  SocketState,
  SupervisorState,
} from '@runtime/types'
import type { TasksCollect } from '@src/tasks/types'
import { Pause, Play, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PaceSpinner } from './pace-spinner'
import { StatusBarView } from './status-bar'

const SIZES = [16, 20, 24, 28, 48, 96, 192]
const SPEEDS = [0.1, 0.25, 0.5, 1]
/** Load lengths for the settle bench, in seconds */
const LOADS = [0.2, 1.5, 5, 12]
/** Pace's states as the status bar names them, and what makes each */
const PACE_STATES: Record<string, { phase: BotPhase; socket?: SocketState }> = {
  Connected: { phase: 'running', socket: 'connected' },
  Starting: { phase: 'starting' },
  Building: { phase: 'building' },
  Stopping: { phase: 'stopping' },
  Reconnecting: { phase: 'running', socket: 'reconnecting' },
  Disconnected: { phase: 'running', socket: 'disconnected' },
  'Setup needed': { phase: 'setup' },
  'Failed to start': { phase: 'failed' },
  Crashed: { phase: 'crashed' },
  Stopped: { phase: 'idle' },
}
const CHECK_ISSUES = [
  'Sandbox: the egress proxy is not running',
  'Diagrams: the renderer did not answer',
]
/**
 * Footer widths: as wide as this page (0), then just under where it drops an
 * item: the attached tools, the last request, the version, the reasoner
 */
const WIDTHS = [0, 820, 700, 630, 530]

/**
 * Development builds only: things to look at in motion, such as Pace's
 * spinner, with slow motion and a frame rate readout.
 */
export function DebugPage() {
  return (
    <ScrollArea className="h-full">
      <div className="max-w-4xl space-y-8 px-8 py-7">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Debug</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Only in development builds. Nothing here changes Pace or its
            settings.
          </p>
        </header>
        <SpinnerBench />
        <SettleBench />
        <StatusBench />
      </div>
    </ScrollArea>
  )
}

/**
 * Every spinner on the bench shares one clock: play, pause and speed apply to
 * all of their animations at once, so they stay in step.
 */
function SpinnerBench() {
  const bench = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const { fps, longest, loop } = useFrameStats(bench)
  const [length, setLength] = useState(0)
  const [at, setAt] = useState(0)
  const animations = () => bench.current?.getAnimations({ subtree: true }) ?? []

  useEffect(() => {
    for (const animation of animations()) {
      animation.playbackRate = speed
      if (playing) animation.play()
      else animation.pause()
    }
  }, [playing, speed])

  useEffect(() => {
    const timing = animations()[0]?.effect?.getComputedTiming()
    setLength(Number(timing?.duration) || 0)
  }, [])

  // Scrubbing pauses every spinner at the same moment of the loop.
  const seek = (ms: number) => {
    setAt(ms)
    setPlaying(false)
    for (const animation of animations()) {
      animation.pause()
      animation.currentTime = ms
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-sm font-semibold">Spinner</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {loop}
        </span>
        <span
          className={cn(
            'text-xs tabular-nums',
            fps < 55 ? 'text-status-interrupted' : 'text-muted-foreground'
          )}
          title="Frames drawn in the last second, and the longest gap between two"
        >
          {fps} fps · longest frame {longest} ms
        </span>
        <SpeedPicker value={speed} onChange={setSpeed} />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause /> : <Play />}
          {playing ? 'Pause' : 'Play'}
        </Button>
      </div>

      {length > 0 && (
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          Jump to
          <input
            type="range"
            min={0}
            max={Math.round(length)}
            step={10}
            value={at}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="w-16 text-right tabular-nums">{at} ms</span>
        </label>
      )}

      <div ref={bench} className="space-y-6">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-y border-border py-6">
          {SIZES.map((size) => (
            <figure
              key={size}
              className="flex flex-col items-center gap-2 text-[11px] text-muted-foreground"
            >
              <div style={{ width: size, height: size }}>
                <PaceSpinner className="size-full" />
              </div>
              <figcaption className="tabular-nums">{size}px</figcaption>
            </figure>
          ))}
        </div>

        {/* Where the app shows it: a run's timeline while Pace works */}
        <div className="flex flex-wrap gap-3">
          {(['bg-card', 'bg-card-accent', 'bg-well'] as const).map((bg) => (
            <div
              key={bg}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-xs font-medium text-status-running',
                bg
              )}
            >
              <PaceSpinner />
              Working
              <span className="font-normal text-muted-foreground">
                on {bg.replace('bg-', '')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Loads of a few lengths, or one until stopped: Pace looks around while a load
 * runs and eases back into the logo when it ends, wherever it was in the loop.
 */
function SettleBench() {
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<number>(undefined)
  const [loading, setLoading] = useState(false)
  const [length, setLength] = useState<number>()
  const [speed, setSpeed] = useState(1)

  // Each load starts the loops again; they and the settles run at this speed.
  const applySpeed = (animations: Animation[]) => {
    for (const animation of animations) animation.playbackRate = speed
  }
  useEffect(() => {
    applySpeed(box.current?.getAnimations({ subtree: true }) ?? [])
  }, [speed])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const load = (seconds?: number) => {
    window.clearTimeout(timer.current)
    setLoading(true)
    setLength(seconds)
    if (seconds !== undefined)
      timer.current = window.setTimeout(
        () => setLoading(false),
        (seconds * 1000) / speed
      )
  }
  const stop = () => {
    window.clearTimeout(timer.current)
    setLoading(false)
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-sm font-semibold">
          Loading, then the logo
        </h2>
        <SpeedPicker value={speed} onChange={setSpeed} />
      </div>
      <p className="text-xs text-muted-foreground">
        Pace looks around while a load runs and eases back into the logo when it
        ends, wherever it was. The loop is still for its first 0.3 seconds, so a
        shorter load never moves.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {LOADS.map((seconds) => (
          <Button
            key={seconds}
            size="sm"
            variant="outline"
            onClick={() => load(seconds)}
          >
            Load {seconds}s
          </Button>
        ))}
        <Button size="sm" onClick={() => (loading ? stop() : load())}>
          {loading ? <Square /> : <Play />}
          {loading ? 'Stop' : 'Load until stopped'}
        </Button>
        <span className="ml-1 text-xs text-muted-foreground">
          {loading
            ? length === undefined
              ? 'Loading until stopped'
              : `Loading for ${length}s`
            : 'At rest'}
        </span>
      </div>

      <div
        ref={box}
        onAnimationStart={(event) =>
          applySpeed((event.target as Element).getAnimations())
        }
        className="space-y-6"
      >
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-y border-border py-6">
          {[24, 28, 48, 96, 192].map((size) => (
            <figure
              key={size}
              className="flex flex-col items-center gap-2 text-[11px] text-muted-foreground"
            >
              <div style={{ width: size, height: size }}>
                <PaceSpinner active={loading} className="size-full" />
              </div>
              <figcaption className="tabular-nums">{size}px</figcaption>
            </figure>
          ))}
        </div>

        {/* A run's answer as it could arrive: the mark looks around where
            Pace's avatar sits and becomes the avatar when the answer comes. */}
        <div className="flex max-w-xl gap-3">
          <PaceSpinner active={loading} className="mt-1" />
          <div className="min-w-0 flex-1 rounded-[20px] bg-card-accent px-5 py-4 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">Pace</span>
              {loading ? (
                <span className="text-shimmer text-[11px] font-medium text-status-running">
                  Working
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Just now
                </span>
              )}
            </div>
            <p className="mt-2 leading-relaxed">
              {loading ? (
                <span className="text-muted-foreground">
                  Reading the thread and checking web-01…
                </span>
              ) : (
                'web-01 is healthy apart from disk: /var is at 91%. Rotating the logs under /var/log/app should bring it under 60%.'
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * The window's footer in made-up states: Pace's, requests in progress, a task
 * collection, check issues, and narrower windows. Clicks show where they
 * would go instead of going there.
 */
function StatusBench() {
  const [pace, setPace] = useState('Connected')
  const [active, setActive] = useState(1)
  const [collect, setCollect] = useState<'off' | 'starting' | 'reading'>(
    'reading'
  )
  const [issues, setIssues] = useState(0)
  const [width, setWidth] = useState(0)
  const [opened, setOpened] = useState<string>()

  const { phase, socket } = PACE_STATES[pace]!
  const now = Date.now()
  const ago = (ms: number) => new Date(now - ms).toISOString()
  // A live status only when Pace runs: the reasoner, tools, requests and
  // check issues come from it.
  const bot: BotStatusView = socket
    ? {
        alive: true,
        status: {
          version: 1,
          pid: 1,
          startedAt: ago(3 * 3_600_000),
          updatedAt: ago(0),
          state: 'running',
          managedBy: 'desktop',
          socket: { state: socket, since: ago(3 * 3_600_000), reconnects: 0 },
          reasoner: 'claude@docker',
          mcp: ['github', 'linear'],
          diagrams: true,
          problems: CHECK_ISSUES.slice(0, issues),
          requests: { active, handled: 12, lastAt: ago(4 * 60_000) },
        },
      }
    : { alive: false }
  const supervisor: SupervisorState = {
    phase,
    output: [],
    autoStart: true,
    restarts: 0,
    canBuild: true,
    issues:
      phase === 'setup'
        ? [
            {
              key: 'SLACK_BOT_TOKEN',
              message: 'The Slack bot token is missing',
            },
          ]
        : undefined,
  }
  const collecting: TasksCollect['running'] =
    collect === 'off'
      ? undefined
      : { startedAt: ago(20_000), reads: collect === 'reading' ? 12 : 0 }

  return (
    <section className="space-y-5">
      <h2 className="text-sm font-semibold">Status bar</h2>
      <p className="text-xs text-muted-foreground">
        The window&apos;s footer in made-up states. Requests and check issues
        show while Pace runs (Connected, Reconnecting, Disconnected).
      </p>
      <div className="grid gap-x-8 gap-y-3 text-xs text-muted-foreground sm:grid-cols-[auto_1fr]">
        <span className="self-center">Pace</span>
        <select
          value={pace}
          onChange={(e) => setPace(e.target.value)}
          className="h-7 w-fit rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:bg-input/30"
        >
          {Object.keys(PACE_STATES).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <span className="self-center">Requests in progress</span>
        <Choice
          options={[0, 1, 3].map((n) => ({ value: n, label: String(n) }))}
          value={active}
          onChange={setActive}
        />
        <span className="self-center">Task collection</span>
        <Choice
          options={[
            { value: 'off' as const, label: 'None' },
            { value: 'starting' as const, label: 'Starting' },
            { value: 'reading' as const, label: '12 lookups' },
          ]}
          value={collect}
          onChange={setCollect}
        />
        <span className="self-center">Check issues</span>
        <Choice
          options={[0, 1, 2].map((n) => ({ value: n, label: String(n) }))}
          value={issues}
          onChange={setIssues}
        />
        <span className="self-center">Width</span>
        <Choice
          options={WIDTHS.map((w) => ({
            value: w,
            label: w ? `${w} px` : 'Page',
          }))}
          value={width}
          onChange={setWidth}
        />
      </div>
      <div
        className="max-w-full overflow-hidden rounded-xl border border-border bg-sidebar"
        style={{ width: width || undefined }}
      >
        <StatusBarView
          bot={bot}
          supervisor={supervisor}
          collecting={collecting}
          onOpenRoute={setOpened}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {opened
          ? `That click would open ${opened}.`
          : 'Click an item to see where it would go. (the folder button opens Finder)'}
      </p>
    </section>
  )
}

/** Playback speed for a bench's animations */
function SpeedPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (speed: number) => void
}) {
  return (
    <Choice
      options={SPEEDS.map((speed) => ({ value: speed, label: `${speed}×` }))}
      value={value}
      onChange={onChange}
    />
  )
}

/** One of a few values, as a row of segments */
function Choice<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" className="flex w-fit rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-6 rounded-md px-2.5 text-xs font-medium tabular-nums transition-colors',
            value === option.value
              ? 'bg-card text-foreground shadow-xs dark:bg-selected'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The frame rate over the last second, its longest frame, and where the first
 * spinner is in its loop.
 */
function useFrameStats(bench: React.RefObject<HTMLDivElement | null>) {
  const [stats, setStats] = useState({ fps: 0, longest: 0, loop: '' })
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let windowStart = last
    let frames = 0
    let longest = 0
    const tick = (now: number) => {
      frames++
      longest = Math.max(longest, now - last)
      last = now
      if (now - windowStart >= 1000) {
        const animation = bench.current?.getAnimations({ subtree: true })[0]
        const timing = animation?.effect?.getComputedTiming()
        const at = timing?.localTime
        const length = Number(timing?.duration)
        setStats({
          fps: Math.round((frames * 1000) / (now - windowStart)),
          longest: Math.round(longest),
          loop:
            typeof at === 'number' && length
              ? `${Math.round(at % length)} / ${Math.round(length)} ms`
              : '',
        })
        windowStart = now
        frames = 0
        longest = 0
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [bench])
  return stats
}
