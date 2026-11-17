import type {
  SessionGroup,
  SessionRow,
  SessionsView,
} from '@src/sessions/types'
import { CLI_NAMES } from '@src/tasks/own-ai'
import {
  AppWindow,
  ChevronRight,
  Copy,
  Link2,
  ListChecks,
  MessageSquare,
  Plus,
  SquareTerminal,
  Unlink,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Page } from '@/components/page'
import { Line } from '@/components/task-line'
import { TaskRowsSkeleton } from '@/components/tasks-list'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { SkeletonWord } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { remoteMac } from '@/lib/desktop'
import { formatDateTime, formatRelative, homePath } from '@/lib/format'
import { useLocale, useText } from '@/lib/i18n'
import { canOpen } from '@/lib/session-rows'
import { useSessionTasks, useSessions, useShowSessions } from '@/lib/sessions'
import { cn } from '@/lib/utils'
import { OpenButton, StateMark, toolWhere } from './session-open'
import { LinkTaskDialog } from './session-task'
import { text } from './sessions-page.text'
import { resumeCommand } from './task-sessions'

const GRID =
  'mt-7 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-copy'

/**
 * Sessions: the Claude Code and Codex sessions on this Mac, by your area or
 * repository, each opened in place or where it runs; before it is on, a card
 * that says what it reads and turns it on
 */
export function SessionsPage() {
  const t = useText(text)
  const query = useSessions()
  const view = query.data
  if (!view)
    return (
      <Page title={t.title} meta={<SkeletonWord width="9rem" />}>
        {query.error ? (
          <InlineError
            className="mt-7"
            error={(query.error as Error).message}
          />
        ) : (
          <div className="mt-7">
            <TaskRowsSkeleton count={4} />
          </div>
        )}
      </Page>
    )
  if (!view.on) return <SessionsOff view={view} />
  return <SessionsOn view={view} />
}

