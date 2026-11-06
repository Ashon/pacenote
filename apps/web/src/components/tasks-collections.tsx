import { newTokens } from '@history/usage'
import { localized } from '@src/i18n/locale'
import type { CollectionRecord } from '@src/tasks/types'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { formatHourMinute, formatShortDay, formatTokens } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { ROWS_AT_ONCE } from '@/lib/todo-list'
import { cn } from '@/lib/utils'
import { ShowMore } from './tasks-list'
import { text } from './tasks-page.text'

/**
 * The collections the app ran in the last 7 days, the latest first: when, how
 * each ended, and the new tokens it spent (the Overview has them per day). A
 * row opens the collection's run in Runs; the old log's rows have none.
 */
export function RecentCollections({
  collections,
}: {
  collections: CollectionRecord[]
}) {
  const t = useText(text)
  const [rows, setRows] = useState(ROWS_AT_ONCE)
  if (!collections.length)
    return (
      <p className="mt-3 border-t border-border py-8 text-copy text-muted-foreground">
        {t.noCollections}
      </p>
    )
  const spent = collections.map((entry) =>
    entry.usage ? newTokens(entry.usage) : 0
  )
  const max = Math.max(1, ...spent)
  const total = spent.reduce((sum, value) => sum + value, 0)
  return (
    <>
      <p className="mt-3 text-meta text-muted-foreground">
        {t.recentSummary(collections.length, formatTokens(total))}
      </p>
      <ul className="mt-3 text-body">
        {collections.slice(0, rows).map((entry, index) => (
          <li key={entry.startedAt} className="border-t border-border">
            <CollectionRow entry={entry}>
              <span className="font-medium tabular-nums">
                {formatShortDay(entry.startedAt)}{' '}
                {formatHourMinute(entry.startedAt)}
              </span>
              <span>
                <Badge variant="outline">{t.trigger[entry.trigger]}</Badge>
              </span>
              <span
                title={collectionNote(entry)}
                className={cn(
                  'truncate text-meta',
                  entry.ok ? 'text-muted-foreground' : 'text-status-interrupted'
                )}
              >
                {collectionNote(entry)}
              </span>
              <span className="flex items-center justify-end gap-2.5 text-meta">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-well">
                  {spent[index]! > 0 && (
                    <span
                      className="block h-full min-w-1.5 rounded-full bg-chart-4"
                      style={{ width: `${(spent[index]! / max) * 100}%` }}
                    />
                  )}
                </span>
                <span className="w-16 text-right font-medium tabular-nums">
                  {spent[index]
                    ? t.newTokens(formatTokens(spent[index]!))
                    : '-'}
                </span>
              </span>
            </CollectionRow>
          </li>
        ))}
      </ul>
      <ShowMore
        hidden={collections.length - rows}
        onShow={() => setRows(rows + ROWS_AT_ONCE)}
      />
    </>
  )
}

const ROW =
  'grid grid-cols-[7.25rem_6.75rem_minmax(0,1fr)_11rem_1rem] items-center gap-x-4 py-2.5'

/** A collection's row: a link to its run when it has one */
function CollectionRow({
  entry,
  children,
}: {
  entry: CollectionRecord
  children: React.ReactNode
}) {
  const t = useText(text)
  // Another Mac's run is in that Mac's history
  if (!entry.runId || entry.mac)
    return (
      <div className={ROW}>
        {children}
        <span />
      </div>
    )
  return (
    <a
      href={`#/runs/${entry.runId}`}
      title={t.openRun}
      className={cn(
        ROW,
        'group -mx-2 rounded-lg px-2 transition-colors hover:bg-selected/50'
      )}
    >
      {children}
      <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-foreground" />
    </a>
  )
}

/** "23 lookups · 2 tasks, 1 Maybe", or why it stopped */
function collectionNote(entry: CollectionRecord): string {
  if (!entry.ok) return entry.error
  return localized(text).note(entry.reads ?? 0, entry.added, entry.maybe)
}
