import { CLI_NAMES } from '@src/tasks/own-ai'
import { SkeletonText } from '@/components/ui/skeleton'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { readStored, writeStored } from '@/lib/storage'
import { taskHash } from '@/lib/tasks'
import { daysSince, type TodayLine } from '@/lib/today'
import { text } from './today.text'

/** Todo's Today (lib/today.ts): three lines at most, above the tabs */

const LINES_KEY = 'pacenote.tasks.today'

/** How many lines it had last time: the skeleton holds their place */
export function lastToday(): number {
  return Number(readStored(LINES_KEY)) || 0
}

/** One row per line, each one line tall, so its place is known ahead */
const GRID =
  'mt-6 grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-copy'

export function TodaySkeleton({ lines }: { lines: number }) {
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

export function Today({ lines }: { lines: TodayLine[] }) {
  const t = useText(text)
  writeStored(LINES_KEY, String(lines.length))
  if (lines.length === 0) return null
  return (
    <dl aria-label={t.today} className={GRID}>
      {lines.map((line) => (
        <div key={line.kind} className="contents">
          <dt className="text-muted-foreground">{labelOf(t, line)}</dt>
          <dd className="truncate">
            <a href={taskHash(line.task.id)} className="hover:underline">
              {line.task.title}
            </a>
            <span className="text-muted-foreground">
              {' · '}
              {[noteOf(t, line), line.more > 0 && t.more(line.more)]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

type Text = (typeof text)['en']

const labelOf = (t: Text, line: TodayLine): string =>
  line.kind === 'you'
    ? t.waitingOnYou
    : line.kind === 'pickUp'
      ? t.pickUp
      : t.waitingOnOthers

function noteOf(t: Text, line: TodayLine): string {
  if (line.kind === 'you') {
    const asked = t.asked(line.task.askedBy, formatRelative(line.task.postedAt))
    return line.task.due ? `${asked} · ${t.due(line.task.due)}` : asked
  }
  if (line.kind === 'pickUp')
    return line.tool
      ? t.leftIn(CLI_NAMES[line.tool], formatRelative(line.at))
      : t.youStarted(formatRelative(line.at))
  return t.waited(daysSince(line.since))
}
