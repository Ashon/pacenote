import type { FailureCause } from '../mention/failure.js'
import type { Switch, Unable } from '../tasks/own-ai.js'
import type { MessengerId } from '../messengers/ids.js'
import type { TokenUsage } from './usage.js'
import type { Locale } from '../i18n/locale.js'
import { text } from './types.text.js'

/**
 * Pacenote run history format. The bot writes the answers to mentions, the
 * desktop app writes the task collections it runs (CollectionRunRecord), and
 * the desktop app reads both. (apps/web imports only the types) Location:
 * <PACENOTE_DATA_DIR>/runs/<YYYY-MM-DD>/<run id>/run.json, outputs in
 * artifacts/ in the same directory. normalizeRunRecord reads older versions in
 * the current shape:
 * - version 3 records usage in four parts (usage events)
 * - version 2 had inputTokens and cachedInputTokens as each CLI reported
 *   them: codex counted the cached input in inputTokens, claude did not
 * - version 1 (Slack only) had a slack field in place of origin
 */
export const RUN_RECORD_VERSION = 3

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'interrupted'

export type StepStatus = 'running' | 'completed' | 'failed'

export type RunEvent =
  | { kind: 'message'; at: string; text: string }
  | { kind: 'reasoning'; at: string; text: string }
  | {
      kind: 'tool'
      id: string
      at: string
      server: string
      tool: string
      arguments?: unknown
      status: StepStatus
      result?: string
      error?: string
      finishedAt?: string
    }
  | {
      kind: 'command'
      id: string
      at: string
      command: string
      status: StepStatus
      output?: string
      exitCode?: number | null
      finishedAt?: string
    }
  | {
      kind: 'usage'
      at: string
      /** Input not read from the cache */
      inputTokens?: number
      /** Input read from the cache */
      cacheReadTokens?: number
      /** Input written to the cache (claude) */
      cacheWriteTokens?: number
      outputTokens?: number
      /** claude's own cost figure, at API prices */
      costUsd?: number
    }
  | { kind: 'note'; at: string; text: string }
  | { kind: 'error'; at: string; message: string }

export interface RunAttachment {
  name: string
  source: string
  kind: 'image' | 'text' | 'pdf' | 'other'
  status: 'read' | 'skipped' | 'failed'
  reason?: string
  /** Images passed to the model are copied to artifacts/. */
  file?: string
}

export interface RunOutput {
  kind: 'generated' | 'diagram'
  /** File name under artifacts/ */
  file: string
  title: string
  /** Source text for diagrams (mermaid, dot, etc.) */
  source?: string
}

/** Where a request came from, and where the answer went */
export interface RunOrigin {
  messenger: MessengerId
  /** The conversation (Slack channel ID) and its label ("#ops") */
  conversation: string
  conversationLabel: string
  thread: string
  /** The mention's message ID */
  message: string
  /**
   * Older versions: the placeholder message that said Pace was working, which
   * the answer was edited into (later, deleted once the answer was posted)
   */
  placeholder?: string
  /** The mention in the messenger (older runs: the placeholder) */
  permalink?: string
  userId: string
  userName?: string
}

/** An answer to a mention */
export interface RunRecord {
  version: number
  /** Older records have none: every run was a mention */
  kind?: 'mention'
  id: string
  status: RunStatus
  attempts: number
  startedAt: string
  updatedAt: string
  finishedAt?: string
  durationMs?: number
  origin: RunOrigin
  request: string
  backend: { reasoner: string; sandbox: string; model?: string }
  context: { messages: number }
  attachments: RunAttachment[]
  prompt?: { system: string; user: string }
  events: RunEvent[]
  answer?: string
  outputs: RunOutput[]
  error?: string
  /** Why the reasoner failed, when the error says (src/mention/failure.ts) */
  cause?: FailureCause
}

/** What a run is: an answer to a mention, or a task collection */
export type RunKind = 'mention' | 'collection'

