import { PLAN_TOOLS } from '@src/sessions/plan'
import {
  saidParts,
  stepTarget,
  toolLabel,
  type SaidPart,
} from '@src/sessions/said'
import type { MadeThing, SessionLive } from '@src/sessions/types'
import type { SessionItem } from '@src/tasks/types'
import {
  Bell,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  ClipboardList,
  Copy,
  FilePen,
  FilePlus,
  FileText,
  FolderSearch,
  Globe,
  Image as ImageIcon,
  Layers,
  ListTodo,
  NotebookPen,
  Plug,
  ScrollText,
  Search,
  Sparkles,
  SquareSlash,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SkeletonBlock } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { useSessionImage } from '@/lib/sessions'
import { cn } from '@/lib/utils'
import { MadeCard, type OpenMade } from './made-card'
import { text } from './session-items.text'
import { text as rowText } from './task-row.text'

/**
 * A session's conversation as its page and its log show it: your turns, with
 * what Claude Code adds to them shown each in its own way (a slash command,
 * a shell command, what they printed, a notice) and its reminders left out;
 * its answers as Markdown; its steps by what they did, the ones in a row
 * folded into a line once there are more than a few; and what it does this
 * moment, while on a turn.
 */

/** How long a copied mark stays */
const COPIED_MS = 1500

/** How long a finger rests on a bubble to show what you do with it (copy) */
const HOLD_MS = 450
/** How long it stays shown then */
const HELD_MS = 4000
/** How far a finger moves before it scrolls instead */
const HOLD_SLOP_PX = 10

/** Steps in a row shown one by one; more fold into a line to open */
const STEPS_SHOWN = 3
/** Tools named in a folded line, the most used first */
const STEP_NAMES = 4

const STEP_ICONS: Record<string, LucideIcon> = {
  Bash: SquareTerminal,
  BashOutput: SquareTerminal,
  shell: SquareTerminal,
  local_shell: SquareTerminal,
  exec_command: SquareTerminal,
  Read: FileText,
  Edit: FilePen,
  MultiEdit: FilePen,
  apply_patch: FilePen,
  Write: FilePlus,
  NotebookEdit: NotebookPen,
  Grep: Search,
  Glob: FolderSearch,
  LS: FolderSearch,
  WebFetch: Globe,
  WebSearch: Globe,
  web_search: Globe,
  TodoWrite: ListTodo,
  update_plan: ListTodo,
  Task: Bot,
  Agent: Bot,
  Skill: Sparkles,
  ExitPlanMode: ClipboardList,
}

const stepIcon = (name: string): LucideIcon =>
  STEP_ICONS[name] ?? (name.startsWith('mcp__') ? Plug : Wrench)

type Block =
  | { kind: 'turn'; item: SessionItem; at: number }
  | { kind: 'steps'; items: SessionItem[]; at: number }
  | { kind: 'made'; keys: string[]; at: number }

/**
 * Turns, and the steps between them together; what a step or an answer made,
 * as cards after it, the steps on either side apart
 */
function blocksOf(items: readonly SessionItem[]): Block[] {
  const blocks: Block[] = []
  items.forEach((item, at) => {
    const last = blocks.at(-1)
    // Its plan's steps: the plan above the composer has them
    if (item.role === 'tool' && item.name && PLAN_TOOLS.has(item.name)) return
    if (item.role !== 'tool') blocks.push({ kind: 'turn', item, at })
    else if (last?.kind === 'steps') last.items.push(item)
    else blocks.push({ kind: 'steps', items: [item], at })
    if (item.made?.length) blocks.push({ kind: 'made', keys: item.made, at })
  })
  return blocks
}

/** The conversation, as list items */
export function TalkItems({
  items,
  tool,
  cwd,
  made,
  open,
  compact,
  session,
}: {
  items: readonly SessionItem[]
  tool: string
  cwd: string
  /** Its id, for the images sent with your turns: their count without it */
  session?: string
  /** What it made, for the cards its items name */
  made?: readonly MadeThing[]
  /** Opens a file it made: on the Mac it runs on */
  open?: OpenMade
  /** On a phone */
  compact?: boolean
}) {
  return blocksOf(items).map((block) => {
    if (block.kind === 'steps')
      return <Steps key={block.at} items={block.items} cwd={cwd} />
    if (block.kind === 'turn')
      return (
        <Turn key={block.at} item={block.item} tool={tool} session={session} />
      )
    const things = block.keys.flatMap(
      (key) => made?.filter((thing) => thing.key === key) ?? []
    )
    return things.length ? (
      <li key={`${block.at}:made`} className="ml-10 flex flex-col gap-2">
        {things.map((thing) => (
          <MadeCard
            key={thing.key}
            thing={thing}
            open={open}
            compact={compact}
          />
        ))}
      </li>
    ) : null
  })
}

