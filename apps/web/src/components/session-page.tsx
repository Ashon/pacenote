import type {
  SessionAsk,
  SessionLive,
  SessionMode,
  SessionTalk,
} from '@src/sessions/types'
import { CLI_NAMES } from '@src/tasks/own-ai'
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  GitFork,
  ListChecks,
  MoreHorizontal,
  Power,
  ShieldCheck,
  ShieldQuestion,
  Square,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InlineError } from '@/components/ui/inline-error'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonBlock, SkeletonText } from '@/components/ui/skeleton'
import { remoteMac } from '@/lib/desktop'
import { formatRelative, homePath } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { usePhone } from '@/lib/phone'
import { canShow } from '@/lib/session-rows'
import { useSessionActions, useSessionTalk } from '@/lib/sessions'
import { cn } from '@/lib/utils'
import { NowItem, TalkItems } from './session-items'
import { ShowButton, StateMark, toolWhere, whereName } from './session-open'
import { text } from './session-page.text'
import { text as listText } from './sessions-page.text'
import { resumeCommand } from './task-sessions'

/** Close enough to the end to follow what comes next */
const FOLLOW_PX = 80

/**
 * A session's page (V1): its conversation from its tool's own log as it goes,
 * what it asks, and where you type to it: the composer, for a Claude Code
 * session Pacenote runs or that runs nowhere now (V2); a bar for one open
 * somewhere else, with a copy to continue here (V4); one for Codex's
 */
export function SessionPage({ id }: { id: string }) {
  const t = useText(text)
  const l = useText(listText)
  const phone = usePhone()
  const query = useSessionTalk(id)
  const talk = query.data
  const scroller = useRef<HTMLDivElement>(null)
  /** At the end: what comes next scrolls into sight */
  const following = useRef(true)
  const loaded = talk !== undefined
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const onScroll = () => {
      following.current =
        element.scrollHeight - element.scrollTop - element.clientHeight <
        FOLLOW_PX
    }
    element.addEventListener('scroll', onScroll)
    return () => element.removeEventListener('scroll', onScroll)
  }, [loaded])
  const live = talk?.live
  const draft = useDraft(live, talk?.items.length ?? 0)
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && following.current) element.scrollTop = element.scrollHeight
  }, [
    talk?.items.length,
    live?.ask?.id,
    live?.step?.text,
    live?.busy,
    live?.doing,
    draft?.length,
  ])

  if (talk === undefined) return <TalkSkeleton phone={phone} />
  if (talk === null)
    return (
      <div className="mx-auto max-w-4xl px-10 py-9">
        <p className="text-copy text-muted-foreground">{t.notHere}</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <a href="#/sessions">{t.backToSessions}</a>
        </Button>
      </div>
    )

  const { row, items } = talk
  const tool = CLI_NAMES[row.tool]
  // One open somewhere else works there: said at the end, as it can be
  const workingThere =
    !live?.busy && row.state === 'working' && talk.typeIn !== 'here'
      ? whereName(row, l)
      : undefined
  return (
    <div className="flex h-full flex-col">
      <ScrollArea viewportRef={scroller} className="min-h-0 flex-1">
        <div className="@container mx-auto max-w-4xl px-10 pt-9 pb-6">
          <nav
            data-page-crumbs
            className="flex items-center gap-1.5 text-meta text-muted-foreground"
          >
            <a href="#/sessions" className="hover:text-foreground">
              {l.title}
            </a>
            <ChevronRight aria-hidden="true" className="size-3.5" />
            <span>{talk.group ?? l.notInProject}</span>
          </nav>
          <header className="mt-2 flex items-start gap-3">
            <h1 data-page-title className="min-w-0 flex-1 text-title">
              {row.title}
            </h1>
            {/* On a phone its bar has these (More) */}
            {!phone && <SessionMenu talk={talk} />}
          </header>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
            {toolWhere(row, l)}
            <StateMark s={row} />
            {row.branch && <span className="font-mono">{row.branch}</span>}
            <span className="max-w-full truncate font-mono">
              {homePath(row.cwd)}
            </span>
            {row.task && (
              <a
                href={`#/tasks/${encodeURIComponent(row.task.id)}`}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-px font-medium hover:text-foreground"
              >
                <ListChecks aria-hidden="true" className="size-3" />
                {row.task.title}
              </a>
            )}
          </p>
          {items.length > 0 || live?.busy || workingThere ? (
            <ol
              aria-label={row.title}
              className="mt-6 flex flex-col gap-3 @max-md:mt-5"
            >
              <TalkItems items={items} tool={tool} cwd={row.cwd} />
              <NowItem
                live={live}
                draft={draft}
                tool={tool}
                cwd={row.cwd}
                where={workingThere}
              />
            </ol>
          ) : (
            <p className="mt-6 text-copy text-muted-foreground">
              {talk.error ?? t.nothingSaid}
            </p>
          )}
          {live?.ask && <AskCard id={row.id} ask={live.ask} cwd={row.cwd} />}
          {live?.error && (
            <InlineError className="mt-4" error={t.stoppedShort(live.error)} />
          )}
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t border-border">
        <div
          className={cn(
            'mx-auto max-w-4xl px-10',
            phone ? 'pt-3 pb-3' : 'pt-4 pb-5'
          )}
        >
          {talk.typeIn === 'here' || talk.typeIn === 'move' ? (
            <Composer talk={talk} />
          ) : talk.typeIn === 'elsewhere' ? (
            <Elsewhere talk={talk} />
          ) : (
            <Bar title={t.codexTitle} lead={t.codexLead}>
              <SessionButtons talk={talk} />
            </Bar>
          )}
        </div>
      </div>
    </div>
  )
}

