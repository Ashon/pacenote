// Relative imports, so the tests (and the root's typecheck) can load it
import {
  getLocale,
  LOCALE_TAGS,
  localized,
} from '../../../../src/i18n/locale.js'
import { text } from './format.text.js'

const pad = (n: number) => String(n).padStart(2, '0')

/** 10/08 14:03:09 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${formatClock(iso)}`
}

/** 14:03:09 */
export function formatClock(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 14:03 */
export function formatHourMinute(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The day a time falls on, as whole days before today: 0 today, 1 yesterday */
export function daysAgo(iso: string, now = new Date()): number {
  const d = new Date(iso)
  const day = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  return Math.round((day(now) - day(d)) / 86_400_000)
}

const dateFormats = new Map<string, Intl.DateTimeFormat>()

/** A date format in the app's language, made once per language and options */
export function dateFormat(
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const tag = LOCALE_TAGS[getLocale()]
  const key = `${tag} ${JSON.stringify(options)}`
  let format = dateFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(tag, options)
    dateFormats.set(key, format)
  }
  return format
}

/** List group label: Today, Yesterday, Mon, Oct 6 (오늘, 어제, 10월 6일 (월)) */
export function formatDayGroup(iso: string, now = new Date()): string {
  const t = localized(text)
  const diff = daysAgo(iso, now)
  if (diff === 0) return t.today
  if (diff === 1) return t.yesterday
  return dateFormat({
    month: getLocale() === 'ko' ? 'long' : 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(iso))
}

/** A day in a short list: Today, Yesterday, Fri (for the last week) */
export function formatShortDay(iso: string, now = new Date()): string {
  const t = localized(text)
  const diff = daysAgo(iso, now)
  if (diff === 0) return t.today
  if (diff === 1) return t.yesterday
  return dateFormat({
    weekday: getLocale() === 'ko' ? 'long' : 'short',
  }).format(new Date(iso))
}

/** just now, 5m ago, 3h ago, 2d ago, then the date (10/08) */
export function formatRelative(iso: string, now = Date.now()): string {
  const t = localized(text)
  const sec = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (sec < 45) return t.justNow
  if (sec < 3600) return t.minutesAgo(Math.round(sec / 60))
  if (sec < 86_400) return t.hoursAgo(Math.floor(sec / 3600))
  const days = Math.floor(sec / 86_400)
  return days < 7 ? t.daysAgo(days) : formatDateTime(iso).slice(0, 5)
}

/** 850ms, 12.3s, 2m 5s, 2h 5m (2분 5초, 2시간 5분) */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || Number.isNaN(ms)) return '-'
  const t = localized(text)
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return t.seconds((ms / 1000).toFixed(1))
  // Splitting minutes and hours from the rounded seconds avoids "1m 60s".
  const total = Math.round(ms / 1000)
  const hours = Math.floor(total / 3600)
  const min = Math.floor((total % 3600) / 60)
  const sec = total % 60
  if (hours > 0) return min ? t.hoursMinutes(hours, min) : t.hours(hours)
  return sec ? t.minutesSeconds(min, sec) : t.minutes(min)
}

/** A longer wait, in words: 40 min, 3 hours, 1.5 days */
export function formatWait(ms: number): string {
  const t = localized(text)
  const min = Math.round(ms / 60_000)
  if (min < 60) return t.waitMinutes(Math.max(1, min))
  const hours = Math.round(ms / 3_600_000)
  if (hours < 24) return t.waitHours(hours)
  return t.waitDays(Number((ms / 86_400_000).toFixed(1)))
}

export const formatNumber = (n: number) =>
  n.toLocaleString(LOCALE_TAGS[getLocale()])

/** Token counts, short: 950, 8.6k, 37k, 1.54M */
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 9_950) return `${Number((n / 1000).toFixed(1))}k`
  if (n < 999_500) return `${Math.round(n / 1000)}k`
  return `${Number((n / 1_000_000).toFixed(2))}M`
}

/** Tool arguments as a one-line preview (host=web-01 check=uptime) */
export function previewArgs(args: unknown, max = 90): string {
  if (args === undefined || args === null) return ''
  let text: string
  if (typeof args === 'object' && !Array.isArray(args)) {
    text = Object.entries(args as Record<string, unknown>)
      .map(
        ([key, value]) =>
          `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`
      )
      .join(' ')
  } else {
    text = typeof args === 'string' ? args : JSON.stringify(args)
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

export function stepDuration(
  at: string,
  finishedAt?: string
): number | undefined {
  return finishedAt ? Date.parse(finishedAt) - Date.parse(at) : undefined
}
