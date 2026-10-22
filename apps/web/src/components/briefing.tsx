import { Placeholder } from '@/components/ui/motion'
import { SkeletonText } from '@/components/ui/skeleton'
import { briefLines, type BriefLine } from '@/lib/briefing'
import { useText } from '@/lib/i18n'
import { recapHash, useRecap } from '@/lib/recap'
import { readStored, writeStored } from '@/lib/storage'
import { taskHash } from '@/lib/tasks'
import { text } from './briefing.text'

/** The Overview's briefing (lib/briefing.ts): three lines at most */

const LINES_KEY = 'pacenote.overview.briefing'

/** How many lines it had last time: the skeleton holds their place */
export function lastBriefing(): number {
  return Number(readStored(LINES_KEY)) || 0
}

function rememberBriefing(lines: number) {
  writeStored(LINES_KEY, String(lines))
}

/** One row per line, each one line tall, so its place is known ahead */
const GRID =
  'mt-7 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-copy'

export function BriefingSkeleton({ lines }: { lines: number }) {
  if (lines === 0) return null
  return (
    <div className={GRID}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="contents">
          <SkeletonText className="text-copy" width="70%" />
          <SkeletonText className="text-copy" width={i % 2 ? '48%' : '64%'} />
        </div>
      ))}
    </div>
  )
}

/**
 * Today's recap can take a moment (it reads your commits), so the briefing
 * holds its own place, as many lines as last time, and the figures below it
 * do not wait for it.
 */
export function Briefing({ open }: { open: number | undefined }) {
  const t = useText(text)
  const recap = useRecap('day')
  const desktop = Boolean(window.pacenoteDesktop)
  const ready = !desktop || recap.isFetched
  const lines = briefLines(recap.data, open)
  if (ready && desktop) rememberBriefing(lines.length)
  return (
    <Placeholder
      ready={ready}
      className="flow-root"
      skeleton={<BriefingSkeleton lines={lastBriefing()} />}
    >
      {lines.length > 0 && (
        <dl aria-label={t.briefing} className={GRID}>
          {lines.map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className="truncate">
                <a href={hrefOf(line)} className="hover:underline">
                  {line.text}
                </a>
                {line.note && (
                  <span className="text-muted-foreground"> · {line.note}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Placeholder>
  )
}

function hrefOf({ opens }: BriefLine): string {
  if (opens === 'recap') return recapHash('day')
  if (opens === 'tasks') return '#/tasks'
  return taskHash(opens.task)
}