/** Who said what, while the Mac reads its log: the page's own frame */
const BUBBLES = [
  { mine: true, lines: ['82%', '46%'] },
  { mine: false, lines: ['94%', '78%', '38%'] },
  { mine: true, lines: ['64%'] },
]

/**
 * The page as it will be, before its log is read: its line of where it
 * runs, a few turns and the box to type in at its foot, so nothing jumps
 * once they come. A phone's bar has its title.
 */
function TalkSkeleton({ phone }: { phone: boolean }) {
  return (
    <div className="motion-skeleton flex h-full flex-col" aria-hidden="true">
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-4xl px-10 pt-9 pb-6">
          {!phone && (
            <>
              <SkeletonText className="text-meta" width="10rem" />
              <SkeletonText className="mt-2 text-title" width="18rem" />
            </>
          )}
          <SkeletonText
            className={cn('text-meta', !phone && 'mt-1.5')}
            width={phone ? '72%' : '24rem'}
          />
          <ul className={cn('flex flex-col gap-3', phone ? 'mt-5' : 'mt-6')}>
            {BUBBLES.map((bubble, index) => (
              <li key={index} className="flex items-start gap-3">
                <SkeletonBlock className="size-7 shrink-0 rounded-full" />
                <div
                  className={cn(
                    'min-w-0 flex-1 rounded-[20px] px-4 py-3',
                    bubble.mine ? 'bg-well' : 'border border-border'
                  )}
                >
                  <SkeletonText className="text-section" width="7rem" />
                  <div className="mt-1">
                    {bubble.lines.map((width) => (
                      <SkeletonText
                        key={width}
                        className="text-body leading-relaxed"
                        width={width}
                      />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="shrink-0 border-t border-border">
        <div
          className={cn(
            'mx-auto max-w-4xl px-10',
            phone ? 'pt-3 pb-3' : 'pt-4 pb-5'
          )}
        >
          <SkeletonBlock
            className={cn(
              'rounded-[14px]',
              phone ? 'h-[5.5rem]' : 'h-[6.625rem]'
            )}
          />
          {!phone && <SkeletonText className="mt-2 text-meta" width="20rem" />}
        </div>
      </div>
    </div>
  )
}

/** What it asks before it acts, answered here (V3) */
function AskCard({
  id,
  ask,
  cwd,
}: {
  id: string
  ask: SessionAsk
  cwd: string
}) {
  const t = useText(text)
  const act = useSessionActions(id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const plan = ask.kind === 'plan'
  const answer = (said: 'allow' | 'always' | 'deny') => {
    setBusy(true)
    setError(undefined)
    void act
      .answer(ask.id, said)
      .then(setError)
      .finally(() => setBusy(false))
  }
  const title = t.askTitle(ask.kind, ask.tool)
  return (
    <section
      aria-label={title}
      className="mt-4 ml-10 flex flex-col gap-2.5 rounded-[14px] bg-primary/8 px-4 py-3.5"
    >
      <p className="flex items-center gap-2 text-section">
        <ShieldQuestion aria-hidden="true" className="size-4 text-primary" />
        {title}
      </p>
      {ask.what && (
        <pre
          className={cn(
            'max-h-72 overflow-auto rounded-[10px] bg-background px-3 py-2 text-meta leading-relaxed whitespace-pre-wrap select-text',
            !plan && 'font-mono'
          )}
        >
          {ask.what}
        </pre>
      )}
      <p className="text-meta text-muted-foreground">
        {t.askMeta(homePath(cwd), formatRelative(ask.at))}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => answer('allow')}>
          {plan ? t.goAhead : t.allow}
        </Button>
        {ask.rule && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => answer('always')}
          >
            {t.allowRule(ask.rule)}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => answer('deny')}
        >
          {plan ? t.keepPlanning : t.deny}
        </Button>
      </div>
      <InlineError error={error} />
    </section>
  )
}

/**
 * Where you type to a session here: sent at once, read by Claude Code once
 * the step it is on is done; while it asks, what to do instead of that. One
 * resting in the Claude app or a terminal moves here as you send
 */
function Composer({ talk }: { talk: SessionTalk }) {
  const t = useText(text)
  const l = useText(listText)
  const act = useSessionActions(talk.row.id)
  const live = talk.live
  const box = (
    <MessageBox
      placeholder={
        live?.ask
          ? t.placeholder.ask
          : live?.busy
            ? t.placeholder.busy
            : live
              ? t.placeholder.idle
              : t.placeholder.resume
      }
      onSend={(said) =>
        live?.ask ? act.answer(live.ask.id, 'deny', said) : act.send(said)
      }
      tools={
        live?.mode && (
          <ModePicker mode={live.mode} onPick={(mode) => act.mode(mode)} />
        )
      }
      stop={live?.busy ? () => act.stop() : undefined}
    />
  )
  if (talk.typeIn !== 'move') return box
  const where = whereName(talk.row, l)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta text-muted-foreground">
        {talk.row.where === 'claude-app'
          ? t.moveFromApp(where)
          : t.moveFromTerminal(where)}
      </p>
      {box}
    </div>
  )
}

/** A message to send, the composer's box: Enter sends, Shift+Enter a line */
function MessageBox({
  placeholder,
  onSend,
  tools,
  stop,
  autoFocus,
  sendLabel,
}: {
  placeholder: string
  /** Sends it; what went wrong, or nothing */
  onSend: (said: string) => Promise<string | undefined>
  tools?: ReactNode
  /** Stops the turn it is on */
  stop?: () => Promise<string | undefined>
  autoFocus?: boolean
  sendLabel?: string
}) {
  const t = useText(text)
  const mac = remoteMac()
  const foot = mac ? t.footOn(mac) : t.foot
  // A phone keeps its screen for the talk: where it runs is in Settings
  const phone = usePhone()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const send = () => {
    const said = message.trim()
    if (!said || sending) return
    setSending(true)
    setError(undefined)
    void onSend(said).then((failed) => {
      setSending(false)
      if (failed) setError(failed)
      else setMessage('')
    })
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    send()
  }
  return (
    <form onSubmit={submit}>
      <div className="rounded-[14px] border border-input bg-background focus-within:ring-[3px] focus-within:ring-ring/40">
        <textarea
          aria-label={t.message}
          value={message}
          autoFocus={autoFocus}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            // Not while a Korean word is still being put together
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              send()
            }
          }}
          rows={phone ? 1 : 2}
          placeholder={placeholder}
          className={cn(
            'block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-body leading-relaxed outline-none select-text placeholder:text-muted-foreground [field-sizing:content]',
            phone ? 'max-h-40 min-h-11' : 'max-h-60 min-h-16'
          )}
        />
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          {tools}
          <span className="flex-1" />
          {stop && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void stop().then(setError)}
            >
              <Square />
              {t.stop}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!message.trim() || sending}>
            <ArrowUp />
            {sendLabel ?? t.send}
          </Button>
        </div>
      </div>
      <InlineError error={error} className="mt-2" />
      {!phone && <p className="mt-2 text-meta text-muted-foreground">{foot}</p>}
    </form>
  )
}