/**
 * A task collection the desktop app ran, kept as a run beside the answers. Its
 * tool calls stay, but not what the Slack connector returned nor the model's
 * own words, which quote your messages; Pacenote's own tools (the rules,
 * add_tasks, close_task) keep their arguments and answers.
 */
export interface CollectionRunRecord {
  version: number
  kind: 'collection'
  id: string
  status: RunStatus
  attempts: number
  startedAt: string
  updatedAt: string
  finishedAt?: string
  durationMs?: number
  /** How it started: Collect now on the Todo screen */
  trigger: 'now'
  backend: { reasoner: string; sandbox: string; model?: string }
  events: RunEvent[]
  /** Slack lookups it made */
  reads?: number
  /** What add_tasks kept, once it answered */
  found?: { added: number; maybe: number; skipped: number }
  error?: string
  /** Why the CLI could not collect at all (no connector, signed out ...) */
  unable?: Unable
  /**
   * The CLI chosen could not collect, so the other one did (backend names
   * the one that did)
   */
  switched?: Switch
}

/** Any run in the history */
export type HistoryRecord = RunRecord | CollectionRunRecord

export const isCollection = (
  record: HistoryRecord
): record is CollectionRunRecord => record.kind === 'collection'

/** Summary for the list screen */
export interface RunSummary {
  id: string
  kind: RunKind
  status: RunStatus
  startedAt: string
  durationMs?: number
  /** Mentions only */
  messenger?: MessengerId
  /** Where a mention came from ("#ops"), or how a collection started */
  conversationLabel: string
  userName?: string
  /** A mention's request, or what a collection did */
  request: string
  reasoner: string
  toolCalls: number
  /** Slack lookups (collections) */
  reads?: number
  /** What a collection added, for the app to word its title */
  found?: { added: number; maybe: number }
  outputs: number
  attempts: number
}

export interface RunQuery {
  kind?: RunKind
  status?: RunStatus
  /** Text to search for in the request, conversation, user, and answer */
  q?: string
  /**
   * Only runs started at or after this time (epoch ms), of the newest 1000
   * that match the rest
   */
  since?: number
  limit?: number
}

export interface RunStats {
  total: number
  byStatus: Record<RunStatus, number>
  /** Runs per day over the last 14 days (oldest -> newest) */
  daily: { day: string; runs: number; failed: number }[]
  /** Average duration of succeeded runs */
  avgDurationMs?: number
  /** Top 10 most used tools */
  topTools: { name: string; calls: number }[]
  /** Tokens over the same 14 days */
  tokens: TokenStats
}

/**
 * Tokens per day, apart by where they went: answering mentions (run history),
 * collecting tasks (the collections the desktop app ran) and writing recaps up
 * (Write it up, recaps.json)
 */
export interface TokenStats {
  /** Oldest -> newest, the same days as RunStats.daily */
  daily: {
    day: string
    mentions: TokenUsage
    collections: TokenUsage
    recaps: TokenUsage
  }[]
  /** Runs that recorded tokens */
  mentions: { runs: number; usage: TokenUsage }
  /** Collections, and the tasks and Maybes they added */
  collections: { count: number; found: number; usage: TokenUsage }
  /** Recaps written up */
  recaps: { count: number; usage: TokenUsage }
}

export function summarize(run: HistoryRecord): RunSummary {
  if (isCollection(run))
    return {
      id: run.id,
      kind: 'collection',
      status: run.status,
      startedAt: run.startedAt,
      durationMs: run.durationMs,
      conversationLabel: TRIGGER_LABEL[run.trigger],
      request: collectionTitle(run),
      reasoner: `${run.backend.reasoner}@${run.backend.sandbox}`,
      toolCalls: run.events.filter((e) => e.kind === 'tool').length,
      reads: run.reads ?? 0,
      ...(run.found
        ? { found: { added: run.found.added, maybe: run.found.maybe } }
        : {}),
      outputs: 0,
      attempts: run.attempts,
    }
  return {
    id: run.id,
    kind: 'mention',
    status: run.status,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    messenger: run.origin.messenger,
    conversationLabel: run.origin.conversationLabel,
    userName: run.origin.userName,
    request:
      run.request.length > 200
        ? `${run.request.slice(0, 197)}...`
        : run.request,
    reasoner: `${run.backend.reasoner}@${run.backend.sandbox}`,
    toolCalls: run.events.filter(
      (e) => e.kind === 'tool' || e.kind === 'command'
    ).length,
    outputs: run.outputs.length,
    attempts: run.attempts,
  }
}

