import { getLocale, LOCALE_TAGS, localized } from '../i18n/locale.js'
import { lookupLabel } from '../tasks/sources.js'
import { text } from './collection-steps.text.js'
import type { CollectionRunRecord, RunEvent } from './types.js'

/**
 * A task collection's run as its detail shows it: its tool calls grouped, and
 * what Pacenote's own tools (collect_context, add_tasks, update_task,
 * close_task, wrap_up_task) answered.
 * The desktop app's UI reads it (apps/web, collection-detail.tsx).
 */

type ToolEvent = Extract<RunEvent, { kind: 'tool' }>

/** A task a collection added, as add_tasks answered */
export interface FoundTask {
  id: string
  title: string
  confidence?: string
}

/** What a collection did to your tasks, read from Pacenote's own tools */
export interface CollectionResult {
  added: FoundTask[]
  /** Closed from their thread, with how each ended when it said */
  closed: { id: string; title: string; why: string; wrapUp?: string }[]
  /** Open tasks its thread changed, and why */
  updated: { id: string; title: string; why: string }[]
  /** Tasks done or closed before, and how each ended */
  wrapped: { id: string; title: string; wrapUp: string }[]
  /** Messages add_tasks left out, and why */
  skipped: { link?: string; why?: string }[]
  /** The rules collect_context gave it, as it answered */
  rules?: string
}

/** Calls of one tool in a row, as the Lookups tab lists them */
export interface LookupGroup {
  /** The first call's start, from the collection's start */
  offsetMs: number
  label: string
  server: string
  tool: string
  count: number
  failed: number
  /** From the first call's start to the last one's end */
  durationMs?: number
  /** Pacenote's own tools: what they answered, in a line */
  note?: string
  /** Pacenote's tool, a source connector's, or the CLI's own */
  from: 'pacenote' | 'connector' | 'cli'
}

const toolsOf = (run: CollectionRunRecord) =>
  run.events.filter((event): event is ToolEvent => event.kind === 'tool')

