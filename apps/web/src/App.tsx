import {
  ArrowLeft,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Swap } from '@/components/ui/motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { useTasksPush } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { BotPage } from './components/bot-page'
import {
  ResizeHandle,
  useStoredFlag,
  useStoredWidth,
  useWindowWidth,
} from './components/resize-handle'
import { Overview } from './components/overview'
import { RunDetail } from './components/run-detail'
import { RunList } from './components/run-list'
import { SearchField } from './components/search-field'
import { SettingsPage } from './components/settings-page'
import { Sidebar, type Section } from './components/sidebar'
import { StatusBar } from './components/status-bar'
import { TasksPage } from './components/tasks-page'
import { YouPage } from './components/you-page'
import { SetupWizard } from './components/setup/wizard'

/**
 * The Debug section is only in builds made for development: the Vite dev
 * server, or VITE_PACENOTE_DEBUG=1 (pnpm desktop). Release builds (pnpm
 * desktop:build, pnpm package:mac) leave its code out, since the bundler drops
 * the import, and even a build with it shows it only in development runs.
 */
const DebugPage =
  import.meta.env.DEV || import.meta.env.VITE_PACENOTE_DEBUG === '1'
    ? lazy(() =>
        import('./components/debug-page').then((module) => ({
          default: module.DebugPage,
        }))
      )
    : undefined
const showDebug = DebugPage !== undefined && !!window.pacenoteDesktop?.dev

type Route =
  | { page: 'overview' }
  | { page: 'runs'; id?: string }
  | {
      page: 'tasks'
      /** The task open in its row */
      id?: string
      /** A session's log, over the list */
      entry?: string
    }
  | {
      page: 'you'
      /** The area open in its row */
      id?: string
    }
  | { page: 'bot' }
  | { page: 'settings' }
  | { page: 'debug' }
  | { page: 'setup' }

/**
 * #/runs: the run list, #/runs/<id>: one run, #/tasks: your tasks,
 * #/tasks/<id>: one task open in its row (/log/<entry>: a session's log over
 * the list), #/you: where you contribute, #/you/<id>: one area open in its
 * row, #/bot: Pace's status and logs,
 * #/settings: Settings, #/setup: setting Pace up (the first run's wizard),
 * #/debug: Debug (development builds), otherwise: Overview
 */
function readRoute(): Route {
  const hash = window.location.hash
  const run = /^#\/runs\/([^/?#]+)/.exec(hash)?.[1]
  if (run) return { page: 'runs', id: decodeURIComponent(run) }
  if (hash.startsWith('#/runs')) return { page: 'runs' }
  const task = /^#\/tasks\/([^/?#]+)(?:\/log\/([^/?#]+))?/.exec(hash)
  if (task)
    return {
      page: 'tasks',
      id: decodeURIComponent(task[1]!),
      entry: task[2] ? decodeURIComponent(task[2]) : undefined,
    }
  if (hash.startsWith('#/tasks')) return { page: 'tasks' }
  const area = /^#\/you\/([^/?#]+)/.exec(hash)?.[1]
  if (area) return { page: 'you', id: decodeURIComponent(area) }
  if (hash.startsWith('#/you')) return { page: 'you' }
  if (hash.startsWith('#/bot')) return { page: 'bot' }
  if (hash.startsWith('#/settings')) return { page: 'settings' }
  if (hash.startsWith('#/setup')) return { page: 'setup' }
  if (hash.startsWith('#/debug') && showDebug) return { page: 'debug' }
  return { page: 'overview' }
}

function useRoute(): [Route, (hash: string) => void] {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return [route, (hash) => (window.location.hash = hash)]
}

/** Sidebar widths, and the window width below which it keeps only icons */
const SIDEBAR = { full: 224, compact: 64, below: 900 }
/** Run list width inside the content surface: default and splitter range */
const LIST_WIDTH = { default: 320, min: 260, max: 520 }
/** What the run detail keeps beside the list; narrower shows one at a time */
const DETAIL_MIN_WIDTH = 440
/** The content surface's margin to the window's right edge */
const SURFACE_MARGIN = 12

const isMac = /Mac/.test(navigator.platform)