export const TRIGGER_LABEL: Record<CollectionRunRecord['trigger'], string> = {
  now: 'Collect now',
}

/**
 * What a collection did, as its title: "Added 2 tasks and 1 Maybe", "Nothing
 * new to add", or why it stopped. In English for run summaries (AI tools read
 * them through MCP); the app words it in its language.
 */
export function collectionTitle(
  run: Pick<CollectionRunRecord, 'status' | 'error'> & {
    found?: { added: number; maybe: number }
  },
  locale: Locale = 'en'
): string {
  const t = text[locale]
  if (run.status === 'running') return t.collecting
  if (run.found) return t.added(run.found.added, run.found.maybe)
  // The first sentence of why it stopped
  const line = run.error?.trim().split('\n')[0] ?? ''
  const reason = (/^(.+?[.!?])(\s|$)/.exec(line)?.[1] ?? line).replace(
    /[.!?]$/,
    ''
  )
  return !reason || reason === text.en.stoppedBefore ? t.stoppedBefore : reason
}

/** A version 1 record's Slack fields */
interface SlackOrigin {
  channel: string
  channelLabel: string
  threadTs: string
  eventTs: string
  placeholderTs?: string
  permalink?: string
  userId: string
  userName?: string
}

/** Any run.json as read from disk, in the current shape */
export function normalizeHistoryRecord(
  raw: HistoryRecord | (Omit<RunRecord, 'origin'> & { slack: SlackOrigin })
): HistoryRecord {
  return 'kind' in raw && raw.kind === 'collection'
    ? raw
    : normalizeRunRecord(raw as RunRecord)
}

/**
 * A mention's run.json as read from disk, in the current shape whatever version
 * wrote it
 */
export function normalizeRunRecord(
  raw: RunRecord | (Omit<RunRecord, 'origin'> & { slack: SlackOrigin })
): RunRecord {
  const record =
    'slack' in raw && !('origin' in raw) ? withOrigin(raw) : (raw as RunRecord)
  return (record.version ?? 0) >= 3 ? record : withUsageParts(record)
}

function withOrigin({
  slack,
  ...rest
}: Omit<RunRecord, 'origin'> & { slack: SlackOrigin }): RunRecord {
  return {
    ...rest,
    origin: {
      messenger: 'slack',
      conversation: slack.channel,
      conversationLabel: slack.channelLabel,
      thread: slack.threadTs,
      message: slack.eventTs,
      placeholder: slack.placeholderTs,
      permalink: slack.permalink,
      userId: slack.userId,
      userName: slack.userName,
    },
  }
}

/**
 * Usage as versions 1 and 2 kept it: cachedInputTokens is the cache read, and
 * codex's inputTokens included it
 */
function withUsageParts(record: RunRecord): RunRecord {
  const older = (event: RunEvent) =>
    event.kind === 'usage' && 'cachedInputTokens' in event
  if (!record.events?.some(older)) return record
  const codex = record.backend?.reasoner === 'codex'
  return {
    ...record,
    events: record.events.map((event) => {
      if (event.kind !== 'usage' || !older(event)) return event
      const { cachedInputTokens, ...rest } = event as typeof event & {
        cachedInputTokens?: number
      }
      const cached = cachedInputTokens ?? 0
      return {
        ...rest,
        inputTokens:
          codex && rest.inputTokens !== undefined
            ? Math.max(0, rest.inputTokens - cached)
            : rest.inputTokens,
        cacheReadTokens: cachedInputTokens,
      }
    }),
  }
}
