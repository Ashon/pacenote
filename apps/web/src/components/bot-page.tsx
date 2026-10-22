import { settingLabel, setupSettingsRoute } from '@src/settings/fields'
import type { LogLine, SupervisorState } from '@runtime/types'
import {
  ArrowDownToLine,
  Bot,
  Cpu,
  FolderOpen,
  Hammer,
  Inbox,
  Info as InfoIcon,
  Play,
  RotateCw,
  Search,
  Settings,
  Square,
  TriangleAlert,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Placeholder } from '@/components/ui/motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  SkeletonBlock,
  SkeletonText,
  SkeletonWord,
} from '@/components/ui/skeleton'
import { useBotLogs, useBotStatus } from '@/lib/api'
import { botControl, useSupervisor } from '@/lib/desktop'
import { formatDateTime, formatDuration, formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { text } from './bot-page.text'
import { botKnown, describeBot, TONE_CLASS, type BotTone } from './bot-state'
import { CodeBlock } from './code-block'
import { PaceSpinner } from './pace-spinner'

export function BotPage() {
  const t = useText(text)
  const { data: view } = useBotStatus()
  const supervisor = useSupervisor()
  const control = botControl()
  const status = view?.alive ? view.status : undefined
  const { tone, label } = describeBot(view, supervisor)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b px-10 pt-8 pb-6">
        <div className="@container mx-auto max-w-5xl">
          <div className="flex items-start gap-4">
            {/* Until Pace's state can be told, its mark's place, not a stop
                sign */}
            {botKnown(view, supervisor) ? (
              <BotMark
                tone={tone}
                answering={(status?.requests.active ?? 0) > 0}
                className="mt-1"
              />
            ) : (
              <span className="motion-skeleton mt-1 shrink-0">
                <SkeletonBlock className="size-10 rounded-xl" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 text-title">
                Pace
                <span className={cn('text-row', TONE_CLASS[tone].text)}>
                  {botKnown(view, supervisor) ? (
                    label
                  ) : (
                    <SkeletonWord width="5rem" />
                  )}
                </span>
              </h1>
              <p className="mt-0.5 text-copy text-muted-foreground">
                {status
                  ? t.socketLine(
                      t.socket[status.socket.state],
                      formatRelative(status.socket.since),
                      status.socket.reconnects
                    )
                  : t.intro}
              </p>
            </div>
            <Controls supervisor={supervisor} />
          </div>
          {/* The app's notice comes with what Pace is doing; until then, the
              place it took last time (measured) */}
          {control && supervisor === undefined ? (
            lastNotice() > 0 && (
              <div className="motion-skeleton">
                <SkeletonBlock
                  className="mt-3 rounded-lg"
                  style={{ height: lastNotice() - 12 }}
                />
              </div>
            )
          ) : (
            <div
              ref={(element) => {
                if (element) rememberNotice(element.offsetHeight)
              }}
              className="flow-root"
            >
              {supervisor?.message && <Notice supervisor={supervisor} />}
            </div>
          )}
          <div className="mt-6 grid grid-cols-2 gap-y-5 @min-[44rem]:grid-cols-4">
            <Info icon={<Bot />} label={t.botAccount} known={Boolean(view)}>
              {status?.bot ? `@${status.bot.user}` : '-'}
              <Sub>{status?.bot?.team}</Sub>
            </Info>
            <Info icon={<Cpu />} label={t.reasoner} known={Boolean(view)}>
              {status?.reasoner ?? '-'}
              <Sub>
                {status
                  ? t.mcpLine(status.mcp ?? [], Boolean(status.diagrams))
                  : undefined}
              </Sub>
            </Info>
            <Info icon={<Inbox />} label={t.requests} known={Boolean(view)}>
              {status ? t.active(status.requests.active) : '-'}
              <Sub>
                {status
                  ? t.handled(
                      status.requests.handled,
                      status.requests.lastAt
                        ? formatRelative(status.requests.lastAt)
                        : undefined
                    )
                  : undefined}
              </Sub>
            </Info>
            <Info icon={<Square />} label={t.process} known={Boolean(view)}>
              {status
                ? `pid ${status.pid}`
                : supervisor?.pid
                  ? `pid ${supervisor.pid}`
                  : '-'}
              <Sub>
                {status
                  ? t.processLine(
                      status.managedBy === 'desktop',
                      formatDuration(Date.now() - Date.parse(status.startedAt))
                    )
                  : undefined}
              </Sub>
            </Info>
          </div>
          {status && status.problems.length > 0 && (
            <ul className="mt-3 space-y-1">
              {status.problems.map((problem) => (
                <li
                  key={problem}
                  className="flex items-start gap-1.5 text-meta text-status-interrupted"
                >
                  <TriangleAlert className="mt-px size-3.5 shrink-0" />
                  {problem}
                </li>
              ))}
            </ul>
          )}
          {/* Limits of the setup, not faults: quiet, and only here. */}
          {status?.limits && status.limits.length > 0 && (
            <ul className="mt-3 space-y-1">
              {status.limits.map((limit) => (
                <li
                  key={limit}
                  className="flex items-start gap-1.5 text-meta text-muted-foreground"
                >
                  <InfoIcon className="mt-px size-3.5 shrink-0" />
                  {limit}
                </li>
              ))}
            </ul>
          )}
          {supervisor &&
            supervisor.output.length > 0 &&
            (supervisor.phase === 'failed' ||
              supervisor.phase === 'crashed' ||
              supervisor.phase === 'building') && (
              <CodeBlock
                className="mt-3"
                label={t.lastOutput}
                code={supervisor.output.slice(-40).join('\n')}
                maxHeight="max-h-48"
              />
            )}
        </div>
      </div>
      <LogPanel />
    </div>
  )
}

/**
 * The supervisor's notice under the header. Setup needed is amber with a way to
 * Settings (and the failing values, if any); a failed start or a crash is red,
 * with when the app tries again; anything else is a quiet note.
 */
function Notice({ supervisor }: { supervisor: SupervisorState }) {
  const t = useText(text)
  const { phase, message, issues, retryAt } = supervisor
  const tone =
    phase === 'setup'
      ? TONE_CLASS.warn
      : phase === 'failed' || phase === 'crashed'
        ? TONE_CLASS.error
        : undefined
  return (
    <div
      className={cn(
        'mt-3 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-meta',
        tone
          ? [tone.bg, tone.text]
          : 'border-transparent bg-muted/60 text-muted-foreground'
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="select-text">{message}</p>
        {retryAt !== undefined && <RetryCountdown at={retryAt} />}
        {phase === 'setup' && issues && issues.length > 0 && (
          <ul className="space-y-0.5">
            {issues.map((issue) => (
              <li key={`${issue.key}:${issue.message}`}>
                {issue.key && (
                  <span className="font-medium">
                    {settingLabel(issue.key)}:
                  </span>
                )}{' '}
                {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      {phase === 'setup' && (
        <Button
          size="xs"
          onClick={() => (window.location.hash = setupSettingsRoute(issues))}
        >
          <Settings />
          {t.openSettings}
        </Button>
      )}
    </div>
  )
}

/** When the app starts Pace again, counting down */
function RetryCountdown({ at }: { at: number }) {
  const t = useText(text)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.ceil((at - now) / 1_000)
  return (
    <p>
      {seconds <= 0
        ? t.startingNow
        : t.startingIn(seconds, formatDuration(seconds * 1_000))}
    </p>
  )
}

/**
 * Pace's mark beside its name: looking around while Pace starts, builds or
 * stops, turning slowly while it is connected and faster while it answers.
 * Stopped, a stop sign; otherwise the state's icon.
 */
export function BotMark({
  tone,
  answering,
  className,
}: {
  tone: BotTone
  answering: boolean
  className?: string
}) {
  if (tone === 'busy' || tone === 'ok') {
    return (
      <PaceSpinner
        active={tone === 'busy'}
        turn={tone === 'ok' ? (answering ? 'fast' : 'slow') : undefined}
        className={cn('size-10', className)}
      />
    )
  }
  if (tone === 'off') return <StopSign className={cn('size-10', className)} />
  return (
    <span
      className={cn(
        'grid size-10 place-items-center rounded-xl',
        TONE_CLASS[tone].bg,
        className
      )}
    >
      <Bot className={cn('size-5', TONE_CLASS[tone].text)} />
    </span>
  )
}

/**
 * Pace stopped: a circle and a bar in gray, like the status bar's dot, as heavy
 * as the mark it stands in for (ring radius 164 and stroke 84 of 512)
 */
function StopSign({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden
      className={cn('shrink-0 text-muted-foreground', className)}
    >
      <circle
        cx="20"
        cy="20"
        r="12.8"
        className="fill-muted-foreground/10"
        stroke="currentColor"
        strokeWidth="6.5"
      />
      <path
        d="M16.5 20h7"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Controls({ supervisor }: { supervisor: SupervisorState | undefined }) {
  const t = useText(text)
  const control = botControl()
  const [pending, setPending] = useState(false)
  if (control && !supervisor)
    return (
      <div className="motion-skeleton flex shrink-0 items-center gap-1.5">
        <SkeletonBlock className="h-8 w-20 rounded-md" />
        <SkeletonBlock className="h-8 w-20 rounded-md" />
      </div>
    )
  if (!control || !supervisor) {
    return (
      <p className="shrink-0 text-right text-meta text-muted-foreground">
        {t.desktopOnly[0]}
        <br />
        {t.desktopOnly[1]}
      </p>
    )
  }
  const phase = supervisor.phase
  const run = (action: () => Promise<void>) => {
    setPending(true)
    void action().finally(() => setPending(false))
  }
  const busy = pending || phase === 'building' || phase === 'stopping'
  const live = phase === 'running' || phase === 'starting'
  /** Waiting to start again after an exit; Stop ends the wait */
  const waiting = supervisor.retryAt !== undefined
  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex items-center gap-1.5">
        {!live && (
          <Button
            size="sm"
            // When setup is needed, the notice's "Open Settings" is the main
            // action; Start only checks again.
            variant={phase === 'setup' ? 'outline' : 'default'}
            disabled={busy || phase === 'external'}
            onClick={() => run(() => control.start())}
          >
            <Play />
            {waiting ? t.startNow : t.start}
          </Button>
        )}
        {live && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => control.restart())}
          >
            <RotateCw />
            {t.restart}
          </Button>
        )}
        {supervisor.canBuild && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || phase === 'external'}
            onClick={() => run(() => control.restart(true))}
          >
            <Hammer />
            {t.rebuild}
          </Button>
        )}
        {(live || waiting) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => control.stop())}
          >
            <Square />
            {t.stop}
          </Button>
        )}
      </div>
    </div>
  )
}

function Info({
  icon,
  label,
  known,
  children,
}: {
  icon: React.ReactNode
  label: string
  /** The status has come; until then, its figure and line are bars */
  known: boolean
  children: React.ReactNode
}) {
  return (
    // One figure in a row split by hairlines, not a card of its own
    <div className="min-w-0 px-5 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border @max-[44rem]:[&:nth-child(3)]:border-l-0 @max-[44rem]:[&:nth-child(3)]:pl-0">
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <Placeholder
        ready={known}
        skeleton={
          <div className="mt-1 text-row">
            <SkeletonText width="54%" />
            <SkeletonText className="text-caption" width="76%" />
          </div>
        }
      >
        <div className="mt-1 truncate text-row">{children}</div>
      </Placeholder>
    </div>
  )
}

/**
 * The line under a figure. It keeps its place when there is nothing to say
 * (Pace stopped), so the header does not grow when Pace starts.
 */
function Sub({ children }: { children?: React.ReactNode }) {
  return (
    <div className="truncate text-caption text-muted-foreground">
      {children || '\u00a0'}
    </div>
  )
}

export type LogView = 'all' | 'socket' | 'mention' | 'problems'

const LOG_VIEWS: LogView[] = ['all', 'socket', 'mention', 'problems']

const matchesView = (line: LogLine, view: LogView) => {
  const scope = line.scope ?? ''
  switch (view) {
    case 'socket':
      return (
        scope.startsWith('pacenote:socket') || scope.startsWith('pacenote:bolt')
      )
    case 'mention':
      return (
        scope.startsWith('pacenote:mention') ||
        scope.startsWith('pacenote:history')
      )
    case 'problems':
      return line.level === 'WARN' || line.level === 'ERROR'
    default:
      return true
  }
}

const LEVEL_CLASS: Record<string, string> = {
  DEBUG: 'text-muted-foreground',
  INFO: 'text-status-succeeded',
  WARN: 'text-status-interrupted',
  ERROR: 'text-status-failed',
}

/** Takes no props, so Pace's status polls leave it be */
const LogPanel = memo(function LogPanel() {
  const t = useText(text)
  const [view, setView] = useState<LogView>('all')
  const [q, setQ] = useState('')
  const [follow, setFollow] = useState(true)
  const { data, isError } = useBotLogs({ lines: 1500 })
  const scroller = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => {
    const query = q.trim().toLowerCase()
    // A row's key is its time and how many rows before it share that time,
    // so rows keep their key as the tail slides on.
    const seen = new Map<string | undefined, number>()
    return (data ?? [])
      .filter(
        (line) =>
          matchesView(line, view) &&
          (!query || line.message.toLowerCase().includes(query))
      )
      .map((line) => {
        const n = seen.get(line.at) ?? 0
        seen.set(line.at, n + 1)
        return { line, key: `${line.at}-${n}` }
      })
  }, [data, view, q])

  useEffect(() => {
    const el = scroller.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [lines, follow])

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-10 py-2.5">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-row">{t.logs}</span>
          <div className="ml-2 flex gap-1">
            {LOG_VIEWS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                className={cn(
                  'h-6 rounded-full px-2.5 text-meta font-medium transition-colors',
                  view === item
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {t.views[item]}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.searchLogs}
              className="h-7 pl-7 text-meta"
            />
          </div>
          <Button
            variant={follow ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setFollow((v) => !v)}
            aria-pressed={follow}
          >
            <ArrowDownToLine />
            {t.follow}
          </Button>
          {botControl() && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.openLogs}
              onClick={() => void botControl()?.openLogs()}
            >
              <FolderOpen />
            </Button>
          )}
        </div>
      </div>
      <ScrollArea
        viewportRef={scroller}
        onWheel={(e) => {
          if (e.deltaY < 0) setFollow(false)
        }}
        className="min-h-0 flex-1"
      >
        <div className="px-10 py-2 font-mono text-caption leading-[1.6] select-text">
          <div className="mx-auto max-w-5xl">
            {data === undefined && !isError && (
              <div className="motion-skeleton">
                {LOG_WIDTHS.map((width, i) => (
                  <SkeletonText key={i} className="px-1.5" width={width} />
                ))}
              </div>
            )}
            {lines.map(({ line, key }) => (
              <LogRow key={key} line={line} />
            ))}
            {(data !== undefined || isError) && lines.length === 0 && (
              <p className="py-10 text-center font-sans text-copy text-muted-foreground">
                {isError ? t.logsFailed : t.noLogs}
              </p>
            )}
          </div>
        </div>
      </ScrollArea>
    </section>
  )
})

/** The app's notice's height last time, with its margin; 0 for none */
const NOTICE_KEY = 'pacenote.bot.notice'

function lastNotice(): number {
  try {
    return Number(localStorage.getItem(NOTICE_KEY)) || 0
  } catch {
    return 0
  }
}

function rememberNotice(height: number) {
  try {
    localStorage.setItem(NOTICE_KEY, String(height))
  } catch {
    // Without storage the skeleton leaves the notice out.
  }
}

/** Widths for the log's skeleton lines */
const LOG_WIDTHS = ['72%', '58%', '66%', '80%', '62%', '74%', '54%', '68%']

function LogRow({ line }: { line: LogLine }) {
  const scope = (line.scope ?? '').replace(/^pacenote:?/, '') || 'main'
  const socket = scope.startsWith('socket') || scope.startsWith('bolt')
  return (
    <div
      className={cn(
        'flex gap-3 rounded-sm px-1.5 hover:bg-accent/50',
        line.level === 'ERROR' && 'bg-status-failed/5'
      )}
    >
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {line.at ? formatDateTime(line.at).slice(6) : ''}
      </span>
      <span
        className={cn(
          'w-10 shrink-0 font-semibold',
          LEVEL_CLASS[line.level ?? 'INFO']
        )}
      >
        {line.level ?? ''}
      </span>
      <span
        className={cn(
          'w-16 shrink-0 truncate',
          socket ? 'text-status-running' : 'text-muted-foreground'
        )}
      >
        {scope}
      </span>
      <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">
        {line.message}
      </span>
    </div>
  )
}
