import { isCollection, type RunRecord } from '@history/types'
import { MESSENGER_NAMES } from '@src/messengers/ids'
import {
  AtSign,
  Cpu,
  ExternalLink,
  FileText,
  ImageIcon,
  Paperclip,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Placeholder } from '@/components/ui/motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonBlock, SkeletonText } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { artifactUrl, useRun } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { CodeBlock } from './code-block'
import { CollectionDetail } from './collection-detail'
import { DurationFact, Empty, Fact, RawJson, TokensFact } from './run-facts'
import { text } from './run-detail.text'
import { StatusBadge } from './status'
import { Timeline } from './timeline'

export function RunDetail({ id }: { id: string }) {
  const t = useText(text)
  const { data: run, isError } = useRun(id)
  if (isError) {
    return (
      <p className="p-10 text-center text-copy text-muted-foreground">
        {t.notFound}
      </p>
    )
  }
  // Until the run comes, its skeleton holds the pane's shape
  return (
    <Placeholder fill ready={Boolean(run)} skeleton={<RunDetailSkeleton />}>
      {run &&
        (isCollection(run) ? (
          <CollectionDetail key={run.id} run={run} />
        ) : (
          <MentionDetail run={run} />
        ))}
    </Placeholder>
  )
}

function MentionDetail({ run }: { run: RunRecord }) {
  const t = useText(text)
  return (
    <Tabs defaultValue="timeline" className="flex h-full min-h-0 flex-col">
      <RunHeader run={run} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="@container mx-auto max-w-3xl px-8 py-6">
          <RunFacts run={run} />
          <TabsContent value="timeline" className="select-text">
            <Timeline run={run} />
          </TabsContent>
          <TabsContent value="attachments" className="select-text">
            <Attachments run={run} />
          </TabsContent>
          <TabsContent value="prompt" className="space-y-3 select-text">
            {run.prompt ? (
              <>
                <CodeBlock
                  label={t.instructions}
                  code={run.prompt.system}
                  maxHeight="max-h-96"
                />
                <CodeBlock
                  label={t.input}
                  code={run.prompt.user}
                  maxHeight="max-h-[60vh]"
                />
              </>
            ) : (
              <Empty>{t.noPrompt}</Empty>
            )}
          </TabsContent>
          <TabsContent value="raw" className="select-text">
            <RawJson run={run} />
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  )
}

/**
 * A run's pane while it comes: its header (status, request, tabs), its facts
 * and its first exchange, each as tall as it will be
 */