function SessionsOn({ view }: { view: SessionsView }) {
  const t = useText(text)
  // From your phone or iPad: the Mac they are on, by its name
  const remote = remoteMac()
  const [tab, setTab] = useState<'open' | 'ended'>('open')
  const [opened, setOpened] = useState<string[]>([])
  const toggle = (id: string) =>
    setOpened((ids) =>
      ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]
    )
  /** A row the briefing named: opened, and scrolled to */
  const pick = (id: string) => {
    setTab('open')
    setOpened((ids) => (ids.includes(id) ? ids : [...ids, id]))
    requestAnimationFrame(() =>
      document
        .getElementById(rowId(id))
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    )
  }
  const rows = (row: SessionRow) => (
    <SessionRowItem
      key={row.id}
      s={row}
      open={opened.includes(row.id)}
      onToggle={() => toggle(row.id)}
    />
  )
  return (
    <Page
      title={t.title}
      meta={
        remote
          ? t.metaOn(remote, view.counts.open, view.counts.working)
          : t.meta(view.counts.open, view.counts.working)
      }
      action={
        <Button size="sm" variant="outline" asChild>
          <a href="#/sessions/new">
            <Plus />
            {t.newSession}
          </a>
        </Button>
      }
    >
      <Briefing view={view} onPick={pick} />
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList className="mt-5">
          <TabsTrigger value="open">
            {t.tabOpen} {view.counts.open}
          </TabsTrigger>
          {view.listed && (
            <TabsTrigger value="ended">
              {t.tabEnded} {view.counts.ended}
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>
      {!view.listed && (
        <p className="mt-4 text-meta text-muted-foreground">{t.notListed}</p>
      )}
      {tab === 'open' ? (
        view.open.length ? (
          view.open.map((g) => (
            <GroupSection key={g.key} g={g}>
              {g.sessions.map(rows)}
            </GroupSection>
          ))
        ) : (
          <p className="mt-7 text-copy text-muted-foreground">{t.noneOpen}</p>
        )
      ) : view.ended.length ? (
        <ul className="mt-5">{view.ended.map(rows)}</ul>
      ) : (
        <p className="mt-7 text-copy text-muted-foreground">{t.noneEnded}</p>
      )}
    </Page>
  )
}

const rowId = (id: string) => `session-${id.replace(/[^\w-]/g, '-')}`

/** Your turn and working, at the top, each a link to its row */
function Briefing({
  view,
  onPick,
}: {
  view: SessionsView
  onPick: (id: string) => void
}) {
  const t = useText(text)
  const all = view.open.flatMap((g) =>
    g.sessions.map((s) => ({ s, group: g.name ?? t.notInProject }))
  )
  const turn = all.filter(({ s }) => s.state === 'turn')
  const working = all.filter(({ s }) => s.state === 'working')
  if (!turn.length && !working.length) return null
  const link = (s: SessionRow) => (
    <button
      type="button"
      className="rounded-sm text-left hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={() => onPick(s.id)}
    >
      {s.title}
    </button>
  )
  return (
    <dl className={GRID}>
      {turn[0] && (
        <>
          <dt className="text-muted-foreground">{t.yourTurnLabel}</dt>
          <dd className="truncate">
            {link(turn[0].s)}
            <span className="text-muted-foreground">
              {' · '}
              {turn[0].group} · {formatRelative(turn[0].s.lastAt)}
              {turn.length > 1 && ` · ${t.andMore(turn.length - 1)}`}
            </span>
          </dd>
        </>
      )}
      {working.length > 0 && (
        <>
          <dt className="text-muted-foreground">{t.workingLabel}</dt>
          <dd className="truncate">
            {working.slice(0, 2).map(({ s }, index) => (
              <span key={s.id}>
                {index > 0 && <span className="text-muted-foreground">, </span>}
                {link(s)}
              </span>
            ))}
            {working.length > 2 && (
              <span className="text-muted-foreground">
                {' · '}
                {t.andMore(working.length - 2)}
              </span>
            )}
          </dd>
        </>
      )}
    </dl>
  )
}

function GroupSection({
  g,
  children,
}: {
  g: SessionGroup
  children: ReactNode
}) {
  const t = useText(text)
  const working = g.sessions.filter((s) => s.state === 'working').length
  const turn = g.sessions.filter((s) => s.state === 'turn').length
  return (
    <section className="mt-7">
      <div className="flex items-baseline gap-2.5">
        <h2
          className={cn(
            'text-section',
            !g.name && 'font-medium text-muted-foreground'
          )}
        >
          {g.name ?? t.notInProject}
        </h2>
        {g.repo && (
          <span className="font-mono text-meta text-muted-foreground">
            {g.repo}
          </span>
        )}
        <span className="flex-1" />
        <span className="text-meta text-muted-foreground">
          {t.groupLine(g.sessions.length, working, turn)}
        </span>
      </div>
      <ul className="mt-2">{children}</ul>
    </section>
  )
}

function SessionRowItem({
  s,
  open,
  onToggle,
}: {
  s: SessionRow
  open: boolean
  onToggle: () => void
}) {
  const t = useText(text)
  const last = s.typed[0]
  return (
    <li
      id={rowId(s.id)}
      className={cn(
        'border-t border-border py-3.5',
        s.state === 'ended' && !open && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 pl-6">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="group -ml-6 flex items-start gap-2 rounded-sm text-left text-section leading-snug focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-90'
              )}
            />
            <span className="group-hover:underline">{s.title}</span>
          </button>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
            {/* A quiet one says how long on its pill */}
            {s.state === 'quiet'
              ? toolWhere(s, t)
              : [toolWhere(s, t), formatRelative(s.lastAt)].join(' · ')}
            <StateMark s={s} />
            {s.branch && <span className="font-mono">{s.branch}</span>}
            {s.task && (
              <a
                href={`#/tasks/${encodeURIComponent(s.task.id)}`}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-px font-medium hover:text-foreground"
              >
                <ListChecks aria-hidden="true" className="size-3" />
                {s.task.title}
              </a>
            )}
          </p>
          {!open && last && (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
              <MessageSquare aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">“{last.text}”</span>
            </p>
          )}
        </div>
        {canOpen(s) && (
          <div className="flex shrink-0 items-center gap-1.5">
            <OpenButton s={s} />
          </div>
        )}
      </div>
      {open && <Opened s={s} />}
    </li>
  )
}

/**
 * The task a session is for: linked (Unlink), or not a task yet (link it to
 * one, or make one of it), with the task it looks like to say yes or no to
 */
function TaskLines({ s }: { s: SessionRow }) {
  const t = useText(text)
  const act = useSessionTasks()
  const [error, setError] = useState<string>()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const run = (done: Promise<string | undefined>) => {
    setBusy(true)
    setError(undefined)
    void done.then(setError).finally(() => setBusy(false))
  }
  const action = (label: string, Icon: typeof Link2, onClick: () => void) => (
    <Button
      size="xs"
      variant="ghost"
      className="text-primary"
      disabled={busy}
      onClick={onClick}
    >
      <Icon />
      {label}
    </Button>
  )
  return (
    <>
      {s.task ? (
        <Line
          label={t.task}
          actions={action(t.unlink, Unlink, () => run(act.unlink(s.id)))}
        >
          <a
            href={`#/tasks/${encodeURIComponent(s.task.id)}`}
            className="hover:text-primary"
          >
            {s.task.title}
          </a>
        </Line>
      ) : (
        <Line
          label={t.task}
          actions={
            <>
              {action(t.linkToTask, Link2, () => setPicking(true))}
              {action(t.makeTask, Plus, () =>
                run(act.makeTask(s.id).then((result) => result.error))
              )}
            </>
          }
        >
          <span className="text-muted-foreground">{t.notATask}</span>
        </Line>
      )}
      {!s.task && s.looksLike && (
        <Line
          label={t.looksLike}
          actions={
            <>
              {action(t.link, Link2, () =>
                run(act.answer(s.looksLike!.id, true).then(() => undefined))
              )}
              {action(t.notIt, X, () =>
                run(act.answer(s.looksLike!.id, false).then(() => undefined))
              )}
            </>
          }
        >
          <a
            href={`#/tasks/${encodeURIComponent(s.looksLike.task.id)}`}
            className="hover:text-primary"
          >
            {s.looksLike.task.title}
          </a>
        </Line>
      )}
      <InlineError error={error} className="py-1" />
      {picking && (
        <LinkTaskDialog
          s={s}
          onClose={() => setPicking(false)}
          onPick={(task) => act.link(s.id, task)}
        />
      )}
    </>
  )
}

function CopyResume({ s }: { s: SessionRow }) {
  const t = useText(text)
  const command = `${resumeCommand(s.tool)} ${s.session}`
  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={t.copyResume(command)}
      onClick={() => void navigator.clipboard.writeText(command)}
    >
      <Copy />
      <span className="font-mono text-meta">
        {resumeCommand(s.tool)} {s.session.slice(0, 8)}…
      </span>
    </Button>
  )
}

