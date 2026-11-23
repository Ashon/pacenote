import type { MadeThing } from '@src/sessions/types'
import {
  AppWindow,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LayoutTemplate,
  Lock,
  NotebookText,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InlineError } from '@/components/ui/inline-error'
import { homePath } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { text } from './made-card.text'

/**
 * What a session made (A3, A4, A6, A8): a card where it published it last or
 * an answer linked it, and the chip under its title with the list. One on
 * claude.ai opens in your browser, signed in as you; a file opens in the
 * Mac's app for it, only on the Mac the session runs on (open). Pacenote
 * keeps the link alone.
 */

/** Opens a file it made, or shows it in Finder: the Mac's own */
export type OpenMade = (
  key: string,
  how: 'open' | 'show'
) => Promise<{ error?: string }>

const iconOf = (thing: MadeThing): LucideIcon =>
  thing.kind === 'doc'
    ? NotebookText
    : thing.kind === 'typed'
      ? LayoutTemplate
      : thing.kind === 'page' || thing.file === 'html'
        ? AppWindow
        : thing.file === 'image'
          ? ImageIcon
          : FileText

/** What it is and where, its version, how often it changed here */
function useMeta(thing: MadeThing, open?: OpenMade) {
  const t = useText(text)
  const kind =
    thing.kind === 'page'
      ? t.page
      : thing.kind === 'typed'
        ? t.typed(thing.typeName)
        : thing.kind === 'doc'
          ? t.doc
          : t.file(thing.file ?? 'markdown', !!open)
  const version =
    thing.version !== undefined
      ? [
          t.version(thing.version),
          thing.times > 1 && t.updatedHere(thing.times - 1),
        ]
          .filter(Boolean)
          .join(', ')
      : undefined
  return { kind, version }
}

function OnlyYou() {
  const t = useText(text)
  return (
    <span title={t.onlyYouHint} className="inline-flex items-center gap-1">
      <Lock aria-hidden="true" className="size-3" />
      {t.onlyYou}
    </span>
  )
}

/** A card of what it made, where it made it */
export function MadeCard({
  thing,
  open,
  compact,
}: {
  thing: MadeThing
  open?: OpenMade
  /** On a phone: its buttons are icons */
  compact?: boolean
}) {
  const t = useText(text)
  const { kind, version } = useMeta(thing, open)
  const [error, setError] = useState<string>()
  const Icon = iconOf(thing)
  const title = thing.title || t.untitled
  const folder = thing.path?.replace(/\/[^/]*$/, '')
  const opening = (how: 'open' | 'show') => {
    setError(undefined)
    void open?.(thing.key, how).then((result) => setError(result.error))
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-3 py-2.5">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground"
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p title={title} className="truncate text-copy font-medium">
            {title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-meta text-muted-foreground">
            <span>{[kind, version].filter(Boolean).join(' · ')}</span>
            {folder && (
              <>
                <span aria-hidden="true">·</span>
                <span className="max-w-full truncate font-mono">
                  {homePath(folder)}
                </span>
              </>
            )}
            {thing.onlyYou && (
              <>
                <span aria-hidden="true">·</span>
                <OnlyYou />
              </>
            )}
          </p>
        </div>
        {thing.url ? (
          <Button variant="outline" size={compact ? 'icon-sm' : 'sm'} asChild>
            <a
              href={thing.url}
              target="_blank"
              rel="noreferrer"
              aria-label={t.openTitle(title)}
            >
              <ExternalLink aria-hidden="true" />
              {!compact && t.open}
            </a>
          </Button>
        ) : (
          open && (
            <span className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.showInFinder}
                title={t.showInFinder}
                onClick={() => opening('show')}
              >
                <FolderOpen aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size={compact ? 'icon-sm' : 'sm'}
                aria-label={t.openTitle(title)}
                onClick={() => opening('open')}
              >
                <ExternalLink aria-hidden="true" />
                {!compact && t.open}
              </Button>
            </span>
          )
        )}
      </div>
      <InlineError error={error} className="px-3 text-meta" />
    </div>
  )
}

/** "Made here N" under a session's title: the list of what it made */
export function MadeChip({
  made,
  open,
}: {
  made: readonly MadeThing[]
  open?: OpenMade
}) {
  const t = useText(text)
  const onClaude = made.some((thing) => thing.url)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-px font-medium hover:text-foreground data-[state=open]:text-foreground">
        <LayoutTemplate aria-hidden="true" className="size-3" />
        {t.madeHere(made.length)}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)]"
      >
        <p className="px-2.5 pt-1.5 pb-1 text-meta font-medium text-muted-foreground">
          {t.madeInSession}
        </p>
        {made.map((thing) => (
          <MadeItem key={thing.key} thing={thing} open={open} />
        ))}
        {onClaude && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2.5 pt-1 pb-1.5 text-meta text-muted-foreground">
              {t.opensSignedIn}
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MadeItem({ thing, open }: { thing: MadeThing; open?: OpenMade }) {
  const t = useText(text)
  const { kind, version } = useMeta(thing, open)
  const Icon = iconOf(thing)
  const title = thing.title || t.untitled
  const body = (
    <>
      <Icon aria-hidden="true" className="mt-0.5 self-start" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {/* A narrow list: Only you on its own line, not after a wrapped dot */}
        <span className="flex flex-col items-start text-meta text-muted-foreground">
          <span>{[kind, version].filter(Boolean).join(' · ')}</span>
          {thing.onlyYou && <OnlyYou />}
        </span>
      </span>
    </>
  )
  const className = cn('h-auto items-start py-1.5')
  if (thing.url)
    return (
      <DropdownMenuItem asChild className={className}>
        <a href={thing.url} target="_blank" rel="noreferrer">
          {body}
        </a>
      </DropdownMenuItem>
    )
  // A file on another Mac, or on a phone: its name alone
  return (
    <DropdownMenuItem
      className={className}
      disabled={!open}
      onSelect={() => void open?.(thing.key, 'open')}
    >
      {body}
    </DropdownMenuItem>
  )
}

/**
 * A task's row of what its sessions made (A5): each opens in your browser,
 * a file is its name; a note to share them before a link goes to the one
 * who asked
 */
export function MadeLine({
  made,
  askedBy,
}: {
  made: readonly MadeThing[]
  askedBy?: string
}) {
  const t = useText(text)
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 py-1 text-body">
      <span className="flex min-h-[22px] items-center text-meta text-muted-foreground">
        {t.madeLabel}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        {made.map((thing) => (
          <MadeRow key={thing.key} thing={thing} />
        ))}
        {made.some((thing) => thing.onlyYou) && (
          <p className="text-meta text-muted-foreground">
            {t.shareFirst(askedBy)}
          </p>
        )}
      </div>
    </div>
  )
}

function MadeRow({ thing }: { thing: MadeThing }) {
  const t = useText(text)
  const { kind, version } = useMeta(thing)
  const Icon = iconOf(thing)
  const title = thing.title || t.untitled
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <Icon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      {thing.url ? (
        <a
          href={thing.url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate select-text hover:text-primary"
        >
          {title}
        </a>
      ) : (
        <span className="min-w-0 truncate select-text">{title}</span>
      )}
      <span className="flex items-center gap-x-1.5 text-meta text-muted-foreground">
        <span>{[kind, version].filter(Boolean).join(' · ')}</span>
        {thing.onlyYou && (
          <>
            <span aria-hidden="true">·</span>
            <OnlyYou />
          </>
        )}
      </span>
    </p>
  )
}
