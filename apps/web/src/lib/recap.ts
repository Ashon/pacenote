import type {
  RecapArea,
  RecapItem,
  RecapPeriod,
  RecapView,
} from '@src/you/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/** A period's recap from the desktop app; the current one without a key */
export function useRecap(period: RecapPeriod, key?: string) {
  const bridge = window.pacenoteDesktop?.recap
  return useQuery({
    queryKey: ['recap', period, key ?? 'now'],
    queryFn: async () => (await bridge?.get(period, key)) ?? null,
    enabled: Boolean(bridge),
    refetchInterval: 60_000,
  })
}

/** Write it up: returns the error to show, if any */
export function useWriteRecap() {
  const client = useQueryClient()
  return async (view: RecapView) => {
    const result = await window.pacenoteDesktop?.recap.write(
      view.period,
      view.key
    )
    if (result?.view) {
      client.setQueryData(['recap', view.period, view.key], result.view)
      if (view.current)
        client.setQueryData(['recap', view.period, 'now'], result.view)
    }
    return result?.error
  }
}

export const recapHash = (period: RecapPeriod, key?: string) =>
  key ? `#/recap/${period}/${key}` : `#/recap/${period}`

const day = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleDateString('en-US', options)
const short = { weekday: 'short', month: 'short', day: 'numeric' } as const
const monthDay = { month: 'short', day: 'numeric' } as const

/** The day before a period ends: its last day */
const lastDay = (view: RecapView) =>
  new Date(Date.parse(view.end) - 86_400_000).toISOString()

/** What a recap is of, as its title says it */
export function recapTitle(view: RecapView): string {
  if (view.period === 'day')
    return view.current ? 'Today so far' : day(view.start, short)
  if (view.period === 'week')
    return view.current
      ? 'This week so far'
      : `Week of ${day(view.start, monthDay)}`
  const month = day(view.start, { month: 'long', year: 'numeric' })
  return view.current ? `${month} so far` : month
}

/** When it is, beside the title */
export function recapWhen(view: RecapView): string {
  if (view.period === 'day') return view.current ? day(view.start, short) : ''
  if (view.period === 'week')
    return `${day(view.start, short)} to ${day(
      view.current ? new Date().toISOString() : lastDay(view),
      short
    )}`
  return ''
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** An area's counts in words: "6 done · 18 commits · 4 days" */
export function areaCounts(area: RecapArea): string {
  return [
    area.done && `${area.done} done`,
    area.commits && plural(area.commits, 'commit'),
    area.days && plural(area.days, 'day'),
    area.asks && plural(area.asks, 'new ask'),
    area.runs && plural(area.runs, 'run'),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The period's totals in words, for the line under the bar */
export function totalsLine(view: RecapView): string {
  const { totals } = view
  return [
    `${totals.done} done`,
    plural(totals.commits, 'commit'),
    `work on ${plural(totals.days, 'day')}`,
    totals.carried &&
      (view.current
        ? `${totals.carried} still open`
        : `${totals.carried} carried over`),
  ]
    .filter(Boolean)
    .join(' · ')
}

export type CopyFormat = 'markdown' | 'slack' | 'summary'

/** A recap as text to paste: a standup, an update, or the summary alone */
export function recapText(view: RecapView, format: CopyFormat): string {
  if (format === 'summary') return view.written?.text ?? ''
  const bold = (text: string) =>
    format === 'slack' ? `*${text}*` : `**${text}**`
  const bullet = format === 'slack' ? '•' : '-'
  const line = (item: RecapItem) =>
    `${bullet} ${item.title}${item.area && view.period === 'day' ? ` (${item.area.name})` : ''}`
  const out: string[] = []
  if (view.period === 'day' && view.day) {
    const section = (title: string, items: RecapItem[] | undefined) => {
      if (!items?.length) return
      out.push(bold(title), ...items.map(line), '')
    }
    section('Yesterday', view.day.yesterday)
    section(view.current ? 'Done today' : 'Done', view.day.done)
    section('Doing', view.day.doing)
    section(
      view.current ? 'Next' : 'Still open',
      view.current ? view.day.next : view.areas.flatMap((area) => area.carried)
    )
    return out.join('\n').trim()
  }
  out.push(bold(recapTitle(view)))
  if (view.written) out.push('', view.written.text)
  for (const area of view.areas) {
    out.push('', `${bold(area.name)} (${areaCounts(area)})`)
    for (const item of area.items) out.push(line(item))
    if (area.commitsMore > 0)
      out.push(`${bullet} ${plural(area.commitsMore, 'more commit')}`)
    for (const item of area.carried)
      out.push(`${bullet} Carries over: ${item.title}`)
  }
  return out.join('\n').trim()
}