/** How it asks before it acts, changed from its next step */
export function ModePicker({
  mode,
  onPick,
}: {
  mode: string
  onPick: (mode: SessionMode) => Promise<string | undefined>
}) {
  const t = useText(text)
  const modes = Object.keys(t.modes) as SessionMode[]
  const label = t.modes[mode as SessionMode] ?? mode
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label={`${t.modeLabel}: ${label}`}
          className="text-muted-foreground"
        >
          <ShieldCheck />
          {label}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label={t.modeLabel}>
        {modes.map((each) => (
          <DropdownMenuItem key={each} onSelect={() => void onPick(each)}>
            <Check className={cn(each !== mode && 'invisible')} />
            {t.modes[each]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A Claude Code session open somewhere else (V4): you type there, or
 * continue in a copy run here, which opens in its place
 */
function Elsewhere({ talk }: { talk: SessionTalk }) {
  const t = useText(text)
  const l = useText(listText)
  const act = useSessionActions(talk.row.id)
  const [copying, setCopying] = useState(false)
  if (copying)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-meta text-muted-foreground">{t.copyLead}</p>
        <MessageBox
          autoFocus
          placeholder={t.placeholder.copy}
          sendLabel={t.copyHere}
          onSend={async (said) => {
            const copy = await act.copy(said)
            if ('id' in copy && copy.id) {
              window.location.hash = `#/sessions/${encodeURIComponent(copy.id)}`
              return undefined
            }
            return copy.error
          }}
          tools={
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setCopying(false)}
            >
              {t.cancel}
            </Button>
          }
        />
      </div>
    )
  const where = whereName(talk.row, l)
  // In the Claude app or a terminal, on a turn: here once that turn is done
  const moves = talk.row.where === 'claude-app' || talk.row.where === 'terminal'
  return (
    <Bar
      title={moves ? t.busyThereTitle(where) : t.elseTitle(where)}
      lead={moves ? t.busyThereLead : t.elseLead}
    >
      <SessionButtons talk={talk} />
      <Button size="sm" variant="outline" onClick={() => setCopying(true)}>
        <GitFork />
        {t.copyHere}
      </Button>
    </Bar>
  )
}

/** A note in the composer's place, with what you can do instead */
function Bar({
  title,
  lead,
  children,
}: {
  title: string
  lead: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-well px-4 py-3.5">
      <p className="text-section">{title}</p>
      <p className="text-meta text-muted-foreground">{lead}</p>
      <div className="mt-1 flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/**
 * Where it runs, when Pacenote can take you there: on the Mac, not from a
 * device of yours, which talks to it here
 */
function SessionButtons({ talk }: { talk: SessionTalk }) {
  const [error, setError] = useState<string>()
  if (remoteMac() || !canShow(talk.row)) return null
  return (
    <>
      <ShowButton s={talk.row} onError={setError} size="sm" />
      <InlineError error={error} className="basis-full" />
    </>
  )
}

/**
 * The session's other buttons: where it runs, its resume command, and,
 * for one Pacenote runs, ending its run here. A device of yours has the last
 * alone: the first two are the Mac's own terminal and apps.
 */
function SessionMenu({ talk }: { talk: SessionTalk }) {
  const t = useText(text)
  const l = useText(listText)
  const act = useSessionActions(talk.row.id)
  const { row } = talk
  const command = `${resumeCommand(row.tool)} ${row.session}`
  const onMac = !remoteMac()
  const show = onMac && canShow(row)
  const running = talk.live && row.where === 'pacenote'
  if (!onMac && !running) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={t.more}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {show && (
          <DropdownMenuItem
            onSelect={() => void window.pacenoteDesktop?.sessions.open(row.id)}
          >
            {row.where === 'terminal'
              ? l.openIn.terminal(row.terminal)
              : l.openIn[row.where]}
          </DropdownMenuItem>
        )}
        {onMac && (
          <DropdownMenuItem
            onSelect={() => void navigator.clipboard.writeText(command)}
          >
            <Copy />
            {l.copyResume(
              `${resumeCommand(row.tool)} ${row.session.slice(0, 8)}…`
            )}
          </DropdownMenuItem>
        )}
        {running && (
          <>
            {onMac && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => void act.end()}>
              <Power />
              {t.endHere}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The answer it writes, as it comes; kept on once written until its log has
 * it, so it does not blink out between the two
 */
function useDraft(
  live: SessionLive | undefined,
  count: number
): string | undefined {
  const [kept, setKept] = useState<{ text: string; count: number }>()
  const draft = live?.draft
  const busy = live?.busy
  useEffect(() => {
    // A new answer begun, or the one written so far
    if (draft !== undefined) setKept(draft ? { text: draft, count } : undefined)
    else
      setKept((old) => (old && (count > old.count || !busy) ? undefined : old))
  }, [draft, count, busy])
  return draft !== undefined ? draft || undefined : kept?.text
}