export default function App() {
  const [route, go] = useRoute()
  const [q, setQ] = useState('')
  const windowWidth = useWindowWidth()
  const isMacDesktop = window.pacenoteDesktop?.platform === 'darwin'
  const fullScreen = useFullScreen()
  // An AI tool's work on your tasks shows everywhere as it happens.
  useTasksPush()
  const [collapsed, setCollapsed] = useStoredFlag(
    'pacenote.sidebar.collapsed',
    false
  )
  const compact = collapsed || windowWidth < SIDEBAR.below
  const section: Section = route.page === 'setup' ? 'overview' : route.page

  // Cmd+B shows or hides the sidebar's labels, as in most macOS apps.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'b' &&
        (isMac ? e.metaKey : e.ctrlKey) &&
        !e.shiftKey
      ) {
        e.preventDefault()
        setCollapsed(!collapsed)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // Searching is for runs, so typing moves to the run list.
  const search = (value: string) => {
    setQ(value)
    if (value && route.page !== 'runs') go('#/runs')
  }

  const surfaceWidth =
    windowWidth - (compact ? SIDEBAR.compact : SIDEBAR.full) - SURFACE_MARGIN

  // Setup takes the whole window; leaving it swaps the app back in.
  return (
    <TooltipProvider delayDuration={300}>
      <Swap id={route.page === 'setup' ? 'setup' : 'app'} className="h-full">
        {route.page === 'setup' ? (
          <SetupWizard onLeave={go} />
        ) : (
          <div className="flex h-full flex-col bg-sidebar">
            {/* Three columns keep the search centered on the window; the
                left one clears the traffic lights and holds the sidebar
                toggle. In full screen there are none, and the toggle lines
                up with the sidebar's icons. */}
            <header className="titlebar-drag grid h-12 shrink-0 grid-cols-[1fr_minmax(0,520px)_1fr] items-center gap-3 px-3">
              <div
                className={cn(
                  'motion-layout flex',
                  isMacDesktop && (fullScreen ? 'pl-1' : 'pl-[72px]')
                )}
              >
                <SidebarToggle
                  compact={compact}
                  forced={windowWidth < SIDEBAR.below}
                  onToggle={() => setCollapsed(!collapsed)}
                />
              </div>
              <SearchField value={q} onChange={search} />
              <div />
            </header>
            <div className="flex min-h-0 flex-1">
              <Sidebar
                active={section}
                compact={compact}
                onNavigate={(next) =>
                  go(next === 'overview' ? '#/' : `#/${next}`)
                }
                showDebug={showDebug}
              />
              {/* One surface holds the whole screen. Its parts are told
                  apart by space and hairlines, not by cards of their own.
                  Moving to another section swaps what it shows. */}
              <main
                className="content-surface mr-3 min-w-0 flex-1 overflow-hidden rounded-[20px] bg-card"
                style={{ boxShadow: 'var(--card-shadow)' }}
              >
                <Swap id={route.page} className="h-full">
                  {route.page === 'bot' ? (
                    <BotPage />
                  ) : route.page === 'tasks' ? (
                    // The same list whether a task is open or not, so its
                    // tab and scroll stay as they were
                    <TasksPage openId={route.id} logEntry={route.entry} />
                  ) : route.page === 'you' ? (
                    <YouPage openId={route.id} />
                  ) : route.page === 'settings' ? (
                    <SettingsPage />
                  ) : route.page === 'debug' ? (
                    <Suspense>{DebugPage && <DebugPage />}</Suspense>
                  ) : route.page === 'runs' ? (
                    <RunsPage
                      q={q}
                      selectedId={route.id}
                      width={surfaceWidth}
                      onSelect={(id) => go(id ? `#/runs/${id}` : '#/runs')}
                    />
                  ) : (
                    <ScrollArea className="h-full">
                      <Overview />
                    </ScrollArea>
                  )}
                </Swap>
              </main>
            </div>
            <StatusBar onOpenRoute={go} />
          </div>
        )}
      </Swap>
    </TooltipProvider>
  )
}

/** Whether the window is in macOS full screen, where its traffic lights hide */
function useFullScreen(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const bridge = window.pacenoteDesktop?.fullScreen
    if (!bridge) return
    void bridge.get().then(setOn)
    return bridge.onChange(setOn)
  }, [])
  return on
}

/**
 * Shows or hides the sidebar's labels, like Cmd+B. A window too narrow for them
 * keeps the icons only, and the button says so instead of doing nothing.
 */
function SidebarToggle({
  compact,
  forced,
  onToggle,
}: {
  compact: boolean
  /** The window is too narrow for the labels */
  forced: boolean
  onToggle: () => void
}) {
  const key = isMac ? '⌘B' : 'Ctrl+B'
  const label = compact ? 'Show sidebar labels' : 'Hide sidebar labels'
  return (
    <Tooltip
      side="bottom"
      content={
        forced ? 'The window is too narrow for labels' : `${label} (${key})`
      }
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={!compact}
        aria-disabled={forced || undefined}
        onClick={forced ? undefined : onToggle}
        className={cn(
          'grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors',
          forced ? 'opacity-50' : 'hover:bg-selected/50 hover:text-foreground'
        )}
      >
        {compact ? (
          <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} />
        ) : (
          <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
        )}
      </button>
    </Tooltip>
  )
}

/**
 * The run list and the selected run, side by side in the one surface with a
 * line between them. When the surface is too narrow for both, it shows one at a
 * time: the list, or the run with a way back.
 */
function RunsPage({
  q,
  selectedId,
  width,
  onSelect,
}: {
  q: string
  selectedId?: string
  width: number
  onSelect: (id?: string) => void
}) {
  const [listWidth, setListWidth] = useStoredWidth(
    'pacenote.runList.width',
    LIST_WIDTH.default
  )
  const listMax = Math.max(
    LIST_WIDTH.min,
    Math.min(LIST_WIDTH.max, width - DETAIL_MIN_WIDTH)
  )
  const listShown = Math.min(listMax, Math.max(LIST_WIDTH.min, listWidth))
  const split = width - LIST_WIDTH.min >= DETAIL_MIN_WIDTH

  if (!split)
    return selectedId ? (
      <div className="flex h-full flex-col">
        <button
          type="button"
          onClick={() => onSelect()}
          className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Runs
        </button>
        <div className="min-h-0 flex-1">
          <RunDetail key={selectedId} id={selectedId} />
        </div>
      </div>
    ) : (
      <RunList q={q} selectedId={selectedId} onSelect={onSelect} />
    )

  return (
    <div className="flex h-full">
      <div
        className="relative shrink-0 border-r border-border"
        style={{ width: listShown }}
      >
        <RunList q={q} selectedId={selectedId} onSelect={onSelect} />
        <ResizeHandle
          value={listShown}
          min={LIST_WIDTH.min}
          max={listMax}
          onChange={setListWidth}
          onReset={() => setListWidth(LIST_WIDTH.default)}
          label="Resize run list"
        />
      </div>
      <div className="min-w-0 flex-1">
        {selectedId ? (
          <RunDetail key={selectedId} id={selectedId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <MousePointerClick className="size-5" strokeWidth={1.75} />
            Pick a run to see what it did: what Pace was asked and how it
            answered, or what a collection found.
          </div>
        )}
      </div>
    </div>
  )
}