/**
 * A turn of yours or its answer, in a bubble with who and when, and what you
 * do with it (copy) at its end: shown on hover or focus, and on a phone or
 * iPad once a finger rests on the bubble
 */
function Bubble({
  mine,
  who,
  at,
  status,
  actions,
  waiting,
  children,
}: {
  mine: boolean
  who: string
  at?: string
  status?: ReactNode
  actions?: ReactNode
  /** Sent, not read yet */
  waiting?: boolean
  children: ReactNode
}) {
  const [held, setHeld] = useState(false)
  const hold = useRef<{ x: number; y: number; timer: number }>(undefined)
  const letGo = () => {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = undefined
  }
  useEffect(() => letGo, [])
  useEffect(() => {
    if (!held) return
    const timer = setTimeout(() => setHeld(false), HELD_MS)
    return () => clearTimeout(timer)
  }, [held])
  return (
    <li
      data-held={held || undefined}
      className={cn(
        'group/turn flex items-start gap-3',
        waiting && 'opacity-70'
      )}
      {...(actions
        ? {
            onPointerDown: (event: PointerEvent<HTMLLIElement>) => {
              if (event.pointerType !== 'touch') return
              letGo()
              hold.current = {
                x: event.clientX,
                y: event.clientY,
                timer: window.setTimeout(() => setHeld(true), HOLD_MS),
              }
            },
            onPointerMove: (event: PointerEvent<HTMLLIElement>) => {
              const at = hold.current
              if (
                at &&
                Math.hypot(event.clientX - at.x, event.clientY - at.y) >
                  HOLD_SLOP_PX
              )
                letGo()
            },
            onPointerUp: letGo,
            onPointerCancel: letGo,
          }
        : {})}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-meta font-semibold',
          mine
            ? 'bg-secondary text-secondary-foreground'
            : 'bg-foreground text-background'
        )}
        aria-hidden="true"
      >
        {who[0]}
      </span>
      <div
        className={cn(
          'min-w-0 flex-1 rounded-[20px] px-4 py-3',
          mine ? 'bg-well' : 'border border-border'
        )}
      >
        <div className="flex items-start gap-2">
          <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-section">
            {who}
            {at && (
              <span className="text-caption text-muted-foreground">
                {formatDateTime(at)}
              </span>
            )}
            {status}
          </p>
          {actions && (
            <span className="pointer-events-none -my-1 -mr-2 flex shrink-0 opacity-0 transition-opacity group-focus-within/turn:pointer-events-auto group-focus-within/turn:opacity-100 group-hover/turn:pointer-events-auto group-hover/turn:opacity-100 group-data-held/turn:pointer-events-auto group-data-held/turn:opacity-100">
              {actions}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-col gap-2">{children}</div>
      </div>
    </li>
  )
}

/** Copies what was said; a check for a moment once it has */
function CopyButton({ said }: { said: string }) {
  const t = useText(text)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={copied ? t.copied : t.copy}
      title={copied ? t.copied : t.copy}
      className="text-muted-foreground"
      onClick={() =>
        void navigator.clipboard?.writeText(said).then(() => setCopied(true))
      }
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}

/**
 * A long turn of yours (a task handed over, a pasted log) folded to its first
 * lines, to open in full
 */
function Folded({ children }: { children: ReactNode }) {
  const t = useText(text)
  const box = useRef<HTMLDivElement>(null)
  const [long, setLong] = useState(false)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const element = box.current
    if (element && !open)
      setLong(element.scrollHeight > element.clientHeight + 1)
  }, [children, open])
  return (
    <>
      <div
        ref={box}
        className={cn(
          'flex flex-col gap-2',
          !open && 'max-h-56 overflow-hidden',
          !open &&
            long &&
            '[mask-image:linear-gradient(to_bottom,black_70%,transparent)]'
        )}
      >
        {children}
      </div>
      {(long || open) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex w-fit items-center gap-1 text-meta font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('size-3.5', open && 'rotate-180')}
          />
          {open ? t.showLess : t.showAll}
        </button>
      )}
    </>
  )
}

