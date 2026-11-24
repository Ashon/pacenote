import { IMAGE_TYPES, IMAGES_MAX } from '@src/sessions/images'
import { modelLabel } from '@src/sessions/live'
import type {
  SessionAsk,
  SessionLive,
  CodexMode,
  HostTool,
  SessionMode,
  SessionPlanStep,
  SessionTalk,
} from '@src/sessions/types'
import { CLI_NAMES } from '@src/tasks/own-ai'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDot,
  Copy,
  GitFork,
  ImagePlus,
  ListChecks,
  MoreHorizontal,
  Power,
  ShieldCheck,
  ShieldQuestion,
  Square,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
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
import { canShow, parseOtherId } from '@/lib/session-rows'
import {
  attachImage,
  imageFiles,
  imageUrl,
  type Attached,
} from '@/lib/session-images'
import { useSessionActions, useSessionTalk } from '@/lib/sessions'
import { cn } from '@/lib/utils'
import { MadeChip, type OpenMade } from './made-card'
import { NowItem, SentItems, TalkItems } from './session-items'
import { ShowButton, StateMark, toolWhere, whereName } from './session-open'
import { text } from './session-page.text'
import { SessionEnd } from './session-wrap'
import { text as listText } from './sessions-page.text'
import { resumeCommand } from './task-sessions'

/** Close enough to the end to follow what comes next */
const FOLLOW_PX = 80
/**
 * How long after your hand moved it a scroll up is yours: a flick goes on
 * after the finger lifts
 */
const HAND_MS = 1500

/** Room between the conversation's end and the composer floating over it */
const DOCK_GAP_PX = 8

/**
 * How long something you sent stays after Claude Code read it, at most, while
 * its log catches up
 */
const SENT_MS = 10_000

/** Enter right after a word is put together ends it (Safari), not sends */
const COMPOSED_MS = 500

/** A message being written, by session: in memory only, never on disk */
const drafts = new Map<string, string>()
/** And the images you attached to it, the same way */
const imageDrafts = new Map<string, Attached[]>()

