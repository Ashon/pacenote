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
  Laptop,
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
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { KeyHint, useTabKeys } from '@/components/ui/key-hint'
import {
  SkeletonBlock,
  SkeletonText,
  SkeletonWord,
} from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { remoteMac } from '@/lib/desktop'
import { formatDateTime, formatRelative, homePath } from '@/lib/format'
import { useLocale, useText } from '@/lib/i18n'
import { usePhone } from '@/lib/phone'
import { ariaKeys, KEYS } from '@/lib/shortcuts'
import { canOpen, otherView } from '@/lib/session-rows'
import {
  useOtherSessions,
  useSessionTasks,
  useSessions,
  useShowSessions,
} from '@/lib/sessions'
import { cn } from '@/lib/utils'
import { OpenButton, sessionHref, StateMark, toolWhere } from './session-open'
import { LinkTaskDialog } from './session-task'
import { text } from './sessions-page.text'
import { resumeCommand } from './task-sessions'

const GRID =
  'mt-7 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-copy'

/**
 * Sessions: the Claude Code and Codex sessions on this Mac, by your area or
 * repository, each opened in place or where it runs, then those on your other
 * Macs linked to this one, under each Mac's name; before it is on, a card
 * that says what it reads and turns it on
 */
export function SessionsPage() {
  const t = useText(text)
  const phone = usePhone()
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
          <SessionsSkeleton phone={phone} />
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
  // A phone's row opens the session's screen, and its bar has New session
  const phone = usePhone()
  const [tab, setTab] = useState<'open' | 'ended'>('open')
  const [opened, setOpened] = useState<string[]>([])
  // Your other Macs' sessions, each row by its page's id here
  const others = useOtherSessions().data ?? []
  const theirs = others.map((other) => ({
    ...other,
    view: other.view && otherView(other.mac.id, other.view),
  }))
  // With your other Macs here, each Mac's sessions go under its name
  const split = theirs.length > 0
  const toggle = (id: string) =>
    setOpened((ids) =>
      ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]
    )
  /** A row the briefing named: opened and scrolled to; on a phone, its page */
  const pick = (id: string) => {
    if (phone) {
      window.location.hash = sessionHref(id)
      return
    }
    setTab('open')
    setOpened((ids) => (ids.includes(id) ? ids : [...ids, id]))
    requestAnimationFrame(() =>
      document
        .getElementById(rowId(id))
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    )
  }
  /** A session's row; mac: the other Mac it is on, by its name */
  const rows = (mac?: string) => (row: SessionRow, index: number) =>
    phone ? (
      <PhoneRow key={row.id} s={row} first={index === 0} />
    ) : (
      <SessionRowItem
        key={row.id}
        s={row}
        mac={mac}
        open={opened.includes(row.id)}
        onToggle={() => toggle(row.id)}
      />
    )
  const groups = (open: SessionGroup[], mac?: string) =>
    open.map((g) => (
      <GroupSection key={g.key} g={g} level={split ? 3 : 2}>
        {g.sessions.map(rows(mac))}
      </GroupSection>
    ))
  const ended = (list: SessionRow[], mac?: string) => (
    <ul className={phone ? 'mt-3' : 'mt-5'}>{list.map(rows(mac))}</ul>
  )
  const shown = theirs.flatMap((other) =>
    other.view ? [{ name: other.mac.name, view: other.view }] : []
  )
  const total = (key: 'open' | 'ended') =>
    view.counts[key] +
    shown.reduce((sum, other) => sum + other.view.counts[key], 0)
  // What to answer or follow, on any of your Macs
  const briefed = [
    ...view.open.flatMap((g) =>
      g.sessions.map((s) => ({ s, group: g.name ?? t.notInProject }))
    ),
    ...shown.flatMap((other) =>
      other.view.open.flatMap((g) =>
        g.sessions.map((s) => ({
          s,
          group: `${other.name} · ${g.name ?? t.notInProject}`,
        }))
      )
    ),
  ]
  // ⇧⌘[ and ⇧⌘] between the tabs, their keys on them
  const endedTab = view.listed || shown.some((other) => other.view.listed)
  const keysTo = useTabKeys<typeof tab>(
    endedTab ? ['open', 'ended'] : ['open'],
    tab,
    setTab
  )
  return (
    <Page
      title={t.title}
      meta={[
        remote
          ? t.metaOn(remote, view.counts.open, view.counts.working)
          : t.meta(view.counts.open, view.counts.working),
        ...shown.map((other) =>
          t.onOtherMac(other.name, other.view.counts.open)
        ),
      ].join(' · ')}
      action={
        !phone && (
          <Button size="sm" variant="outline" className="relative" asChild>
            <a
              href="#/sessions/new"
              aria-keyshortcuts={ariaKeys(KEYS.newSession)}
            >
              <Plus />
              {t.newSession}
              <KeyHint keys={KEYS.newSession} />
            </a>
          </Button>
        )
      }
    >
      <Briefing entries={briefed} onPick={pick} />
      {/* Narrow, across its row, as a phone's other segments are */}
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        className="@max-md:w-full"
      >
        <TabsList className="mt-5 @max-md:w-full">
          <TabsTrigger value="open" className="@max-md:flex-1">
            {t.tabOpen} {total('open')}
            <KeyHint keys={keysTo('open')} />
          </TabsTrigger>
          {endedTab && (
            <TabsTrigger value="ended" className="@max-md:flex-1">
              {t.tabEnded} {total('ended')}
              <KeyHint keys={keysTo('ended')} />
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>
      {!view.listed && (
        <p className="mt-4 text-meta text-muted-foreground">{t.notListed}</p>
      )}
      {!split ? (
        tab === 'open' ? (
          view.open.length ? (
            groups(view.open)
          ) : (
            <None>{t.noneOpen}</None>
          )
        ) : view.ended.length ? (
          ended(view.ended)
        ) : (
          <None>{t.noneEnded}</None>
        )
      ) : (
        <>
          <MacBlock
            name={t.thisMac}
            line={t.macLine(view.counts.open, view.counts.working)}
          >
            {tab === 'open' ? (
              view.open.length ? (
                groups(view.open)
              ) : (
                <None>{t.noneOpen}</None>
              )
            ) : view.ended.length ? (
              ended(view.ended)
            ) : (
              <None>{t.noneEnded}</None>
            )}
          </MacBlock>
          {theirs.map(({ mac, view: there, missing }) => (
            <MacBlock
              key={mac.id}
              name={mac.name}
              line={there && t.macLine(there.counts.open, there.counts.working)}
            >
              {!there ? (
                <None>{t.macMissing[missing ?? 'unreachable']}</None>
              ) : tab === 'open' ? (
                there.open.length ? (
                  groups(there.open, mac.name)
                ) : (
                  <None>{t.noneOpenThere}</None>
                )
              ) : there.ended.length ? (
                ended(there.ended, mac.name)
              ) : (
                <None>{t.noneEndedThere}</None>
              )}
            </MacBlock>
          ))}
        </>
      )}
    </Page>
  )
}

function None({ children }: { children: ReactNode }) {
  return <p className="mt-7 text-copy text-muted-foreground">{children}</p>
}

/**
 * The sessions on one of your Macs, under its name: this one's first, then
 * each of your other Macs linked to it, or why it shows none
 */
function MacBlock({
  name,
  line,
  children,
}: {
  name: string
  line?: string
  children: ReactNode
}) {
  return (
    <section aria-label={name} className="mt-9">
      {/* Narrow, what it counts goes under its name, whole */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border pb-2">
        <Laptop
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <h2 className="text-section">{name}</h2>
        <span className="flex-1 @max-md:hidden" />
        {line && (
          <span className="text-meta text-muted-foreground @max-md:basis-full">
            {line}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

const rowId = (id: string) => `session-${id.replace(/[^\w-]/g, '-')}`

/** Your turn and working, at the top, each a link to its row */
function Briefing({
  entries,
  onPick,
}: {
  /** The open sessions, each with its group's name */
  entries: { s: SessionRow; group: string }[]
  onPick: (id: string) => void
}) {
  const t = useText(text)
  const turn = entries.filter(({ s }) => s.state === 'turn')
  const working = entries.filter(({ s }) => s.state === 'working')
  if (!turn.length && !working.length) return null
  // Cut to the line with an ellipsis, the title first, as a row's words are
  const link = (s: SessionRow) => (
    <button
      type="button"
      className="min-w-0 truncate rounded-sm text-left hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
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
          <dd className="flex min-w-0 items-baseline">
            {link(turn[0].s)}
            <span className="min-w-0 shrink-[4] truncate whitespace-pre text-muted-foreground">
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
          <dd className="flex min-w-0 items-baseline">
            {working.slice(0, 2).map(({ s }, index) => (
              <span key={s.id} className="flex min-w-0 items-baseline">
                {index > 0 && (
                  <span className="whitespace-pre text-muted-foreground">
                    ,{' '}
                  </span>
                )}
                {link(s)}
              </span>
            ))}
            {working.length > 2 && (
              <span className="shrink-0 whitespace-pre text-muted-foreground">
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
  level = 2,
  children,
}: {
  g: SessionGroup
  /** Under a Mac's name (MacBlock), its heading is the next level down */
  level?: 2 | 3
  children: ReactNode
}) {
  const t = useText(text)
  const working = g.sessions.filter((s) => s.state === 'working').length
  const turn = g.sessions.filter((s) => s.state === 'turn').length
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <section className={level === 3 ? 'mt-6' : 'mt-7'}>
      {/* Narrow, what it counts goes under its name, whole */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <Heading
          className={cn(
            'text-section',
            !g.name && 'font-medium text-muted-foreground'
          )}
        >
          {g.name ?? t.notInProject}
        </Heading>
        {g.repo && (
          <span className="font-mono text-meta text-muted-foreground">
            {g.repo}
          </span>
        )}
        <span className="flex-1 @max-md:hidden" />
        <span className="text-meta text-muted-foreground @max-md:basis-full">
          {t.groupLine(g.sessions.length, working, turn)}
        </span>
      </div>
      <ul className="mt-2 @max-md:mt-1">{children}</ul>
    </section>
  )
}

function SessionRowItem({
  s,
  mac,
  open,
  onToggle,
}: {
  s: SessionRow
  /** The other Mac it is on, by its name: its task and command are there */
  mac?: string
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
      {open && <Opened s={s} mac={mac} />}
    </li>
  )
}

/**
 * A session's row on a phone: the whole row opens its screen, as a task's
 * row does in Todo, with its words on a line each and its pills under them
 */
function PhoneRow({ s, first }: { s: SessionRow; first: boolean }) {
  const t = useText(text)
  const last = s.typed[0]
  const pills = s.branch || s.task || s.state !== 'quiet'
  return (
    // The row's tint reaches past the text; the line between rows does not
    <li
      id={rowId(s.id)}
      className={cn('-mx-3', s.state === 'ended' && 'opacity-60')}
    >
      {!first && (
        <div aria-hidden="true" className="mx-3 border-t border-border" />
      )}
      <a
        href={sessionHref(s.id)}
        className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 active:bg-selected/60"
      >
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-row">{s.title}</p>
          <p className="mt-1 truncate text-meta text-muted-foreground">
            {[toolWhere(s, t), formatRelative(s.lastAt)].join(' · ')}
          </p>
          {pills && (
            <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-meta text-muted-foreground">
              {s.state !== 'quiet' && <StateMark s={s} />}
              {s.branch && (
                <span className="max-w-full truncate font-mono">
                  {s.branch}
                </span>
              )}
              {s.task && (
                <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-muted px-2 py-px font-medium">
                  <ListChecks aria-hidden="true" className="size-3 shrink-0" />
                  <span className="truncate">{s.task.title}</span>
                </span>
              )}
            </p>
          )}
          {last && (
            <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
              <MessageSquare aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">“{last.text}”</span>
            </p>
          )}
        </div>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </a>
    </li>
  )
}

/**
 * Sessions before the Mac's answer: its line at the top, its segments, a
 * project's heading and its rows, each as tall as it will be
 */
function SessionsSkeleton({ phone }: { phone: boolean }) {
  return (
    <div aria-hidden="true" className="motion-skeleton">
      <SkeletonBlock className="mt-5 h-9 w-56 rounded-lg @max-md:w-full" />
      <SkeletonText className="mt-7 text-section" width="9rem" />
      <ul className={phone ? 'mt-1' : 'mt-2'}>
        {[78, 52, 66, 44].map((width, i) => (
          <li
            key={i}
            className={cn(
              phone ? 'py-3' : 'border-t border-border py-3.5 pl-6',
              phone && i > 0 && 'border-t border-border'
            )}
          >
            <SkeletonText
              className={phone ? 'text-row' : 'text-section leading-snug'}
              width={`${width}%`}
            />
            <SkeletonText className="mt-1 text-meta" width="46%" />
            <SkeletonText className="mt-1.5 text-meta" width="34%" />
          </li>
        ))}
      </ul>
    </div>
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

/**
 * A session opened in place: what you typed, where, and its task. One on
 * another of your Macs leaves its task and its resume command to that Mac.
 */
function Opened({ s, mac }: { s: SessionRow; mac?: string }) {
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
        {mac ? (
          s.task && (
            <Line label={t.task}>
              <a
                href={`#/tasks/${encodeURIComponent(s.task.id)}`}
                className="hover:text-primary"
              >
                {s.task.title}
              </a>
            </Line>
          )
        ) : (
          <TaskLines s={s} />
        )}
        <Line label={t.started}>
          <span>{formatDateTime(s.startedAt)}</span>
        </Line>
        {/* A command for the Mac's terminal: of no use on a device, or on
            a Mac the session is not on */}
        {!remoteMac() && !mac && (
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
