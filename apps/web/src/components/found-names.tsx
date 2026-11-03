import { Check, Plus, RotateCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useFound } from '@/lib/found'
import { useText } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  hasName,
  pickName,
  type FoundGap,
  type FoundKey,
  type FoundName,
} from '@src/settings/found'
import { text } from './found-names.text'

/** What a setting's names could not be looked up without */
const GAPS: Partial<Record<FoundKey, FoundGap[]>> = {
  OPS_GIT_ALLOWED_OWNERS: ['noGh', 'ghSignedOut'],
  OPS_K8S_CONTEXTS: ['noKubectl'],
}

/** Settings whose names are paths, shown with ~ for your home */
const PATHS: ReadonlySet<FoundKey> = new Set(['OPS_FS_ROOT', 'OPS_SSH_KEY'])

/** How many names show before "N more" */
const SHOWN = 8

const short = (file: string) => file.replace(/^\/Users\/[^/]+(?=\/|$)/, '~')

/**
 * Under a Tools setting: the names this Mac has for it, to pick instead of
 * typing. A name picked goes into the draft like a typed one, so Save, its
 * checks and Revert work the same; picked again, it comes out. What could not
 * be looked at (gh signed out, no kubectl) says what to do about it, with Look
 * again for after; otherwise the names are looked up again when a connection
 * opens a minute later.
 */
export function FoundNames({
  setting,
  value,
  workFolder,
  onChange,
}: {
  setting: FoundKey
  /** The setting as the draft has it */
  value: string
  /** The work folder as the draft has it, for its repositories' owners */
  workFolder: string
  onChange: (value: string) => void
}) {
  const t = useText(text)
  const found = useFound(workFolder)
  const [all, setAll] = useState(false)
  const names = found.data?.names[setting] ?? []
  const gaps = (GAPS[setting] ?? []).filter((gap) =>
    found.data?.gaps.includes(gap)
  )
  if (names.length === 0 && gaps.length === 0) return null
  const shown = all ? names : names.slice(0, SHOWN)
  return (
    <div className="mt-2 space-y-1.5" data-found={setting}>
      {gaps.map((gap) => (
        <div
          key={gap}
          className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-status-interrupted"
        >
          <TriangleAlert className="mt-0.5 size-3 shrink-0 self-start" />
          <span className="min-w-0 flex-1">{t.gaps[gap]}</span>
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            disabled={found.isFetching}
            onClick={found.lookAgain}
          >
            <RotateCw className={cn(found.isFetching && 'animate-spin')} />
            {t.lookAgain}
          </Button>
        </div>
      ))}
      {names.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-muted-foreground">
            {t.onThisMac}
          </span>
          {shown.map((name) => (
            <NameChip
              key={name.value}
              name={name}
              path={PATHS.has(setting)}
              picked={hasName(setting, value, name.value)}
              onPick={() => onChange(pickName(setting, value, name.value))}
            />
          ))}
          {names.length > shown.length && (
            <Button size="xs" variant="ghost" onClick={() => setAll(true)}>
              {t.more(names.length - shown.length)}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function NameChip({
  name,
  path,
  picked,
  onPick,
}: {
  name: FoundName
  path: boolean
  picked: boolean
  onPick: () => void
}) {
  const t = useText(text)
  const count = name.count ?? 0
  const from =
    name.hosts && name.hosts.length > 0
      ? t.from.range(name.hosts)
      : name.from === 'home'
        ? t.from.home(count)
        : name.from === 'repositories'
          ? t.from.repositories(count)
          : name.from === 'sshConfig'
            ? t.from.sshConfig(count)
            : t.from[name.from]
  const Icon = picked ? Check : Plus
  return (
    <button
      type="button"
      aria-pressed={picked}
      title={picked ? `${from}. ${t.picked}` : from}
      onClick={onPick}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-meta transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        picked
          ? 'border-primary/50 bg-primary/6 text-foreground'
          : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
      )}
    >
      <Icon
        className={cn(
          'size-3 shrink-0',
          picked ? 'text-primary' : 'text-muted-foreground'
        )}
      />
      <span className={cn('truncate', path && 'font-mono')}>
        {path ? short(name.value) : name.value}
      </span>
      {(name.from === 'home' || (name.hosts?.length ?? 0) > 1) && (
        <span className="text-caption text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </button>
  )
}