/** Its answer: Markdown, as Claude Code and Codex write */
function Answer({ text: said }: { text: string }) {
  return (
    <Markdown
      slack={false}
      className={cn(
        'text-foreground/90',
        // Headings as a turn's own, not the page's
        'prose-headings:mt-4 prose-headings:mb-1.5 prose-h1:text-section prose-h2:text-section prose-h3:text-section prose-h4:text-section',
        '[&>:first-child]:mt-0 [&>:last-child]:mb-0'
      )}
    >
      {said}
    </Markdown>
  )
}

function Turn({
  item,
  tool,
  session,
}: {
  item: SessionItem
  tool: string
  session?: string
}) {
  const r = useText(rowText)
  if (item.role === 'assistant')
    return (
      <Bubble
        mine={false}
        who={tool}
        at={item.at}
        actions={<CopyButton said={item.text} />}
      >
        <Answer text={item.text} />
      </Bubble>
    )
  if (item.compacted) return <Compacted summary={item.text} />
  const parts = saidParts(item.text)
  // Only a stop or a notice: a line of its own, not a turn of yours
  if (
    !item.images &&
    parts.every((part) => part.kind === 'stopped' || part.kind === 'note')
  )
    return parts.map((part, index) => <NoteLine key={index} part={part} />)
  const typed = parts
    .flatMap((part) => (part.kind === 'text' ? [part.text] : []))
    .join('\n\n')
  return (
    <Bubble
      mine
      who={r.you}
      at={item.at}
      actions={typed && <CopyButton said={typed} />}
    >
      <Folded>
        {parts.map((part, index) => (
          <Part key={index} part={part} />
        ))}
      </Folded>
      {!!item.images &&
        (session && item.ref ? (
          <TurnImages session={session} line={item.ref} count={item.images} />
        ) : (
          <ImagesChip count={item.images} />
        ))}
    </Bubble>
  )
}

/** How many images went with a turn, where they cannot be shown */
function ImagesChip({ count }: { count: number }) {
  const t = useText(text)
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-background px-2.5 py-0.5 text-meta text-muted-foreground">
      <ImageIcon aria-hidden="true" className="size-3.5" />
      {t.images(count)}
    </span>
  )
}

/**
 * The images sent with a turn of yours, each from its log (its line, and
 * its place in the turn), opened large on a click; their count on a Mac or
 * device that does not give them
 */
function TurnImages({
  session,
  line,
  count,
}: {
  session: string
  line: string
  count: number
}) {
  if (!window.pacenoteDesktop?.sessions?.image)
    return <ImagesChip count={count} />
  return (
    <ul className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, index) => (
        <TurnImage key={index} session={session} line={line} index={index} />
      ))}
    </ul>
  )
}

function TurnImage({
  session,
  line,
  index,
}: {
  session: string
  line: string
  index: number
}) {
  const t = useText(text)
  const image = useSessionImage(session, line, index)
  const [open, setOpen] = useState(false)
  if (image.isPending)
    return (
      <li aria-hidden="true" className="motion-skeleton">
        <SkeletonBlock className="size-24 rounded-lg" />
      </li>
    )
  if (!image.data)
    return (
      <li>
        <ImagesChip count={1} />
      </li>
    )
  return (
    <li>
      <button
        type="button"
        aria-label={t.openImage(index + 1)}
        onClick={() => setOpen(true)}
        className="block overflow-hidden rounded-lg border border-border bg-background hover:opacity-90"
      >
        <img
          src={image.data}
          alt=""
          className="max-h-40 max-w-60 object-contain"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-[90vw] overflow-hidden p-2">
          <DialogTitle className="sr-only">{t.image(index + 1)}</DialogTitle>
          <img
            src={image.data}
            alt={t.image(index + 1)}
            className="max-h-[calc(90vh-1rem)] max-w-[calc(90vw-1rem)] object-contain"
          />
        </DialogContent>
      </Dialog>
    </li>
  )
}

