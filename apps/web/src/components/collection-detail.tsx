import { collectionTitle, type CollectionRunRecord } from '@history/types'
import { CLI_NAMES, isOwnCli, unableWords } from '@src/tasks/own-ai'
import type { TaskStatus } from '@src/tasks/types'
import {
  CircleCheck,
  ClipboardCheck,
  Cpu,
  EyeOff,
  ListChecks,
  ListPlus,
  Lock,
  MessageSquare,
  PencilLine,
  Plug,
  Search,
  Smile,
  TriangleAlert,
  UserRound,
  Wrench,
} from 'lucide-react'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  collectionResult,
  lookupGroups,
  type LookupGroup,
} from '@history/collection-steps'
import { formatDateTime, formatDuration } from '@/lib/format'
import { useLocale, useText } from '@/lib/i18n'
import { useTasks } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { switchLine } from './own-ai-status'
import { CodeBlock } from './code-block'
import { text } from './collection-detail.text'
import { PacenoteMark } from './logo'
import { DurationFact, Empty, Fact, RawJson, TokensFact } from './run-facts'
import { StatusBadge } from './status'
import { recordText } from '@src/history/record-text'

/**
 * A task collection's run. No chat bubbles: how it started, what it did to
 * your tasks, its lookups, the rules Pacenote gave it, and the record. What
 * the Slack connector returned is not in the record, so it is not shown.
 */
export function CollectionDetail({ run }: { run: CollectionRunRecord }) {
  const t = useText(text)
  const locale = useLocale()
  return (
    <Tabs defaultValue="result" className="flex h-full min-h-0 flex-col">
      <header className="border-b bg-card/90 px-8 pt-6 pb-0 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2 text-meta text-muted-foreground">
            <StatusBadge status={run.status} />
            <Badge variant="secondary">
              <ListChecks />
              {t.taskCollection}
            </Badge>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{t.trigger[run.trigger]}</span>
              <span className="text-muted-foreground/60">·</span>
              <span className="shrink-0 tabular-nums">
                {formatDateTime(run.startedAt)}
              </span>
            </span>
            <Button
              asChild
              variant="outline"
              size="xs"
              className="ml-auto shrink-0"
            >
              <a href="#/tasks">
                <ListChecks />
                {t.openTodo}
              </a>
            </Button>
          </div>
          <h1 className="mt-2.5 line-clamp-2 text-title leading-snug select-text">
            {collectionTitle(run, locale)}
          </h1>
          <TabsList className="mt-4 mb-3">
            <TabsTrigger value="result">{t.tabResult}</TabsTrigger>
            <TabsTrigger value="lookups">
              {t.tabLookups}
              <span className="rounded-sm bg-muted px-1 text-caption tabular-nums">
                {run.reads ?? 0}
              </span>
            </TabsTrigger>
            <TabsTrigger value="rules">{t.tabRules}</TabsTrigger>
            <TabsTrigger value="raw">JSON</TabsTrigger>
          </TabsList>
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="@container mx-auto max-w-3xl px-8 py-6">
          <CollectionFacts run={run} />
          <TabsContent value="result" className="select-text">
            <Result run={run} />
          </TabsContent>
          <TabsContent value="lookups" className="select-text">
            <Lookups run={run} />
          </TabsContent>
          <TabsContent value="rules" className="select-text">
            <Rules run={run} />
          </TabsContent>
          <TabsContent value="raw" className="select-text">
            <RawJson run={run} />
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  )
}

/** Duration, lookups, tokens, the reasoner, and how it read Slack */
function CollectionFacts({ run }: { run: CollectionRunRecord }) {
  const t = useText(text)
  const reads = run.reads ?? 0
  return (
    <div className="mb-8 grid grid-cols-2 gap-y-4 border-b border-border pb-6 @min-[40rem]:grid-cols-5">
      <DurationFact run={run} label={t.duration} />
      <Fact
        icon={<Search />}
        label={t.lookups}
        value={String(reads)}
        hint={t.lookupsHint}
      />
      <TokensFact run={run} cacheWrite />
      <Fact
        icon={<Cpu />}
        label={t.collectedBy}
        value={
          isOwnCli(run.backend.reasoner)
            ? CLI_NAMES[run.backend.reasoner]
            : run.backend.reasoner
        }
        hint={
          run.switched
            ? `${CLI_NAMES[run.switched.from]} ${unableWords(run.switched.unable)}`
            : run.backend.sandbox === 'host'
              ? t.onYourMac
              : undefined
        }
        tip={run.switched && switchLine(run.switched)}
      />
      <Fact
        icon={<Plug />}
        label={t.readSlackAs}
        value={reads ? t.you : '-'}
        hint={
          reads
            ? run.backend.reasoner === 'codex'
              ? t.chatGptApp
              : t.claudeConnector
            : t.nothingRead
        }
      />
    </div>
  )
}