const smooth = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'

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
  const content = useRef<HTMLDivElement>(null)
  /** At the end: what comes next scrolls into sight */
  const following = useRef(true)
  /** On the way to the end (Latest): scrolls on the way do not stop it */
  const jumping = useRef(false)
  /** Scrolled up from the end, with more below */
  const [behind, setBehind] = useState(false)
  /** How tall the composer floating over the conversation's end is */
  const [dock, setDock] = useState(0)
  const docked = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const measure = () => setDock(element.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // What Tab or a find moves to scrolls into sight above it, not under it
  useLayoutEffect(() => {
    if (scroller.current)
      scroller.current.style.scrollPaddingBottom = `${dock}px`
  }, [dock])
  const loaded = talk !== undefined
  useEffect(() => {
    const element = scroller.current
    const inner = content.current
    if (!element || !inner) return
    const atEnd = () =>
      element.scrollHeight - element.scrollTop - element.clientHeight <
      FOLLOW_PX
    /** When your hand last moved it: a wheel, a finger, a key, its bar */
    let handAt = 0
    let pressed = false
    const byHand = () => pressed || Date.now() - handAt < HAND_MS
    let lastTop = element.scrollTop
    const onScroll = () => {
      const up = element.scrollTop < lastTop
      lastTop = element.scrollTop
      if (jumping.current && !atEnd()) return
      jumping.current = false
      // Only your hand takes it away from the end. More coming (images
      // loading one after another) or less (the composer's images sent)
      // moves the end, not you: it stays there
      if (following.current && !(up && byHand())) {
        if (!atEnd()) element.scrollTop = element.scrollHeight
        return
      }
      following.current = atEnd()
      setBehind(!following.current)
    }
    // Your hand on it: a jump to the end stops where you take over
    const onHand = () => {
      jumping.current = false
      handAt = Date.now()
    }
    const onPress = () => {
      pressed = true
      onHand()
    }
    const onRelease = () => {
      if (!pressed) return
      pressed = false
      handAt = Date.now()
    }
    // Opening a step or a summary is to read it: what comes next waits below
    const onOpen = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.('[aria-expanded]'))
        following.current = false
    }
    // An answer as it comes, a step opened, the composer grown: kept at the
    // end while following
    const observer = new ResizeObserver(() => {
      if (following.current) element.scrollTop = element.scrollHeight
      else setBehind(!atEnd())
    })
    observer.observe(inner, { box: 'border-box' })
    element.addEventListener('scroll', onScroll, { passive: true })
    element.addEventListener('wheel', onHand, { passive: true })
    element.addEventListener('touchstart', onPress, { passive: true })
    element.addEventListener('pointerdown', onPress)
    element.addEventListener('keydown', onHand)
    window.addEventListener('touchend', onRelease)
    window.addEventListener('pointerup', onRelease)
    inner.addEventListener('click', onOpen)
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', onScroll)
      element.removeEventListener('wheel', onHand)
      element.removeEventListener('touchstart', onPress)
      element.removeEventListener('pointerdown', onPress)
      element.removeEventListener('keydown', onHand)
      window.removeEventListener('touchend', onRelease)
      window.removeEventListener('pointerup', onRelease)
      inner.removeEventListener('click', onOpen)
    }
  }, [loaded])
  /** To the end, and following from there */
  const toEnd = (animate: boolean) => {
    const element = scroller.current
    following.current = true
    setBehind(false)
    if (!element) return
    jumping.current = animate
    element.scrollTo({
      top: element.scrollHeight,
      behavior: animate ? smooth() : 'auto',
    })
  }
  const live = talk?.live
  const draft = useDraft(live, talk?.items.length ?? 0)
  const sent = useSent(live, talk?.items)
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
    sent.length,
  ])

  // Another of your Macs that stopped answering before its page came
  if (talk === undefined && !query.isError)
    return <TalkSkeleton phone={phone} />
  if (!talk)
    return (
      <div className="mx-auto max-w-4xl px-10 py-9">
        <p className="text-copy text-muted-foreground">
          {parseOtherId(id) ? t.notOnOtherMac : t.notHere}
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <a href="#/sessions">{t.backToSessions}</a>
        </Button>
      </div>
    )

  const { row, items } = talk
  const tool = CLI_NAMES[row.tool]
  const openMade = window.pacenoteDesktop?.sessions.openMade
  // Its files open on the Mac it runs on: this one's
  const open: OpenMade | undefined =
    openMade && !talk.mac ? (key, how) => openMade(row.id, key, how) : undefined
  // One open somewhere else works there: said at the end, as it can be
  const workingThere =
    !live?.busy && row.state === 'working' && talk.typeIn !== 'here'
      ? whereName(row, l)
      : undefined
  return (
    <div className="relative h-full">
      <ScrollArea
        viewportRef={scroller}
        className="h-full"
        scrollbarClassName="z-10"
      >
        {/* Its end clears the composer floating over it */}
        <div
          ref={content}
          className="@container mx-auto max-w-4xl px-10 pt-9"
          style={{ paddingBottom: dock + DOCK_GAP_PX }}
        >
          <nav
            data-page-crumbs
            className="flex items-center gap-1.5 text-meta text-muted-foreground"
          >
            <a href="#/sessions" className="hover:text-foreground">
              {l.title}
            </a>
            <ChevronRight aria-hidden="true" className="size-3.5" />
            {/* On another of your Macs: that Mac, then its group there */}
            {talk.mac && (
              <>
                <span>{talk.mac.name}</span>
                <ChevronRight aria-hidden="true" className="size-3.5" />
              </>
            )}
            <span>{talk.group ?? l.notInProject}</span>
          </nav>
          <header className="mt-2 flex items-start gap-3">
            <h1 data-page-title className="min-w-0 flex-1 text-title">
              {row.title}
            </h1>
            {/* On a phone its bar has these (More); another Mac's are
                that Mac's */}
            {!phone && !talk.mac && <SessionEnd talk={talk} />}
            {!phone && !talk.mac && <SessionMenu talk={talk} />}
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
            {!!talk.made?.length && <MadeChip made={talk.made} open={open} />}
          </p>
          {items.length > 0 || live?.busy || workingThere || sent.length ? (
            <ol
              aria-label={row.title}
              className="mt-6 flex flex-col gap-3 @max-md:mt-5"
            >
              <TalkItems
                items={items}
                tool={tool}
                engine={row.tool}
                cwd={row.cwd}
                session={row.id}
                made={talk.made}
                open={open}
                compact={phone}
              />
              {/* What started its turn, then the turn, then what waits */}
              <SentItems sent={sent.filter((one) => !one.queued)} />
              <NowItem
                live={live}
                draft={draft}
                tool={tool}
                engine={row.tool}
                cwd={row.cwd}
                where={workingThere}
              />
              <SentItems sent={sent.filter((one) => one.queued)} />
            </ol>
          ) : (
            <p className="mt-6 text-copy text-muted-foreground">
              {talk.error ?? t.nothingSaid}
            </p>
          )}
          {/* Another Mac's is answered there: its state says it asks */}
          {live?.ask && !talk.mac && (
            <AskCard
              id={row.id}
              ask={live.ask}
              cwd={row.cwd}
              by={CLI_NAMES[row.tool]}
            />
          )}
          {live?.error && (
            <InlineError className="mt-4" error={t.stoppedShort(live.error)} />
          )}
        </div>
      </ScrollArea>
      {/*
       * The composer floats over the conversation's end, which scrolls on
       * under it and fades out above it. Only the composer itself takes the
       * pointer: around it, a wheel or a finger scrolls the conversation.
       */}
      <div
        ref={docked}
        className="pointer-events-none absolute inset-x-0 bottom-0"
      >
        {behind && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            data-state="open"
            aria-label={t.latest}
            title={t.latest}
            onClick={() => toEnd(true)}
            className="motion-fade pointer-events-auto absolute bottom-full left-1/2 size-9 -translate-x-1/2 translate-y-2 rounded-full bg-background shadow-float"
          >
            <ArrowDown />
            {/* At work: what comes next is on its way */}
            {live?.busy && (
              <span
                aria-hidden="true"
                className="absolute top-0.5 right-0.5 size-2 animate-pulse-dot rounded-full bg-status-running"
              />
            )}
          </Button>
        )}
        <div
          aria-hidden="true"
          className={cn(
            'bg-linear-to-t from-card to-transparent',
            phone ? 'h-4' : 'h-6'
          )}
        />
        <div className="bg-card">
          <div
            className={cn('mx-auto max-w-4xl px-10', phone ? 'pb-3' : 'pb-5')}
          >
            <div className="pointer-events-auto">
              {talk.plan && <PlanBar plan={talk.plan} />}
              {talk.mac ? (
                <Bar
                  title={t.otherMacTitle(talk.mac.name)}
                  lead={t.otherMacLead}
                />
              ) : talk.typeIn === 'here' || talk.typeIn === 'move' ? (
                <Composer talk={talk} onSend={() => toEnd(false)} />
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
      <div className="shrink-0">
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
  by,
}: {
  id: string
  ask: SessionAsk
  cwd: string
  /** Who asks: Claude Code or Codex */
  by: string
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
  const title = t.askTitle(ask.kind, ask.tool, by)
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
      {ask.why && (
        <p className="text-meta select-text">
          <span className="text-muted-foreground">{t.why} · </span>
          {ask.why}
        </p>
      )}
      <p className="text-meta text-muted-foreground">
        {t.askMeta(homePath(cwd), formatRelative(ask.at))}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => answer('allow')}>
          {plan ? t.goAhead : t.allow}
        </Button>
        {(ask.rule || ask.always) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => answer('always')}
          >
            {ask.rule ? t.allowRule(ask.rule) : t.allowAlways}
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
function Composer({
  talk,
  onSend,
}: {
  talk: SessionTalk
  /** As you send: what you sent comes in sight */
  onSend: () => void
}) {
  const t = useText(text)
  const l = useText(listText)
  const act = useSessionActions(talk.row.id)
  const live = talk.live
  const tool: HostTool = talk.row.tool === 'codex' ? 'codex' : 'claude'
  const by = CLI_NAMES[talk.row.tool]
  const box = (
    <MessageBox
      draftKey={talk.row.id}
      tool={tool}
      placeholder={
        live?.ask
          ? t.placeholder.ask
          : live?.busy
            ? t.placeholder.busy(by)
            : live
              ? t.placeholder.idle(by)
              : t.placeholder.resume
      }
      // Images go with a message, not with an answer to what it asks
      attach={Boolean(window.pacenoteDesktop?.sessions?.attach) && !live?.ask}
      onSend={(said, images) => {
        onSend()
        return live?.ask
          ? act.answer(live.ask.id, 'deny', said)
          : act.send(said, images)
      }}
      tools={
        live?.mode && (
          <ModePicker
            tool={tool}
            mode={live.mode}
            onPick={(mode) => act.mode(mode)}
          />
        )
      }
      gauge={live?.context && <ContextGauge live={live} by={by} />}
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

/**
 * A message to send, the composer's box: Enter sends, Shift+Enter a line.
 * With attach, images go with it: picked, pasted or dropped on it
 */
function MessageBox({
  placeholder,
  onSend,
  attach,
  tools,
  gauge,
  stop,
  autoFocus,
  sendLabel,
  draftKey,
  tool = 'claude',
}: {
  placeholder: string
  /** Sends it, with the images attached; what went wrong, or nothing */
  onSend: (said: string, images: Attached[]) => Promise<string | undefined>
  /** Whether images go with it (session-images.ts) */
  attach?: boolean
  tools?: ReactNode
  /** How full its context is, at the end of the tools */
  gauge?: ReactNode
  /** Stops the turn it is on (Esc) */
  stop?: () => Promise<string | undefined>
  autoFocus?: boolean
  sendLabel?: string
  /** Keeps what you write while you look at another page, in memory */
  draftKey?: string
  /** What runs it, for the line under the box */
  tool?: HostTool
}) {
  const t = useText(text)
  const mac = remoteMac()
  const foot = mac ? t.footOn(mac, CLI_NAMES[tool]) : t.foot[tool]
  // A phone keeps its screen for the talk: where it runs is in Settings
  const phone = usePhone()
  const [message, setMessageNow] = useState(
    () => (draftKey && drafts.get(draftKey)) || ''
  )
  const setMessage = (said: string) => {
    setMessageNow(said)
    if (!draftKey) return
    if (said) drafts.set(draftKey, said)
    else drafts.delete(draftKey)
  }
  const [images, setImagesNow] = useState<Attached[]>(
    () => (draftKey && imageDrafts.get(draftKey)) || []
  )
  const setImages = (change: (old: Attached[]) => Attached[]) =>
    setImagesNow((old) => {
      const next = change(old)
      if (draftKey)
        if (next.length) imageDrafts.set(draftKey, next)
        else imageDrafts.delete(draftKey)
      return next
    })
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  /** When a word was last put together (Korean, Japanese, Chinese) */
  const composed = useRef(0)
  /** Images picked, pasted or dropped: made small enough, up to the most */
  const add = async (files: readonly File[]) => {
    if (!files.length) return
    setError(undefined)
    const room = IMAGES_MAX - images.length
    if (files.length > room) setError(t.tooManyImages(IMAGES_MAX))
    for (const file of files.slice(0, Math.max(0, room))) {
      const image = await attachImage(file, file.name)
      if ('refused' in image)
        setError(image.refused === 'kind' ? t.imageKind : t.imageSize)
      else setImages((old) => (old.length < IMAGES_MAX ? [...old, image] : old))
    }
  }
  const sent = attach ? images : []
  const send = () => {
    const said = message.trim()
    if ((!said && !sent.length) || sending) return
    setSending(true)
    setError(undefined)
    void onSend(said, sent).then((failed) => {
      setSending(false)
      if (failed) setError(failed)
      else {
        setMessage('')
        if (sent.length) setImages(() => [])
      }
    })
  }
  const files = (event: DragEvent) =>
    attach && event.dataTransfer.types.includes('Files')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    send()
  }
  return (
    <form onSubmit={submit}>
      <div
        onDragOver={(event) => {
          if (!files(event)) return
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          // Only when it leaves the box, not one of its parts
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragging(false)
        }}
        onDrop={(event) => {
          if (!files(event)) return
          event.preventDefault()
          setDragging(false)
          void add(imageFiles(event.dataTransfer.files))
        }}
        className={cn(
          'rounded-[14px] border border-input bg-background shadow-float focus-within:ring-[3px] focus-within:ring-ring/40',
          dragging && 'border-primary ring-[3px] ring-ring/40'
        )}
      >
        {attach && images.length > 0 && (
          <ul
            aria-label={t.attached(images.length)}
            className="flex flex-wrap gap-2 px-3 pt-3"
          >
            {images.map((image) => (
              <li
                key={image.id}
                className="relative size-16 overflow-hidden rounded-lg border border-border bg-muted"
              >
                <img
                  src={imageUrl(image)}
                  alt={image.name || t.image}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  aria-label={t.removeImage(image.name)}
                  onClick={() =>
                    setImages((old) => old.filter((one) => one.id !== image.id))
                  }
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background hover:bg-foreground"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          aria-label={t.message}
          value={message}
          autoFocus={autoFocus}
          onChange={(event) => setMessage(event.target.value)}
          onCompositionEnd={() => {
            composed.current = Date.now()
          }}
          onPaste={(event) => {
            // An image copied (a screenshot, a file in Finder) goes with it
            const pasted = attach ? imageFiles(event.clipboardData.files) : []
            if (!pasted.length) return
            event.preventDefault()
            void add(pasted)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && stop) {
              event.preventDefault()
              void stop().then(setError)
              return
            }
            // A phone's Return is a new line: its Send button sends
            if (event.key !== 'Enter' || event.shiftKey || phone) return
            // Not while a Korean word is still being put together, nor on
            // the Enter that ends one (Safari tells it after the word)
            if (
              event.nativeEvent.isComposing ||
              event.keyCode === 229 ||
              (safari && Date.now() - composed.current < COMPOSED_MS)
            )
              return
            event.preventDefault()
            send()
          }}
          rows={phone ? 1 : 2}
          placeholder={placeholder}
          className={cn(
            'block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-body leading-relaxed outline-none select-text placeholder:text-muted-foreground [field-sizing:content]',
            phone ? 'max-h-40 min-h-11' : 'max-h-60 min-h-16'
          )}
        />
        <div className="flex min-w-0 items-center gap-2 px-2.5 pb-2.5">
          {attach && (
            <>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t.attachImage}
                title={t.attachHint}
                disabled={images.length >= IMAGES_MAX}
                onClick={() => picker.current?.click()}
              >
                <ImagePlus />
              </Button>
              <input
                ref={picker}
                type="file"
                accept={IMAGE_TYPES.join(',')}
                multiple
                hidden
                onChange={(event) => {
                  void add(imageFiles(event.target.files))
                  event.target.value = ''
                }}
              />
            </>
          )}
          {tools}
          <span className="flex-1" />
          {gauge}
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
          <Button
            type="submit"
            size="sm"
            disabled={(!message.trim() && !sent.length) || sending}
          >
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

/** Safari, which ends a word being put together after its Enter */
const safari =
  typeof navigator !== 'undefined' &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg/.test(navigator.userAgent)

/**
 * How much of its model's context the conversation takes: Claude Code or
 * Codex summarizes what came before as it fills
 */
function ContextGauge({ live, by }: { live: SessionLive; by: string }) {
  const t = useText(text)
  const phone = usePhone()
  if (!live.context) return null
  const percent = Math.min(
    100,
    Math.round((live.context.used / live.context.window) * 100)
  )
  const model = live.model && !phone ? modelLabel(live.model) : ''
  return (
    <span
      title={t.contextNote(percent, by)}
      aria-label={t.contextNote(percent, by)}
      className={cn(
        'truncate text-meta text-muted-foreground tabular-nums',
        percent >= 80 && 'text-status-interrupted'
      )}
    >
      {t.context(model, percent)}
    </span>
  )
}

/**
 * Its plan while it works, above the composer: how far along, the step it is
 * on, and each step when opened
 */
function PlanBar({ plan }: { plan: SessionPlanStep[] }) {
  const t = useText(text)
  const [open, setOpen] = useState(false)
  const done = plan.filter((step) => step.state === 'done').length
  const now = plan.find((step) => step.state === 'doing')
  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/40">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-meta"
      >
        <ListChecks
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <span className="shrink-0 font-medium">{t.plan}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {t.planDone(done, plan.length)}
        </span>
        {now && (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            <span aria-hidden="true">· </span>
            {now.doing ?? now.text}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'ml-auto size-3.5 shrink-0 text-muted-foreground',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <ol className="flex max-h-48 flex-col gap-1 overflow-y-auto px-3 pb-2.5">
          {plan.map((step, index) => (
            <li
              key={index}
              className={cn(
                'flex items-start gap-2 text-meta',
                step.state === 'done' && 'text-muted-foreground line-through',
                step.state === 'doing' && 'font-medium'
              )}
            >
              {step.state === 'done' ? (
                <CircleCheck
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-status-succeeded"
                />
              ) : step.state === 'doing' ? (
                <CircleDot
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-status-running"
                />
              ) : (
                <Circle
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
              )}
              <span className="min-w-0">{step.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * How it asks before it acts, changed from its next step: Claude Code's
 * modes, or Codex's (Z4), from its next turn
 */
export function ModePicker({
  mode,
  onPick,
  tool = 'claude',
}: {
  mode: string
  onPick: (mode: SessionMode | CodexMode) => Promise<string | undefined>
  tool?: HostTool
}) {
  const t = useText(text)
  const names: Record<string, string> =
    tool === 'codex' ? t.codexModes : t.modes
  const modes = Object.keys(names) as (SessionMode | CodexMode)[]
  const label = names[mode] ?? mode
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
            {names[each]}
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
  // In the Claude app or a terminal, on a turn or with work in the
  // background: here once it is done
  const moves = talk.row.where === 'claude-app' || talk.row.where === 'terminal'
  const background = moves && !!talk.row.background
  return (
    <Bar
      title={
        background
          ? t.backgroundThereTitle(where)
          : moves
            ? t.busyThereTitle(where)
            : t.elseTitle(where)
      }
      lead={
        background
          ? t.backgroundThereLead
          : moves
            ? t.busyThereLead
            : t.elseLead
      }
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
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-well px-4 py-3.5">
      <p className="text-section">{title}</p>
      <p className="text-meta text-muted-foreground">{lead}</p>
      {children && <div className="mt-1 flex flex-wrap gap-2">{children}</div>}
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
 * alone: the first two are the Mac's own terminal and apps. On the Mac,
 * Close beside it ends the run.
 */
function SessionMenu({ talk }: { talk: SessionTalk }) {
  const t = useText(text)
  const l = useText(listText)
  const act = useSessionActions(talk.row.id)
  const { row } = talk
  const command = `${resumeCommand(row.tool)} ${row.session}`
  const onMac = !remoteMac()
  const show = onMac && canShow(row)
  // Where Close is (session-wrap.tsx), it ends the run too
  const running = talk.live && row.where === 'pacenote' && !act.close
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
 * What you sent that its log does not have yet: queued while Claude Code is on
 * a step (sent during its turn), and once read, kept until its log has it, so
 * it does not blink out between the two
 */
function useSent(
  live: SessionLive | undefined,
  items: SessionTalk['items'] | undefined
): { text: string; queued: boolean; images?: number }[] {
  const queued = live?.queued
  const since = live?.since
  const [read, setRead] = useState<
    { text: string; at: number; images?: number }[]
  >([])
  const before = useRef(queued)
  useEffect(() => {
    const gone = (before.current ?? []).filter(
      (one) => !queued?.some((q) => q.at === one.at && q.text === one.text)
    )
    before.current = queued
    if (gone.length)
      setRead((old) => [
        ...old,
        ...gone.map((one) => ({
          text: one.text,
          at: Date.now(),
          ...(one.images ? { images: one.images } : {}),
        })),
      ])
  }, [queued])
  // In its log now, or long enough
  const said = items?.filter((item) => item.role === 'user').at(-1)?.text
  useEffect(() => {
    if (!read.length) return
    const left = read.filter(
      (one) =>
        !(said && said.trim() === one.text.trim()) &&
        Date.now() - one.at < SENT_MS
    )
    if (left.length !== read.length) {
      setRead(left)
      return
    }
    const timer = setTimeout(
      () => setRead((old) => old.filter((o) => Date.now() - o.at < SENT_MS)),
      SENT_MS
    )
    return () => clearTimeout(timer)
  }, [read, said])
  return [
    ...read.map((one) => ({
      text: one.text,
      queued: false,
      images: one.images,
    })),
    ...(queued ?? []).map((one) => ({
      text: one.text,
      images: one.images,
      queued: !!since && Date.parse(one.at) > Date.parse(since),
    })),
  ]
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
