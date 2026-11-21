import type { SessionRow } from '@src/sessions/types'
import { Laptop, Plus } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonText } from '@/components/ui/skeleton'
import { useText } from '@/lib/i18n'
import { usePhone } from '@/lib/phone'
import { canOpen, otherView } from '@/lib/session-rows'
import { useOtherSessions, useSessions } from '@/lib/sessions'
import { cn } from '@/lib/utils'
import { sessionHref } from './session-open'
import { text } from './sessions-page.text'

/**
 * A session's page and New session with your sessions beside them, as
 * Settings lists its sections beside each one: to move between them, the
 * one open marked. A phone shows one screen at a time, and narrow, the page
 * takes the whole width.
 */
export function SessionsSplit({
  current,
  children,
}: {
  /** The session whose page is open */
  current?: string
  children: ReactNode
}) {
  const phone = usePhone()
  if (phone) return <>{children}</>
  return (
    <div className="@container/sessions flex h-full min-h-0">
      <SessionsNav current={current} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/**
 * The sessions: this Mac's open ones by project, then each of your other
 * Macs' open ones under its name, then this Mac's ended today
 */
function SessionsNav({ current }: { current?: string }) {
  const t = useText(text)
  const view = useSessions().data
  const others = useOtherSessions('nav').data ?? []
  const list = useRef<HTMLDivElement>(null)
  // The one open in sight, as it opens
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [current, view?.on])
  const item = (s: SessionRow) =>
    canOpen(s) && <NavSession key={s.id} s={s} active={s.id === current} />
  const theirs = others.flatMap(({ mac, view: there }) => {
    const open = there?.on
      ? otherView(mac.id, there).open.flatMap((g) => g.sessions)
      : []
    return open.length ? [{ mac, open }] : []
  })
  return (
    <nav
      aria-label={t.title}
      className="flex w-60 shrink-0 flex-col border-r border-sidebar-border @max-[48rem]/sessions:hidden"
    >
      <div className="flex items-center gap-1 pt-5 pr-2.5 pb-3 pl-5">
        <a
          href="#/sessions"
          className="min-w-0 flex-1 truncate rounded-sm text-heading focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {t.title}
        </a>
        <Button
          size="icon-sm"
          variant="ghost"
          asChild
          aria-label={t.newSession}
          title={t.newSession}
        >
          <a href="#/sessions/new">
            <Plus />
          </a>
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div ref={list} className="flex flex-col gap-4 px-2.5 pb-5">
          {!view ? (
            <NavSkeleton />
          ) : view.on ? (
            <>
              {view.open.map((g) => (
                <NavGroup key={g.key} label={g.name ?? t.notInProject}>
                  {g.sessions.map(item)}
                </NavGroup>
              ))}
              {theirs.map(({ mac, open }) => (
                <NavGroup key={mac.id} label={mac.name} mac>
                  {open.map(item)}
                </NavGroup>
              ))}
              {view.ended.length > 0 && (
                <NavGroup label={t.tabEnded}>{view.ended.map(item)}</NavGroup>
              )}
              {view.open.length === 0 &&
                theirs.length === 0 &&
                view.ended.length === 0 && (
                  <p className="px-2.5 text-meta text-muted-foreground">
                    {t.noneOpen}
                  </p>
                )}
            </>
          ) : null}
        </div>
      </ScrollArea>
    </nav>
  )
}

/** A project's sessions, or another Mac's, under its name */
function NavGroup({
  label,
  mac,
  children,
}: {
  label: string
  /** Another of your Macs: its name, with a Mac beside it */
  mac?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <p className="flex min-w-0 items-center gap-1.5 px-2.5 pb-1 text-caption text-muted-foreground/80">
        {mac && <Laptop aria-hidden="true" className="size-3 shrink-0" />}
        <span className="truncate">{label}</span>
      </p>
      {children}
    </div>
  )
}

/** A session: its state as a dot, and its title, to open its page */
function NavSession({ s, active }: { s: SessionRow; active: boolean }) {
  const t = useText(text)
  const state =
    s.state === 'working'
      ? t.working
      : s.state === 'turn'
        ? s.asks
          ? t.asks[s.asks]
          : t.yourTurn
        : s.state === 'ended'
          ? t.ended
          : undefined
  return (
    <a
      href={sessionHref(s.id)}
      aria-current={active ? 'page' : undefined}
      title={state ? `${s.title} · ${state}` : s.title}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-copy transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active
          ? 'bg-selected font-medium text-foreground'
          : 'text-muted-foreground hover:bg-selected/50 hover:text-foreground',
        s.state === 'ended' && !active && 'opacity-60'
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-4 shrink-0 place-items-center"
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            s.state === 'working'
              ? 'animate-pulse-dot bg-status-running'
              : s.state === 'turn'
                ? 'bg-primary'
                : s.state === 'ended'
                  ? 'border border-muted-foreground/50'
                  : 'bg-muted-foreground/40'
          )}
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{s.title}</span>
      {state && <span className="sr-only">{state}</span>}
    </a>
  )
}

/** The list before the Mac's answer: a project's name and a few sessions */
function NavSkeleton() {
  return (
    <div aria-hidden="true" className="motion-skeleton space-y-2 px-2.5">
      <SkeletonText className="text-caption" width="40%" />
      {[78, 62, 70].map((width, i) => (
        <SkeletonText key={i} className="text-copy" width={`${width}%`} />
      ))}
    </div>
  )
}