/** A part of a turn of yours */
function Part({ part }: { part: SaidPart }) {
  switch (part.kind) {
    case 'text':
      return (
        <p className="text-body leading-relaxed whitespace-pre-wrap text-foreground/85 select-text">
          {part.text}
        </p>
      )
    case 'command':
      return (
        <p className="flex items-center gap-1.5 font-mono text-copy select-text">
          <SquareSlash
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="font-medium">{part.name}</span>
          {part.args && (
            <span className="min-w-0 break-words text-muted-foreground">
              {part.args}
            </span>
          )}
        </p>
      )
    case 'shell':
      return (
        <p className="flex items-start gap-1.5 font-mono text-copy select-text">
          <SquareTerminal
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 break-words">{part.command}</span>
        </p>
      )
    case 'output':
      return (
        <pre
          className={cn(
            'max-h-64 overflow-auto rounded-[10px] bg-background px-3 py-2 font-mono text-meta break-words whitespace-pre-wrap select-text',
            part.error ? 'text-status-failed' : 'text-foreground/80'
          )}
        >
          {part.text}
        </pre>
      )
    default:
      return <NoteText part={part} />
  }
}

function NoteText({ part }: { part: SaidPart }) {
  const t = useText(text)
  const stopped = part.kind === 'stopped'
  const Icon = stopped ? CircleStop : Bell
  return (
    <span className="flex items-center gap-2 text-meta text-muted-foreground">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 break-words">
        {stopped ? t.stopped : part.kind === 'note' ? part.text : ''}
      </span>
    </span>
  )
}

/** A stop or a notice, on a line of its own */
function NoteLine({ part }: { part: SaidPart }) {
  return (
    <li className="ml-10 px-2.5">
      <NoteText part={part} />
    </li>
  )
}

/** Where Claude Code compacted the conversation, its summary to open */
function Compacted({ summary }: { summary: string }) {
  const t = useText(text)
  const [open, setOpen] = useState(false)
  return (
    <li className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-meta text-muted-foreground">
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 hover:bg-muted hover:text-foreground"
        >
          <ScrollText aria-hidden="true" className="size-3.5" />
          {t.compacted}
          <ChevronDown
            aria-hidden="true"
            className={cn('size-3.5', open && 'rotate-180')}
          />
        </button>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      {open && (
        <div className="rounded-[20px] bg-well px-4 py-3">
          <Answer text={summary} />
        </div>
      )}
    </li>
  )
}

/** One step: what it used, on what, and how it came back */
function StepLine({
  name,
  target,
  cwd,
  failed,
  status,
}: {
  name: string
  target: string
  cwd: string
  failed?: boolean
  status?: ReactNode
}) {
  const t = useText(text)
  const Icon = stepIcon(name)
  const label = toolLabel(name)
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-1 text-meta">
      <Icon
        aria-hidden="true"
        className={cn(
          'size-3.5 shrink-0',
          failed ? 'text-status-failed' : 'text-muted-foreground'
        )}
      />
      <span className="shrink-0 font-medium">{label}</span>
      {target && target !== name && (
        <span
          title={target}
          className="min-w-0 truncate font-mono text-muted-foreground"
        >
          {stepTarget(target, cwd)}
        </span>
      )}
      {failed && (
        <span className="shrink-0 font-medium text-status-failed">
          {t.failed}
        </span>
      )}
      {status}
    </div>
  )
}

/** Steps in a row: each on its line, or folded into one past a few */
function Steps({ items, cwd }: { items: SessionItem[]; cwd: string }) {
  const t = useText(text)
  const [open, setOpen] = useState(false)
  const folds = items.length > STEPS_SHOWN
  if (folds && !open) {
    const used = new Map<string, number>()
    for (const item of items) {
      const label = toolLabel(item.name ?? '')
      used.set(label, (used.get(label) ?? 0) + 1)
    }
    const names = [...used]
      .sort((a, b) => b[1] - a[1])
      .slice(0, STEP_NAMES)
      .map(([label, count]) => (count > 1 ? `${label} ${count}` : label))
      .join(' · ')
    const failed = items.filter((item) => item.failed).length
    return (
      <li className="ml-10">
        <button
          type="button"
          aria-expanded={false}
          aria-label={t.showSteps}
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1 text-left text-meta hover:bg-muted"
        >
          <Layers
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="shrink-0 font-medium">{t.steps(items.length)}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {names}
          </span>
          {failed > 0 && (
            <span className="shrink-0 font-medium text-status-failed">
              {t.failedCount(failed)}
            </span>
          )}
          <ChevronRight
            aria-hidden="true"
            className="ml-auto size-3.5 shrink-0 text-muted-foreground"
          />
        </button>
      </li>
    )
  }
  return (
    <li className="ml-10 flex flex-col">
      {items.map((item, index) => (
        <StepLine
          key={index}
          name={item.name ?? ''}
          target={item.text}
          cwd={cwd}
          failed={item.failed}
        />
      ))}
      {folds && (
        <button
          type="button"
          aria-expanded
          onClick={() => setOpen(false)}
          className="flex w-fit items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-meta text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronDown aria-hidden="true" className="size-3.5 rotate-180" />
          {t.foldSteps}
        </button>
      )}
    </li>
  )
}