function parse<T>(text: string | undefined): T | undefined {
  if (!text) return undefined
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

/**
 * What add_tasks, update_task, close_task and wrap_up_task did, and the rules
 * collect_context gave
 */
export function collectionResult(run: CollectionRunRecord): CollectionResult {
  const result: CollectionResult = {
    added: [],
    closed: [],
    updated: [],
    wrapped: [],
    skipped: [],
  }
  for (const call of toolsOf(run)) {
    if (call.server !== 'pacenote') continue
    if (call.tool === 'add_tasks') {
      const body = parse<{
        added?: FoundTask[]
        skipped?: { link?: string; why?: string }[]
      }>(call.result)
      result.added.push(...(body?.added ?? []))
      result.skipped.push(...(body?.skipped ?? []))
    } else if (call.tool === 'close_task') {
      const body = parse<{
        closed?: { id: string; title: string; why: string; wrapUp?: string }
      }>(call.result)
      if (body?.closed) result.closed.push(body.closed)
    } else if (call.tool === 'update_task') {
      const body = parse<{
        updated?: { id: string; title: string; why: string }
      }>(call.result)
      if (body?.updated) {
        const { id, title, why } = body.updated
        result.updated.push({ id, title, why })
      }
    } else if (call.tool === 'wrap_up_task') {
      const body = parse<{
        wrappedUp?: { id: string; title: string; wrapUp?: string }
      }>(call.result)
      if (body?.wrappedUp?.wrapUp) {
        const { id, title, wrapUp } = body.wrappedUp
        result.wrapped.push({ id, title, wrapUp })
      }
    } else if (call.tool === 'collect_context' && call.result) {
      result.rules = call.result
    }
  }
  return result
}

function noteFor(call: ToolEvent): string | undefined {
  if (call.server !== 'pacenote' || call.status === 'failed')
    return call.status === 'failed' ? call.error : undefined
  const t = localized(text)
  if (call.tool === 'add_tasks') {
    const body = parse<{ added?: FoundTask[]; skipped?: unknown[] }>(
      call.result
    )
    if (!body) return undefined
    const added = body.added ?? []
    const maybe = added.filter((task) => task.confidence === 'maybe').length
    return [
      t.added(added.length - maybe),
      maybe ? t.maybe(maybe) : undefined,
      body.skipped?.length
        ? t.leftOutBySettings(body.skipped.length)
        : undefined,
    ]
      .filter(Boolean)
      .join(', ')
  }
  if (call.tool === 'close_task') {
    const body = parse<{ closed?: { title: string; why: string } }>(call.result)
    return body?.closed
      ? `${body.closed.title} (${body.closed.why})`
      : undefined
  }
  if (call.tool === 'update_task') {
    const body = parse<{
      updated?: { title: string; why: string }
      unchanged?: { title: string; why: string }
    }>(call.result)
    const said = body?.updated ?? body?.unchanged
    return said ? `${said.title}: ${said.why}` : undefined
  }
  if (call.tool === 'wrap_up_task') {
    const body = parse<{
      wrappedUp?: { title: string; wrapUp?: string }
      unchanged?: { title: string; why: string }
    }>(call.result)
    if (body?.wrappedUp)
      return `${body.wrappedUp.title}: ${body.wrappedUp.wrapUp}`
    return body?.unchanged
      ? `${body.unchanged.title}: ${body.unchanged.why}`
      : undefined
  }
  if (call.tool === 'collect_context') {
    const body = parse<{ since?: string; dms?: boolean; leaveOut?: string[] }>(
      call.result
    )
    if (!body) return undefined
    return [
      body.since
        ? t.since(
            // Oct 20, 14:03 (10월 20일 14:03)
            new Date(body.since).toLocaleString(LOCALE_TAGS[getLocale()], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          )
        : undefined,
      body.dms ? t.dmsCount : t.dmsNotCounted,
      body.leaveOut?.length
        ? t.channelsLeftOut(body.leaveOut.length)
        : undefined,
    ]
      .filter(Boolean)
      .join(' · ')
  }
  return undefined
}

/**
 * A tool as a person reads it: Pacenote's, the CLI's or a source's, else by
 * its name
 */
function toolLabel(tool: string): string {
  const tools: Record<string, string> = localized(text).tools
  return (
    (Object.hasOwn(tools, tool) ? tools[tool] : undefined) ??
    lookupLabel(tool) ??
    tool
  )
}

/**
 * The collection's tool calls in order, calls of the same tool in a row
 * grouped ("Read a thread ×14")
 */
export function lookupGroups(run: CollectionRunRecord): LookupGroup[] {
  const start = Date.parse(run.startedAt)
  const groups: LookupGroup[] = []
  let last: { group: LookupGroup; end?: number } | undefined
  for (const call of toolsOf(run)) {
    const at = Date.parse(call.at)
    const end = call.finishedAt ? Date.parse(call.finishedAt) : undefined
    const from =
      call.server === 'pacenote'
        ? 'pacenote'
        : call.server === 'claude'
          ? 'cli'
          : 'connector'
    // Pacenote's own calls stay one per row: each has its own answer.
    if (
      last &&
      from !== 'pacenote' &&
      last.group.server === call.server &&
      last.group.tool === call.tool
    ) {
      last.group.count += 1
      if (call.status === 'failed') last.group.failed += 1
      if (end !== undefined) {
        last.end = Math.max(last.end ?? end, end)
        last.group.durationMs = last.end - (start + last.group.offsetMs)
      }
      continue
    }
    const group: LookupGroup = {
      offsetMs: Math.max(0, at - start),
      label: toolLabel(call.tool),
      server: call.server,
      tool: call.tool,
      count: 1,
      failed: call.status === 'failed' ? 1 : 0,
      durationMs: end !== undefined ? end - at : undefined,
      note: noteFor(call),
      from,
    }
    groups.push(group)
    last = { group, end }
  }
  return groups
}
