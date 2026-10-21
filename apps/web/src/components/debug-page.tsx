import type {
  BotPhase,
  BotStatusView,
  SocketState,
  SupervisorState,
} from '@runtime/types'
import type { TasksCollect } from '@src/tasks/types'
import {
  ChevronRight,
  CircleCheck,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Square,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  motionItem,
  Swap,
  useFlash,
  useListMotion,
  usePresence,
} from '@/components/ui/motion'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { BotMark } from './bot-page'
import { TONE_CLASS, type BotTone } from './bot-state'
import { text as stateText, type BotStateName } from './bot-state.text'
import { text } from './debug-page.text'
import { PaceSpinner } from './pace-spinner'
import { StatusBarView } from './status-bar'

const SIZES = [16, 20, 24, 28, 48, 96, 192]
const SPEEDS = [0.1, 0.25, 0.5, 1]
/** Load lengths for the settle bench, in seconds */
const LOADS = [0.2, 1.5, 5, 12]
/** Pace's states as the status bar names them, and what makes each */
const PACE_STATES: Partial<
  Record<BotStateName, { phase: BotPhase; socket?: SocketState }>
> = {
  connected: { phase: 'running', socket: 'connected' },
  starting: { phase: 'starting' },
  building: { phase: 'building' },
  stopping: { phase: 'stopping' },
  reconnecting: { phase: 'running', socket: 'reconnecting' },
  disconnected: { phase: 'running', socket: 'disconnected' },
  setup: { phase: 'setup' },
  failed: { phase: 'failed' },
  crashed: { phase: 'crashed' },
  stopped: { phase: 'idle' },
}
/** States of Pace's mark on the Pace screen, in the order they come */
const MARK_STATES: Partial<Record<BotStateName, BotTone>> = {
  stopped: 'off',
  starting: 'busy',
  connected: 'ok',
  reconnecting: 'warn',
  stopping: 'busy',
}
/** A table's state names, in its order */
const names = (table: Partial<Record<BotStateName, unknown>>) =>
  Object.keys(table) as BotStateName[]
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
  const t = useText(text)
  return (
    <ScrollArea className="h-full">
      <div className="@container max-w-4xl space-y-8 px-8 py-7">
        <header>
          <h1 className="text-title">{t.title}</h1>
          <p className="mt-1 text-copy text-muted-foreground">{t.intro}</p>
        </header>
        <SpinnerBench />
        <SettleBench />
        <MarkBench />
        <MotionBench />
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
  const t = useText(text)
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
        <h2 className="mr-auto text-section">{t.spinner}</h2>
        <span className="text-meta text-muted-foreground tabular-nums">
          {loop}
        </span>
        <span
          className={cn(
            'text-meta tabular-nums',
            fps < 55 ? 'text-status-interrupted' : 'text-muted-foreground'
          )}
          title={t.fpsTip}
        >
          {t.fps(fps, longest)}
        </span>
        <SpeedPicker value={speed} onChange={setSpeed} />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause /> : <Play />}
          {playing ? t.pause : t.play}
        </Button>
      </div>

      {length > 0 && (
        <label className="flex items-center gap-3 text-meta text-muted-foreground">
          {t.jumpTo}
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
              className="flex flex-col items-center gap-2 text-caption text-muted-foreground"
            >
              <div style={{ width: size, height: size }}>
                <PaceSpinner className="size-full" />
              </div>
              <figcaption className="tabular-nums">{size}px</figcaption>
            </figure>
          ))}
        </div>

        {/* Writing: Recap's Write it up, a drafted reply */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-border pb-6">
          {SIZES.map((size) => (
            <figure
              key={size}
              className="flex flex-col items-center gap-2 text-caption text-muted-foreground"
            >
              <div style={{ width: size, height: size }}>
                <PaceSpinner writing className="size-full" />
              </div>
              <figcaption className="tabular-nums">
                {t.writing(size)}
              </figcaption>
            </figure>
          ))}
        </div>

        {/* Where the app shows it: a run's timeline while Pace works */}
        <div className="flex flex-wrap gap-3">
          {(['bg-card', 'bg-card-accent', 'bg-well'] as const).map((bg) => (
            <div
              key={bg}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-meta font-medium text-status-running',
                bg
              )}
            >
              <PaceSpinner />
              {t.working}
              <span className="font-normal text-muted-foreground">
                {t.on(bg.replace('bg-', ''))}
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
  const t = useText(text)
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
        <h2 className="mr-auto text-section">{t.settle}</h2>
        <SpeedPicker value={speed} onChange={setSpeed} />
      </div>
      <p className="text-meta text-muted-foreground">{t.settleNote}</p>
      <div className="flex flex-wrap items-center gap-2">
        {LOADS.map((seconds) => (
          <Button
            key={seconds}
            size="sm"
            variant="outline"
            onClick={() => load(seconds)}
          >
            {t.load(seconds)}
          </Button>
        ))}
        <Button size="sm" onClick={() => (loading ? stop() : load())}>
          {loading ? <Square /> : <Play />}
          {loading ? t.stop : t.loadUntilStopped}
        </Button>
        <span className="ml-1 text-meta text-muted-foreground">
          {loading
            ? length === undefined
              ? t.loadingUntilStopped
              : t.loadingFor(length)
            : t.atRest}
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
              className="flex flex-col items-center gap-2 text-caption text-muted-foreground"
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
          <div className="min-w-0 flex-1 rounded-[20px] bg-card-accent px-5 py-4 text-copy">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">Pace</span>
              {loading ? (
                <span className="text-shimmer text-caption text-status-running">
                  {t.working}
                </span>
              ) : (
                <span className="text-caption text-muted-foreground">
                  {t.justNow}
                </span>
              )}
            </div>
            <p className="mt-2 leading-relaxed">
              {loading ? (
                <span className="text-muted-foreground">{t.reading}</span>
              ) : (
                t.answer
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * The mark beside Pace's name on the Pace screen, from state to state: it
 * looks around while Pace starts or stops and turns while Pace is connected,
 * faster while it answers.
 */
function MarkBench() {
  const t = useText(text)
  const states = useText(stateText)
  const [pace, setPace] = useState<BotStateName>('connected')
  const [active, setActive] = useState(0)
  const tone = MARK_STATES[pace]!
  const answering = tone === 'ok' && active > 0

  return (
    <section className="space-y-5">
      <h2 className="text-section">{t.paceScreen}</h2>
      <p className="text-meta text-muted-foreground">{t.markNote}</p>
      <div className="grid gap-x-8 gap-y-3 text-meta text-muted-foreground sm:grid-cols-[auto_1fr]">
        <span className="self-center">Pace</span>
        <Choice
          options={names(MARK_STATES).map((name) => ({
            value: name,
            label: states[name],
          }))}
          value={pace}
          onChange={setPace}
        />
        <span className="self-center">{t.requestsInProgress}</span>
        <Choice
          options={[0, 1, 3].map((n) => ({ value: n, label: String(n) }))}
          value={active}
          onChange={setActive}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-8 border-y border-border py-6">
        <div className="flex items-start gap-4">
          <BotMark tone={tone} answering={answering} className="mt-1" />
          <div>
            <div className="flex items-center gap-2 text-title">
              Pace
              <span className={cn('text-row', TONE_CLASS[tone].text)}>
                {states[pace]}
              </span>
            </div>
            <p className="mt-0.5 text-copy text-muted-foreground">
              {answering ? t.answering(active) : t.asOnScreen}
            </p>
          </div>
        </div>
        <BotMark tone={tone} answering={answering} className="size-24" />
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
  const t = useText(text)
  const states = useText(stateText)
  const [pace, setPace] = useState<BotStateName>('connected')
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
          reasoner: 'claude@vm',
          mcp: ['github', 'linear'],
          diagrams: true,
          problems: t.issues.slice(0, issues),
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
              message: t.tokenMissing,
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
      <h2 className="text-section">{t.statusBar}</h2>
      <p className="text-meta text-muted-foreground">{t.statusNote}</p>
      <div className="grid gap-x-8 gap-y-3 text-meta text-muted-foreground sm:grid-cols-[auto_1fr]">
        <span className="self-center">Pace</span>
        <select
          value={pace}
          onChange={(e) => setPace(e.target.value as BotStateName)}
          className="h-7 w-fit rounded-md border border-input bg-background px-2 text-meta text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:bg-input/30"
        >
          {names(PACE_STATES).map((name) => (
            <option key={name} value={name}>
              {states[name]}
            </option>
          ))}
        </select>
        <span className="self-center">{t.requestsInProgress}</span>
        <Choice
          options={[0, 1, 3].map((n) => ({ value: n, label: String(n) }))}
          value={active}
          onChange={setActive}
        />
        <span className="self-center">{t.taskCollection}</span>
        <Choice
          options={(['off', 'starting', 'reading'] as const).map((value) => ({
            value,
            label: t.collect[value],
          }))}
          value={collect}
          onChange={setCollect}
        />
        <span className="self-center">{t.checkIssues}</span>
        <Choice
          options={[0, 1, 2].map((n) => ({ value: n, label: String(n) }))}
          value={issues}
          onChange={setIssues}
        />
        <span className="self-center">{t.width}</span>
        <Choice
          options={WIDTHS.map((w) => ({
            value: w,
            label: w ? `${w} px` : t.page,
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
      <p className="text-meta text-muted-foreground">
        {opened ? t.wouldOpen(opened) : t.clickHint}
      </p>
    </section>
  )
}

const SCREENS = ['overview', 'tasks', 'runs'] as const
const TABS = ['open', 'maybe', 'done'] as const

/**
 * The app's motion patterns (motion.css) on its own primitives, to look at
 * slowly: the speed applies to every pattern in the app while this page is
 * open (--motion-scale), menus and dialogs included.
 */
function MotionBench() {
  const t = useText(text)
  const [speed, setSpeed] = useState(1)
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--motion-scale', String(1 / speed))
    return () => {
      root.removeProperty('--motion-scale')
    }
  }, [speed])
  const [screen, setScreen] = useState<(typeof SCREENS)[number]>(SCREENS[0])
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0])
  const [open, setOpen] = useState(false)
  const [layer, setLayer] = useState<'center' | 'sheet'>()
  const [added, setAdded] = useState(3)
  const [tasks, setTasks] = useState([1, 2, 3])
  const list = useListMotion(tasks, String)
  const [working, setWorking] = useState(false)
  const [due, setDue] = useState<keyof typeof t.days>('thursday')

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-section">{t.motion}</h2>
        <SpeedPicker value={speed} onChange={setSpeed} />
      </div>
      <p className="text-meta text-muted-foreground">{t.motionNote}</p>
      <div className="grid gap-x-10 gap-y-8 @min-[44rem]:grid-cols-2">
        <Bench title="swap" note={t.swapNote}>
          <Choice
            options={SCREENS.map((name) => ({
              value: name,
              label: t.screens[name],
            }))}
            value={screen}
            onChange={setScreen}
          />
          <Swap id={screen} className="mt-3">
            <p className="rounded-xl bg-well px-4 py-6 text-copy">
              {t.swapped(t.screens[screen])}
            </p>
          </Swap>
        </Bench>

        <Bench title="indicator" note={t.indicatorNote}>
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as (typeof TABS)[number])}
          >
            <TabsList>
              {TABS.map((name) => (
                <TabsTrigger key={name} value={name}>
                  {t.tabs[name]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Swap id={tab} className="mt-3">
            <p className="rounded-xl bg-well px-4 py-6 text-copy">
              {t.tabList(t.tabs[tab])}
            </p>
          </Swap>
        </Bench>

        <Bench title="reveal" note={t.revealNote}>
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="group flex items-center gap-2 text-section">
              <ChevronRight
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  open && 'rotate-90'
                )}
              />
              {t.task}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="pt-2 pl-6 text-body text-muted-foreground">
                {t.taskDetail}
              </p>
            </CollapsibleContent>
          </Collapsible>
        </Bench>

        <Bench title="arrive and settle" note={t.arriveNote}>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              setTasks([added + 1, ...tasks])
              setAdded(added + 1)
            }}
          >
            <Plus />
            {t.addTask}
          </Button>
          <ul ref={list.ref} className="mt-3">
            {list.entries.map((entry) => (
              <li
                key={entry.key}
                {...motionItem(entry)}
                className="flex items-center border-t border-border py-2.5 text-copy"
              >
                <span className="flex-1">{t.taskN(entry.item)}</span>
                <Button
                  size="xs"
                  onClick={() =>
                    setTasks(tasks.filter((task) => task !== entry.item))
                  }
                >
                  <CircleCheck />
                  {t.done}
                </Button>
              </li>
            ))}
          </ul>
        </Bench>

        <Bench title="dialog and sheet" note={t.dialogNote}>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLayer('center')}
            >
              {t.openDialog}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLayer('sheet')}
            >
              {t.openSheet}
            </Button>
          </div>
          <Dialog
            open={layer === 'center'}
            onOpenChange={() => setLayer(undefined)}
          >
            <DialogContent className="w-[28rem] gap-4 p-6">
              <DialogTitle className="text-heading">
                {t.dialogTitle}
              </DialogTitle>
              <DialogDescription className="text-body text-muted-foreground">
                {t.dialogBody}
              </DialogDescription>
              <div className="flex justify-end">
                <DialogClose asChild>
                  <Button variant="secondary">{t.close}</Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
          {layer === 'sheet' && (
            <Dialog open onOpenChange={() => setLayer(undefined)}>
              <DialogContent variant="sheet" className="w-[28rem] gap-3 p-6">
                <DialogTitle className="text-section">
                  {t.sessionLog}
                </DialogTitle>
                <DialogDescription className="text-body text-muted-foreground">
                  {t.sheetBody}
                </DialogDescription>
              </DialogContent>
            </Dialog>
          )}
        </Bench>

        <Bench title="fade and flash" note={t.fadeNote}>
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setWorking(!working)}
            >
              {working ? t.doneWorking : t.startWorking}
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                setDue(due === 'thursday' ? 'wednesday' : 'thursday')
              }
            >
              {t.moveDue}
            </Button>
          </div>
          <AtWorkRow working={working} due={t.days[due]} />
        </Bench>

        <Bench title="pop" note={t.popNote}>
          <div className="flex items-center gap-2">
            <Tooltip content={t.tooltip}>
              <Button size="sm" variant="outline">
                {t.hover}
              </Button>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={t.menu}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>{t.continueInCodex}</DropdownMenuItem>
                <DropdownMenuItem>{t.draftReply}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Bench>
      </div>
    </section>
  )
}

/** A task row as an AI tool works on it: its mark, and a due date it moves */
function AtWorkRow({ working, due }: { working: boolean; due: string }) {
  const t = useText(text)
  const mark = usePresence<HTMLSpanElement>(working)
  const flash = useFlash({ due })
  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <p className="text-section">{t.task}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
        mina · #payments
        <span
          {...flash('due')}
          className="motion-flash rounded-full bg-status-interrupted/12 px-2 py-px font-medium text-status-interrupted"
        >
          {due}
        </span>
        {mark.mounted && (
          <span
            ref={mark.ref}
            data-state={mark.state}
            className="motion-fade inline-flex items-center gap-1.5 font-medium text-status-running"
          >
            <span className="size-1.5 animate-pulse-dot rounded-full bg-status-running" />
            {t.workingIn}
          </span>
        )}
      </p>
    </div>
  )
}

function Bench({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-body font-semibold">{title}</h3>
      <p className="mb-3 text-meta text-muted-foreground">{note}</p>
      {children}
    </div>
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
            'h-6 rounded-md px-2.5 text-meta font-medium tabular-nums transition-colors',
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