/** Where a task is now, by its color; its words are in text */
const STATE: Record<TaskStatus, string> = {
  open: 'text-primary',
  maybe: 'text-muted-foreground',
  done: 'text-muted-foreground',
  dismissed: 'text-muted-foreground',
  closed: 'text-muted-foreground',
}

/**
 * What it added, updated, closed, wrapped up and left out, with where each
 * task is now
 */
function Result({ run }: { run: CollectionRunRecord }) {
  const t = useText(text)
  const tasks = useTasks().data?.tasks ?? []
  const now = new Map(tasks.map((task) => [task.id, task.status]))
  if (run.status === 'running')
    return <Empty>{t.collecting(run.reads ?? 0)}</Empty>
  if (!run.found) return <Stopped run={run} />
  const { added, closed, updated, wrapped, skipped } = collectionResult(run)
  if (
    !added.length &&
    !closed.length &&
    !updated.length &&
    !wrapped.length &&
    !skipped.length
  )
    return <p className="text-copy text-muted-foreground">{t.nothingNew}</p>
  const maybes = added.filter((task) => task.confidence === 'maybe').length
  return (
    <div className="space-y-7">
      {added.length > 0 && (
        <Section
          icon={<ListPlus className="text-primary" />}
          title={t.added}
          meta={t.addedMeta(added.length - maybes, maybes)}
        >
          {added.map((task) => (
            <TaskRow
              key={task.id}
              id={task.id}
              title={task.title}
              meta={task.confidence === 'maybe' ? t.maybe : undefined}
              state={now.get(task.id)}
            />
          ))}
        </Section>
      )}
      {closed.length > 0 && (
        <Section
          icon={<CircleCheck className="text-primary" />}
          title={t.closed}
          meta={t.tasks(closed.length)}
        >
          {closed.map((task) => (
            <TaskRow
              key={task.id}
              id={task.id}
              title={task.title}
              meta={[t.why[task.why] ?? task.why, task.wrapUp]
                .filter(Boolean)
                .join(' · ')}
              state={now.get(task.id)}
            />
          ))}
        </Section>
      )}
      {updated.length > 0 && (
        <Section
          icon={<PencilLine className="text-primary" />}
          title={t.updated}
          meta={t.tasks(updated.length)}
        >
          {updated.map((task, index) => (
            <TaskRow
              key={`${task.id}-${index}`}
              id={task.id}
              title={task.title}
              meta={task.why}
              state={now.get(task.id)}
            />
          ))}
        </Section>
      )}
      {wrapped.length > 0 && (
        <Section
          icon={<ClipboardCheck className="text-primary" />}
          title={t.wrappedUp}
          meta={t.tasks(wrapped.length)}
        >
          {wrapped.map((task) => (
            <TaskRow
              key={task.id}
              id={task.id}
              title={task.title}
              meta={task.wrapUp}
              state={now.get(task.id)}
            />
          ))}
        </Section>
      )}
      {skipped.length > 0 && (
        <Section
          icon={<EyeOff className="text-muted-foreground" />}
          title={t.leftOut}
          meta={t.messages(skipped.length)}
        >
          {skipped.map((item, index) => (
            <li
              key={`${item.link ?? ''}-${index}`}
              className="border-t border-border py-3 text-body text-muted-foreground"
            >
              {item.why ?? t.leftOutInSettings}
            </li>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({
  icon,
  title,
  meta,
  children,
}: {
  icon: React.ReactNode
  title: string
  meta: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        <h2 className="text-section">{title}</h2>
        <span className="ml-auto text-meta text-muted-foreground">{meta}</span>
      </div>
      <ul className="mt-2.5">{children}</ul>
    </section>
  )
}

function TaskRow({
  id,
  title,
  meta,
  state,
}: {
  id: string
  title: string
  meta?: string
  state?: TaskStatus
}) {
  const t = useText(text)
  return (
    <li className="flex items-start gap-4 border-t border-border py-3">
      <div className="min-w-0 flex-1">
        <a
          href={`#/tasks/${encodeURIComponent(id)}`}
          className="text-section underline-offset-2 hover:underline"
        >
          {title}
        </a>
        {meta && <p className="mt-1 text-meta text-muted-foreground">{meta}</p>}
      </div>
      {state && (
        <span className={cn('shrink-0 text-meta', STATE[state])}>
          {t.state[state]}
        </span>
      )}
    </li>
  )
}

/** A collection that did not finish: why, and what to do about it */
function Stopped({ run }: { run: CollectionRunRecord }) {
  const t = useText(text)
  // Records from before unable was kept say so only in their (English) words
  const connector =
    run.unable === 'connector' || /slack connector/i.test(run.error ?? '')
  return (
    <div className="space-y-5">
      <div className="flex gap-2 rounded-xl bg-status-failed/10 px-4 py-3 text-copy">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-failed" />
        <div className="min-w-0">
          <p className="font-medium text-status-failed">
            {run.status === 'interrupted' ? t.stopped : t.couldNotFinish}
          </p>
          <p className="mt-0.5 text-copy break-words">
            {run.error ? recordText(run.error) : t.stoppedEarly}
          </p>
          {connector && (
            <p className="mt-1.5 text-meta text-muted-foreground">
              {t.connectorNote}
            </p>
          )}
        </div>
      </div>
      <p className="text-copy text-muted-foreground">{t.nothingChanged}</p>
    </div>
  )
}

/** Its tool calls in order, with what was not kept said so */
function Lookups({ run }: { run: CollectionRunRecord }) {
  const t = useText(text)
  const groups = lookupGroups(run)
  if (!groups.length) return <Empty>{t.noLookups}</Empty>
  return (
    <div>
      <p className="mb-3 text-body text-muted-foreground">
        {t.lookupsIntro(
          run.reads ?? 0,
          run.durationMs !== undefined
            ? formatDuration(run.durationMs)
            : undefined
        )}
      </p>
      <ol>
        {groups.map((group, index) => (
          <li
            key={index}
            className="grid grid-cols-[3.25rem_1.25rem_minmax(0,1fr)_auto] items-start gap-x-2.5 border-t border-border py-2.5"
          >
            <span className="text-caption leading-5 text-muted-foreground tabular-nums">
              +{formatDuration(group.offsetMs)}
            </span>
            <span className="grid h-5 place-items-center text-muted-foreground [&_svg]:size-3.5">
              <LookupIcon group={group} />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-body font-medium">{group.label}</span>
                {group.count > 1 && (
                  <span className="rounded-md bg-muted px-1.5 text-caption leading-[18px] tabular-nums">
                    ×{group.count}
                  </span>
                )}
                <span className="font-mono text-caption text-muted-foreground">
                  {group.tool}
                </span>
                {group.failed > 0 && (
                  <span className="text-caption text-status-failed">
                    {t.failed(group.failed)}
                  </span>
                )}
              </span>
              {group.note && (
                <span className="mt-0.5 block text-meta text-muted-foreground">
                  {group.note}
                </span>
              )}
            </span>
            <span className="text-caption leading-5 text-muted-foreground tabular-nums">
              {group.durationMs !== undefined
                ? formatDuration(group.durationMs)
                : ''}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-well px-3 py-2.5 text-meta text-muted-foreground">
        <Lock className="mt-px size-3.5 shrink-0" />
        {t.notKept}
      </p>
    </div>
  )
}

function LookupIcon({ group }: { group: LookupGroup }) {
  if (group.from === 'pacenote') return <PacenoteMark className="size-3.5" />
  if (group.from === 'cli') return <Wrench />
  if (group.tool.includes('search')) return <Search />
  if (group.tool.includes('reaction')) return <Smile />
  if (/user|profile|members/.test(group.tool)) return <UserRound />
  return <MessageSquare />
}

/** What collect_context gave it: the rules, since when, DMs, channels out */
function Rules({ run }: { run: CollectionRunRecord }) {
  const t = useText(text)
  const { rules } = collectionResult(run)
  if (!rules) return <Empty>{t.noRules}</Empty>
  let shown = rules
  try {
    shown = JSON.stringify(JSON.parse(rules), null, 2)
  } catch {
    // Cut at the record's length: shown as it is.
  }
  return (
    <CodeBlock label={t.rulesLabel} code={shown} maxHeight="max-h-[70vh]" />
  )
}
