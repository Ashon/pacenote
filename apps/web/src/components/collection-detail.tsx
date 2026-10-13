import {
  collectionTitle,
  TRIGGER_LABEL,
  type CollectionRunRecord,
} from '@history/types'
import { newTokens, runUsage } from '@history/usage'
import type { TaskStatus } from '@src/tasks/types'
import {
  CircleCheck,
  Coins,
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
  Timer,
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
import { formatDateTime, formatDuration, formatTokens } from '@/lib/format'
import { useTasks } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { CodeBlock } from './code-block'
import { PacenoteMark } from './logo'
import { Empty, Fact, UsageTip } from './run-facts'
import { StatusBadge } from './status'

/**
 * A task collection's run. No chat bubbles: how it started, what it did to
 * your tasks, its lookups, the rules Pacenote gave it, and the record. What
 * the Slack connector returned is not in the record, so it is not shown.
 */
export function CollectionDetail({ run }: { run: CollectionRunRecord }) {
  const lookups = lookupGroups(run)
  return (
    <Tabs defaultValue="result" className="flex h-full min-h-0 flex-col">
      <header className="border-b bg-card/90 px-8 pt-6 pb-0 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge status={run.status} />
            <Badge variant="secondary">
              <ListChecks />
              Task collection
            </Badge>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{TRIGGER_LABEL[run.trigger]}</span>
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
                Open Todo
              </a>
            </Button>
          </div>
          <h1 className="mt-2.5 line-clamp-2 text-lg leading-snug font-semibold tracking-tight select-text">
            {collectionTitle(run)}
          </h1>
          <TabsList className="mt-4 mb-3">
            <TabsTrigger value="result">Result</TabsTrigger>
            <TabsTrigger value="lookups">
              Lookups
              <span className="rounded bg-muted px-1 text-[10px] tabular-nums">
                {run.reads ?? 0}
              </span>
            </TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
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
            <Lookups run={run} groups={lookups} />
          </TabsContent>
          <TabsContent value="rules" className="select-text">
            <Rules run={run} />
          </TabsContent>
          <TabsContent value="raw" className="select-text">
            <CodeBlock
              code={JSON.stringify(run, null, 2)}
              maxHeight="max-h-[70vh]"
            />
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  )
}

/** Duration, lookups, tokens, the reasoner, and how it read Slack */
function CollectionFacts({ run }: { run: CollectionRunRecord }) {
  const usage = runUsage(run.events)
  const duration = run.durationMs ?? Date.now() - Date.parse(run.startedAt)
  const reads = run.reads ?? 0
  return (
    <div className="mb-8 grid grid-cols-2 gap-y-4 border-b border-border pb-6 @min-[40rem]:grid-cols-5">
      <Fact
        icon={<Timer />}
        label={run.status === 'running' ? 'Elapsed' : 'Duration'}
        value={formatDuration(duration)}
      />
      <Fact
        icon={<Search />}
        label="Lookups"
        value={String(reads)}
        hint="in Slack, read only"
      />
      <Fact
        icon={<Coins />}
        label="Tokens"
        value={usage ? `${formatTokens(newTokens(usage))} new` : '-'}
        hint={
          usage?.cacheRead
            ? `+${formatTokens(usage.cacheRead)} from cache`
            : undefined
        }
        tip={usage && <UsageTip usage={usage} cacheWrite />}
      />
      <Fact
        icon={<Cpu />}
        label="Reasoner"
        value={run.backend.reasoner}
        hint={run.backend.sandbox === 'host' ? 'on your Mac' : undefined}
      />
      <Fact
        icon={<Plug />}
        label="Read Slack as"
        value={reads ? 'You' : '-'}
        hint={reads ? "Claude's connector" : 'Nothing read'}
      />
    </div>
  )
}

const STATE: Record<TaskStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'text-primary' },
  maybe: { label: 'Maybe', className: 'text-muted-foreground' },
  done: { label: 'Done', className: 'text-muted-foreground' },
  dismissed: { label: 'Dismissed', className: 'text-muted-foreground' },
  closed: { label: 'Closed', className: 'text-muted-foreground' },
}