/** A session opened in place: what you typed, where, and its task */
function Opened({ s }: { s: SessionRow }) {
  const t = useText(text)
  return (
    <div className="flex flex-col gap-2 pt-2.5 pl-6">
      <div className="flex flex-col gap-0.5 rounded-xl bg-well px-3.5 py-3">
        {s.typed.length > 0 && (
          <div className="grid min-h-[30px] grid-cols-[6rem_minmax(0,1fr)_auto] items-start gap-3 text-body">
            <span className="pt-1.5 text-meta text-muted-foreground">
              {t.youAsked}
            </span>
            <span className="flex min-w-0 flex-col gap-1 py-1">
              {s.typed.map((typed, index) => (
                <span key={index} className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate select-text">{typed.text}</span>
                  {typed.at && (
                    <span className="shrink-0 text-meta text-muted-foreground">
                      {formatRelative(typed.at)}
                    </span>
                  )}
                </span>
              ))}
            </span>
            <span />
          </div>
        )}
        {s.branch && (
          <Line label={t.branch}>
            <span className="font-mono select-text">{s.branch}</span>
          </Line>
        )}
        <Line label={t.folder}>
          <span className="font-mono select-text">{homePath(s.cwd)}</span>
        </Line>
        <TaskLines s={s} />
        <Line label={t.started}>
          <span>{formatDateTime(s.startedAt)}</span>
        </Line>
        {/* A command for the Mac's terminal: of no use on a device */}
        {!remoteMac() && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            <CopyResume s={s} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Before Sessions is on: what it would show, what it reads, and a switch */
function SessionsOff({ view }: { view: SessionsView }) {
  const t = useText(text)
  const locale = useLocale()
  const show = useShowSessions()
  const [busy, setBusy] = useState(false)
  const list = (items: string[]) =>
    new Intl.ListFormat(locale, { type: 'conjunction' }).format(items)
  const found = view.found
  const tools = [
    {
      icon: AppWindow,
      title: CLI_NAMES.claude,
      body: t.claudeOpen(
        found?.claude.open ?? 0,
        list((found?.claude.where ?? []).map((where) => t.inWhere[where]))
      ),
    },
    {
      icon: SquareTerminal,
      title: CLI_NAMES.codex,
      body: t.codexToday(found?.codex.today ?? 0),
    },
  ]
  return (
    <Page title={t.title}>
      <section className="mt-5 rounded-xl bg-card-accent px-5 pt-4 pb-3">
        <h2 className="text-section">{t.offTitle}</h2>
        <p className="mt-0.5 max-w-[44rem] text-meta text-muted-foreground">
          {t.offLead}
        </p>
        <ul className="mt-3 flex flex-col divide-y divide-border border-t border-border">
          {tools.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-center gap-3 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-primary [&_svg]:size-4">
                <Icon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-row">{title}</p>
                <p className="text-meta text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <footer className="mt-1 flex items-center gap-2 border-t border-border pt-3">
          <p className="min-w-0 flex-1 text-meta text-muted-foreground">
            {/* The first read of the logs can take a while */}
            {busy ? t.reading : t.offFoot}
          </p>
          <Button
            variant="ghost"
            onClick={() => (window.location.hash = '#/tasks')}
          >
            {t.notNow}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void show().finally(() => setBusy(false))
            }}
          >
            {t.show}
          </Button>
        </footer>
      </section>
    </Page>
  )
}
