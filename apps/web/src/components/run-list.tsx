import type { RunKind, RunStatus, RunSummary } from '@history/types'
import { AtSign, ImageIcon, ListChecks, Search, Wrench } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Placeholder } from '@/components/ui/motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonBlock, SkeletonText } from '@/components/ui/skeleton'
import { useRuns } from '@/lib/api'
import {
  formatDayGroup,
  formatDuration,
  formatHourMinute,
  formatRelative,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatusMark } from './status'

const KINDS: { value?: RunKind; label: string }[] = [
  { label: 'All' },
  { value: 'mention', label: 'Mentions' },
  { value: 'collection', label: 'Task collections' },
]

const FILTERS: { value?: RunStatus; label: string }[] = [
  { label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'interrupted', label: 'Interrupted' },
]

/** Groups runs by day. (the list is newest first) */
function groupByDay(runs: RunSummary[]): { day: string; runs: RunSummary[] }[] {
  const groups: { day: string; runs: RunSummary[] }[] = []
  for (const run of runs) {
    const day = formatDayGroup(run.startedAt)
    const last = groups.at(-1)
    if (last?.day === day) last.runs.push(run)
    else groups.push({ day, runs: [run] })
  }
  return groups
}

/**
 * Run list column: every job Pacenote ran, answers to mentions and task
 * collections, each saying what it was. The search query comes from the top
 * bar (SearchField).
 */
export function RunList({
  q,
  selectedId,
  onSelect,
}: {
  q: string
  selectedId?: string
  onSelect: (id: string) => void
}) {
  const [kind, setKind] = useState<RunKind>()
  const [status, setStatus] = useState<RunStatus>()
  const query = useDeferredValue(q)
  const runs = useRuns({ kind, status, q: query })

  return (
    <aside className="flex h-full w-full flex-col">
      {/* What kind of job on top, the state as a select under it */}
      <div className="space-y-2 px-3 pt-4 pb-2">
        <div role="radiogroup" className="flex rounded-lg bg-muted p-0.5">
          {KINDS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              role="radio"
              aria-checked={kind === filter.value}
              onClick={() => setKind(filter.value)}
              className={cn(
                'h-6 flex-auto rounded-md px-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                kind === filter.value
                  ? 'bg-card text-foreground shadow-xs dark:bg-selected'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="flex h-7 w-fit items-center gap-1.5 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground">
          Status
          <select
            value={status ?? ''}
            onChange={(e) =>
              setStatus((e.target.value || undefined) as RunStatus | undefined)
            }
            className="bg-transparent font-medium text-foreground outline-none"
          >
            {FILTERS.map((filter) => (
              <option key={filter.label} value={filter.value ?? ''}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-3">
          <Placeholder
            ready={Boolean(runs.data) || runs.isError}
            skeleton={<RunListSkeleton />}
          >
            {groupByDay(runs.data ?? []).map((group) => (
              <section key={group.day} className="mt-2 first:mt-0">
                <h3 className="px-3 pt-1.5 pb-1 text-2xs font-medium text-muted-foreground">
                  {group.day}
                </h3>
                <div className="space-y-0.5">
                  {group.runs.map((run) => (
                    <RunListItem
                      key={run.id}
                      run={run}
                      today={group.day === 'Today'}
                      selected={run.id === selectedId}
                      onSelect={() => onSelect(run.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
            {runs.data && runs.data.length === 0 && (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                {q || status
                  ? 'No runs match the filters.'
                  : kind === 'collection'
                    ? 'No task collections yet. Collect now on the Todo screen runs one.'
                    : 'Pace has not answered any mentions yet.'}
              </p>
            )}
            {runs.isError && (
              <p className="px-3 py-10 text-center text-sm text-destructive">
                Could not load run history.
              </p>
            )}
          </Placeholder>
        </div>
      </ScrollArea>
    </aside>
  )
}

/** Widths for skeleton items, so they do not read as one block */
const ITEM_WIDTHS = [
  ['82%', '58%'],
  ['64%', '70%'],
  ['88%', '52%'],
  ['56%', '64%'],
  ['74%', '48%'],
  ['68%', '60%'],
]

/** The list's place while the runs come: a day and its runs, as tall */
function RunListSkeleton() {
  return (
    <section>
      <SkeletonText
        className="px-3 pt-1.5 pb-1 text-2xs font-medium"
        width="18%"
      />
      <div className="space-y-0.5">
        {ITEM_WIDTHS.map(([title, meta], i) => (
          <div key={i} className="flex w-full gap-2.5 rounded-xl px-3 py-2.5">
            <SkeletonBlock className="mt-0.5 size-3.5 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1">
              <SkeletonText
                className="text-body leading-snug font-medium"
                width={title}
              />
              <SkeletonText className="mt-1.5 text-2xs" width={meta} />
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * One job: status, what it was about (a mention's request, a collection's
 * outcome; up to two lines), its kind with where it came from and when, and
 * its counts and duration. A mention's requester is shown in the detail view
 * and the tooltip.
 */
function RunListItem({
  run,
  today,
  selected,
  onSelect,
}: {
  run: RunSummary
  today: boolean
  selected: boolean
  onSelect: () => void
}) {
  const collection = run.kind === 'collection'
  return (
    <button
      type="button"
      onClick={onSelect}
      title={run.userName ? `@${run.userName}` : undefined}
      className={cn(
        'flex w-full gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors',
        // Selection only fills the surface without lifting it. (so one item
        // does not stand out in the list)
        selected ? 'bg-selected' : 'hover:bg-selected/50'
      )}
    >
      <StatusMark status={run.status} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-body leading-snug font-medium">
          {run.request || (
            <span className="text-muted-foreground">(empty request)</span>
          )}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 text-2xs text-muted-foreground [&_svg]:size-3 [&_svg]:shrink-0">
          {/* What it was: a mention from a channel, or a task collection */}
          {collection ? (
            <>
              <ListChecks />
              <span className="truncate font-medium text-foreground/70">
                Task collection
              </span>
            </>
          ) : (
            <>
              <AtSign aria-label="Mention" />
              <span className="truncate">{run.conversationLabel}</span>
            </>
          )}
          <span className="shrink-0 text-muted-foreground/60">·</span>
          <span className="shrink-0 tabular-nums">
            {today
              ? formatRelative(run.startedAt)
              : formatHourMinute(run.startedAt)}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2 tabular-nums">
            {collection && (
              <span className="flex items-center gap-0.5">
                <Search />
                {run.reads ?? 0}
              </span>
            )}
            {!collection && run.toolCalls > 0 && (
              <span className="flex items-center gap-0.5">
                <Wrench />
                {run.toolCalls}
              </span>
            )}
            {run.outputs > 0 && (
              <span className="flex items-center gap-0.5">
                <ImageIcon />
                {run.outputs}
              </span>
            )}
            {run.status !== 'running' && (
              <span>{formatDuration(run.durationMs)}</span>
            )}
          </span>
        </span>
      </span>
    </button>
  )
}