/** What it added, updated, closed and left out, with where each task is now */
function Result({ run }: { run: CollectionRunRecord }) {
  const tasks = useTasks().data?.tasks ?? []
  const now = new Map(tasks.map((task) => [task.id, task.status]))
  if (run.status === 'running')
    return <Empty>Collecting: {run.reads ?? 0} lookups so far.</Empty>
  if (!run.found) return <Stopped run={run} />
  const { added, closed, updated, skipped } = collectionResult(run)
  if (!added.length && !closed.length && !updated.length && !skipped.length)
    return (
      <p className="text-sm text-muted-foreground">
        Nothing new to add, and no open task changed or closed.
      </p>
    )
  const maybes = added.filter((task) => task.confidence === 'maybe').length
  return (
    <div className="space-y-7">
      {added.length > 0 && (
        <Section
          icon={<ListPlus className="text-primary" />}
          title="Added"
          meta={[
            `${added.length - maybes} ${added.length - maybes === 1 ? 'task' : 'tasks'}`,
            maybes ? `${maybes} ${maybes === 1 ? 'Maybe' : 'Maybes'}` : '',
          ]
            .filter(Boolean)
            .join(', ')}
        >
          {added.map((task) => (
            <TaskRow
              key={task.id}
              id={task.id}
              title={task.title}
              meta={task.confidence === 'maybe' ? 'Maybe' : undefined}
              state={now.get(task.id)}
            />
          ))}
        </Section>
      )}
      {closed.length > 0 && (
        <Section
          icon={<CircleCheck className="text-chart-1" />}
          title="Closed"
          meta={`${closed.length} ${closed.length === 1 ? 'task' : 'tasks'}`}
        >
          {closed.map((task) => (
            <TaskRow
              key={task.id}
              id={task.id}
              title={task.title}
              meta={WHY[task.why] ?? task.why}
              state={now.get(task.id)}
            />
          ))}
        </Section>
      )}
      {updated.length > 0 && (
        <Section
          icon={<PencilLine className="text-primary" />}
          title="Updated"
          meta={`${updated.length} ${updated.length === 1 ? 'task' : 'tasks'}`}
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
      {skipped.length > 0 && (
        <Section
          icon={<EyeOff className="text-muted-foreground" />}
          title="Left out by your settings"
          meta={`${skipped.length} ${skipped.length === 1 ? 'message' : 'messages'}`}
        >
          {skipped.map((item, index) => (
            <li
              key={`${item.link ?? ''}-${index}`}
              className="border-t border-border py-3 text-[13px] text-muted-foreground"
            >
              {item.why ?? 'Left out in Settings > Todo'}
            </li>
          ))}
        </Section>
      )}
    </div>
  )
}

const WHY: Record<string, string> = {
  replied: 'You replied in its thread',
  checked: 'Its message got a check mark',
  resolved: 'Settled another way',
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
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{meta}</span>
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
  return (
    <li className="flex items-start gap-4 border-t border-border py-3">
      <div className="min-w-0 flex-1">
        <a
          href={`#/tasks/${encodeURIComponent(id)}`}
          className="text-sm font-semibold underline-offset-2 hover:underline"
        >
          {title}
        </a>
        {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
      </div>
      {state && (
        <span className={cn('shrink-0 text-xs', STATE[state].className)}>
          {STATE[state].label}
        </span>
      )}
    </li>
  )
}

/** A collection that did not finish: why, and what to do about it */
function Stopped({ run }: { run: CollectionRunRecord }) {
  const connector = /slack connector/i.test(run.error ?? '')
  return (
    <div className="space-y-5">
      <div className="flex gap-2 rounded-xl bg-status-failed/10 px-4 py-3 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-failed" />
        <div className="min-w-0">
          <p className="font-medium text-status-failed">
            {run.status === 'interrupted' ? 'Stopped' : 'Could not finish'}
          </p>
          <p className="mt-0.5 text-sm break-words">
            {run.error ?? 'The collection stopped before it finished.'}
          </p>
          {connector && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              A collection reads Slack as you, through your AI tool&apos;s
              connector. Pace&apos;s own Slack connection answers mentions and
              is not used here.
            </p>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Nothing was added or closed.
      </p>
    </div>
  )
}

/** Its tool calls in order, with what was not kept said so */
function Lookups({
  run,
  groups,
}: {
  run: CollectionRunRecord
  groups: LookupGroup[]
}) {
  if (!groups.length) return <Empty>This collection made no lookups.</Empty>
  return (
    <div>
      <p className="mb-3 text-[13px] text-muted-foreground">
        {run.reads ?? 0} lookups in Slack
        {run.durationMs !== undefined
          ? ` in ${formatDuration(run.durationMs)}`
          : ''}
        . Pacenote&apos;s own tools gave the rules and took the tasks.
      </p>
      <ol>
        {groups.map((group, index) => (
          <li
            key={index}
            className="grid grid-cols-[3.25rem_1.25rem_minmax(0,1fr)_auto] items-start gap-x-2.5 border-t border-border py-2.5"
          >
            <span className="text-[11px] leading-5 text-muted-foreground tabular-nums">
              +{formatDuration(group.offsetMs)}
            </span>
            <span className="grid h-5 place-items-center text-muted-foreground [&_svg]:size-3.5">
              <LookupIcon group={group} />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-medium">{group.label}</span>
                {group.count > 1 && (
                  <span className="rounded-md bg-muted px-1.5 text-[11px] leading-[18px] font-medium tabular-nums">
                    ×{group.count}
                  </span>
                )}
                <span className="font-mono text-[11px] text-muted-foreground">
                  {group.tool}
                </span>
                {group.failed > 0 && (
                  <span className="text-[11px] text-status-failed">
                    {group.failed} failed
                  </span>
                )}
              </span>
              {group.note && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {group.note}
                </span>
              )}
            </span>
            <span className="text-[11px] leading-5 text-muted-foreground tabular-nums">
              {group.durationMs !== undefined
                ? formatDuration(group.durationMs)
                : ''}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-well px-3 py-2.5 text-xs text-muted-foreground">
        <Lock className="mt-px size-3.5 shrink-0" />
        What Slack returned is not kept: it is your messages. The record keeps
        which tool ran, when and for how long.
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
  const { rules } = collectionResult(run)
  if (!rules) return <Empty>This collection did not get the rules.</Empty>
  let shown = rules
  try {
    shown = JSON.stringify(JSON.parse(rules), null, 2)
  } catch {
    // Cut at the record's length: shown as it is.
  }
  return (
    <CodeBlock
      label="What Pacenote gave it (collect_context)"
      code={shown}
      maxHeight="max-h-[70vh]"
    />
  )
}