function RunDetailSkeleton() {
  const t = useText(text)
  return (
    <Tabs defaultValue="timeline" className="flex h-full min-h-0 flex-col">
      <header className="border-b bg-card/90 px-8 pt-6 pb-0">
        <div className="mx-auto max-w-3xl">
          <div className="flex h-6 items-center gap-2">
            <SkeletonBlock className="h-5 w-20 rounded-full" />
            <SkeletonText className="w-60 text-meta" width="100%" />
          </div>
          <SkeletonText
            className="mt-2.5 text-title leading-snug"
            width="55%"
          />
          <TabsList className="mt-4 mb-3">
            <TabsTrigger value="timeline" disabled>
              {t.tabs.timeline}
            </TabsTrigger>
            <TabsTrigger value="attachments" disabled>
              {t.tabs.attachments}
            </TabsTrigger>
            <TabsTrigger value="prompt" disabled>
              {t.tabs.prompt}
            </TabsTrigger>
            <TabsTrigger value="raw" disabled>
              {t.tabs.raw}
            </TabsTrigger>
          </TabsList>
        </div>
      </header>
      <div className="@container mx-auto w-full max-w-3xl px-8 py-6">
        <div className="mb-8 grid grid-cols-2 gap-y-4 border-b border-border pb-6 @min-[40rem]:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-w-0 px-4 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border @max-[40rem]:[&:nth-child(3)]:border-l-0 @max-[40rem]:[&:nth-child(3)]:pl-0"
            >
              <SkeletonText className="text-caption" width="54%" />
              <SkeletonText className="mt-1 text-copy" width="62%" />
              <SkeletonText
                className="text-caption"
                width={i % 2 ? '58%' : '70%'}
              />
            </div>
          ))}
        </div>
        <div className="space-y-5">
          {[false, true].map((accent, i) => (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 pt-1">
                <SkeletonBlock className="size-7 rounded-full" />
              </div>
              <div
                className={
                  accent
                    ? 'min-w-0 flex-1 surface-card-accent px-5 py-4'
                    : 'min-w-0 flex-1 surface-card px-5 py-4'
                }
              >
                <SkeletonText className="mb-2 text-copy" width="24%" />
                <SkeletonText
                  className="text-copy leading-relaxed"
                  width="86%"
                />
                <SkeletonText
                  className="text-copy leading-relaxed"
                  width="58%"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Tabs>
  )
}

/**
 * The header holds only status, request, and tabs. Run figures are in the
 * summary card above the body (RunFacts).
 */
function RunHeader({ run }: { run: RunRecord }) {
  const t = useText(text)
  return (
    <header className="border-b bg-card/90 px-8 pt-6 pb-0 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 text-meta text-muted-foreground">
          <StatusBadge status={run.status} />
          <Badge variant="secondary">
            <AtSign />
            {t.mention}
          </Badge>
          {run.attempts > 1 && (
            <Badge variant="secondary">{t.attempts(run.attempts)}</Badge>
          )}
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{run.origin.conversationLabel}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="truncate">
              @{run.origin.userName ?? run.origin.userId}
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span className="shrink-0 tabular-nums">
              {formatDateTime(run.startedAt)}
            </span>
          </span>
          {run.origin.permalink && (
            <Button
              asChild
              variant="outline"
              size="xs"
              className="ml-auto shrink-0"
            >
              <a href={run.origin.permalink} target="_blank" rel="noreferrer">
                <ExternalLink />
                {t.viewIn(MESSENGER_NAMES[run.origin.messenger])}
              </a>
            </Button>
          )}
        </div>
        <h1 className="mt-2.5 line-clamp-2 text-title leading-snug select-text">
          {run.request || t.emptyRequest}
        </h1>
        <TabsList className="mt-4 mb-3">
          <TabsTrigger value="timeline">{t.tabs.timeline}</TabsTrigger>
          <TabsTrigger value="attachments">
            {t.tabs.attachments}
            {run.attachments.length > 0 && (
              <span className="rounded-sm bg-muted px-1 text-caption tabular-nums">
                {run.attachments.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="prompt">{t.tabs.prompt}</TabsTrigger>
          <TabsTrigger value="raw">{t.tabs.raw}</TabsTrigger>
        </TabsList>
      </div>
    </header>
  )
}

/**
 * Run summary: duration, tools, tokens, reasoner backend. Same look as the
 * Overview totals: one row of figures split by hairlines
 */
function RunFacts({ run }: { run: RunRecord }) {
  const t = useText(text)
  const tools = run.events.filter(
    (e) => e.kind === 'tool' || e.kind === 'command'
  ).length
  return (
    // Two columns when the detail is narrow
    <div className="mb-8 grid grid-cols-2 gap-y-4 border-b border-border pb-6 @min-[40rem]:grid-cols-4">
      <DurationFact run={run} label={t.duration} />
      <Fact icon={<Wrench />} label={t.toolCalls} value={t.calls(tools)} />
      <TokensFact run={run} cacheWrite={run.backend.reasoner !== 'codex'} />
      <Fact
        icon={<Cpu />}
        label={t.reasoner}
        value={`${run.backend.reasoner}@${run.backend.sandbox}`}
        hint={run.backend.model}
      />
    </div>
  )
}

const ATTACHMENT_STATUS = {
  read: 'text-status-succeeded',
  skipped: 'text-status-interrupted',
  failed: 'text-status-failed',
} as const

function Attachments({ run }: { run: RunRecord }) {
  const t = useText(text)
  if (run.attachments.length === 0) return <Empty>{t.noAttachments}</Empty>
  return (
    <ul className="space-y-2">
      {run.attachments.map((item, i) => {
        const Icon =
          item.kind === 'image'
            ? ImageIcon
            : item.kind === 'other'
              ? Paperclip
              : FileText
        return (
          <li key={`${item.name}-${i}`} className="surface-card flex gap-3 p-3">
            {item.file ? (
              <img
                src={artifactUrl(run.id, item.file)}
                alt={item.name}
                className="size-20 shrink-0 rounded-lg bg-white object-cover"
              />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-well">
                <Icon className="size-4 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0 flex-1 text-copy">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{item.name}</span>
                <span className={`text-meta ${ATTACHMENT_STATUS[item.status]}`}>
                  {t.attachment[item.status]}
                </span>
              </div>
              {item.source && (
                <p className="text-meta text-muted-foreground">{item.source}</p>
              )}
              {item.reason && (
                <p className="mt-0.5 text-meta text-muted-foreground">
                  {item.reason}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