/**
 * What you sent that Claude Code has not read yet, after the conversation:
 * one sent while it works waits for the step it is on
 */
export function SentItems({
  sent,
}: {
  sent: readonly { text: string; queued: boolean; images?: number }[]
}) {
  const r = useText(rowText)
  const t = useText(text)
  return sent.map((one, index) => (
    <Bubble
      key={index}
      mine
      waiting
      who={r.you}
      status={
        one.queued && (
          <span
            title={t.queuedNote}
            className="rounded-full bg-background px-2 py-px text-caption font-medium text-muted-foreground"
          >
            {t.queued}
          </span>
        )
      }
    >
      {one.text && (
        <Folded>
          <p className="text-body leading-relaxed whitespace-pre-wrap text-foreground/85 select-text">
            {one.text}
          </p>
        </Folded>
      )}
      {!!one.images && <ImagesChip count={one.images} />}
    </Bubble>
  ))
}

/**
 * An answer as written so far: a code block it is in the middle of is closed
 * for now, so what follows does not read as code until it is
 */
export function closeFence(draft: string): string {
  const fences = draft.match(/^ {0,3}(`{3,}|~{3,})/gm) ?? []
  return fences.length % 2 ? `${draft}\n${fences.at(-1)!.trim()}` : draft
}

/** A dot that pulses, and what it does */
function Doing({ label, since }: { label: string; since?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-meta font-medium text-status-running">
      <span
        aria-hidden="true"
        className="size-1.5 animate-pulse-dot rounded-full bg-status-running"
      />
      {label}
      {since && <Elapsed since={since} />}
    </span>
  )
}

/** How long since its turn began, by the second */
function Elapsed({ since }: { since: string }) {
  const t = useText(text)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.round((now - Date.parse(since)) / 1000))
  return (
    <span className="font-normal text-muted-foreground tabular-nums">
      · {t.elapsed(seconds)}
    </span>
  )
}

/**
 * What it does this moment, at the end of the conversation: the answer it
 * writes as it comes, the step it runs, or that it thinks or works. For a
 * session open somewhere else, that it works there.
 */
export function NowItem({
  live,
  draft,
  tool,
  cwd,
  where,
}: {
  live?: SessionLive
  /** The answer it writes, kept on until its log has it */
  draft?: string
  tool: string
  cwd: string
  /** Where it works, for one open somewhere else */
  where?: string
}) {
  const t = useText(text)
  const writing = live?.busy && live.doing === 'writing'
  const answer = draft && (
    <Bubble
      mine={false}
      who={tool}
      status={writing && <Doing label={t.writing} since={live.since} />}
    >
      <Answer text={closeFence(draft)} />
    </Bubble>
  )
  if (!live?.busy || live.ask)
    return (
      <>
        {answer}
        {where && (
          <li className="ml-10 px-2.5 py-1">
            <Doing label={t.workingIn(where)} />
          </li>
        )}
      </>
    )
  if (answer && writing) return answer
  const now =
    live.doing === 'tool' && live.step && !PLAN_TOOLS.has(live.step.name) ? (
      <li className="ml-10">
        <StepLine
          name={live.step.name}
          target={live.step.text}
          cwd={cwd}
          status={<Doing label={t.running} since={live.since} />}
        />
      </li>
    ) : (
      <li className="ml-10 px-2.5 py-1">
        <Doing
          label={
            live.doing === 'thinking'
              ? t.thinking
              : live.doing === 'writing'
                ? t.writing
                : t.working
          }
          since={live.since}
        />
      </li>
    )
  return (
    <>
      {answer}
      {now}
    </>
  )
}
