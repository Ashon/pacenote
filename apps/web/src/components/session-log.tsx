import { InlineError } from '@/components/ui/inline-error'
import { CLI_NAMES } from '@src/tasks/own-ai'
import type { SessionItem } from '@src/tasks/types'
import { Copy, MessagesSquare, SquareTerminal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDateTime } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { useTaskDetail, useTaskWork } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { text } from './task-row.text'
import { resumeCommand, resumesInApp, sessionOf } from './task-sessions'

/**
 * A session's own log, read from the tool's files when you open it, in a
 * panel over the list; Esc or the close button puts it away
 */
export function SessionLogPanel({
  taskId,
  entryId,
  onClose,
}: {
  taskId: string
  entryId: string
  onClose: () => void
}) {
  const t = useText(text)
  const bridge = window.pacenoteDesktop?.tasks
  const act = useTaskWork(taskId)
  const detail = useTaskDetail(taskId)
  const found = sessionOf(detail.data, entryId)
  const [log, setLog] = useState<{ items?: SessionItem[]; error?: string }>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    void bridge?.sessionLog(entryId).then((result) => setLog(result ?? {}))
  }, [bridge, entryId])
  const entry = found?.entry
  const tool = entry ? CLI_NAMES[entry.tool] : t.theSession
  const resumeWith = resumeCommand(entry?.tool)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant="sheet"
        aria-describedby={undefined}
        className="w-[40rem] max-w-[calc(100vw-1rem)]"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pr-2 pl-5">
          <DialogTitle className="text-section">{t.sessionLog}</DialogTitle>
          <span className="flex-1" />
          <DialogClose asChild>
            <Button size="icon-sm" variant="ghost" aria-label={t.closeLog}>
              <X />
            </Button>
          </DialogClose>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-6 py-5">
            {!entry ? (
              <p className="text-copy text-muted-foreground">
                {detail.isPending ? t.findingSession : t.noSession}
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="text-heading">{found.title}</h2>
                  <p className="text-meta text-muted-foreground">
                    {t.toolSession(tool)} ·{' '}
                    <span className="font-mono">{entry.cwd}</span> ·{' '}
                    {formatDateTime(entry.startedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => void act.resume(entry.id).then(setError)}
                    disabled={!entry.session}
                  >
                    <SquareTerminal />
                    {resumesInApp(entry)
                      ? t.continueInApp(t.app.codex)
                      : t.continueIn(tool)}
                  </Button>
                  {entry.session && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          `${resumeWith} ${entry.session}`
                        )
                      }
                    >
                      <Copy />
                      <span className="font-mono text-meta">
                        {resumeWith} {entry.session.slice(0, 8)}…
                      </span>
                    </Button>
                  )}
                </div>
                <InlineError error={error} />
                {!log ? (
                  <p className="text-copy text-muted-foreground">
                    {t.readingLog}
                  </p>
                ) : log.error ? (
                  <p className="text-copy text-muted-foreground">{log.error}</p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {(log.items ?? []).map((item, index) => (
                      <LogItem key={index} item={item} tool={tool} />
                    ))}
                  </ol>
                )}
                <p className="flex items-start gap-1.5 text-meta text-muted-foreground">
                  <MessagesSquare className="mt-px size-3.5 shrink-0" />
                  {t.readFrom(tool)}
                </p>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One turn of the log: you or the tool, in a bubble with its time, or a tool
 * step on a line of its own
 */
function LogItem({ item, tool }: { item: SessionItem; tool: string }) {
  const t = useText(text)
  if (item.role === 'tool')
    return (
      <li className="ml-10 flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-meta">
        <span className="shrink-0 font-mono font-medium">{item.name}</span>
        <span className="min-w-0 truncate font-mono text-muted-foreground">
          {item.text}
        </span>
      </li>
    )
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-meta font-semibold',
          item.role === 'user'
            ? 'bg-secondary text-secondary-foreground'
            : 'bg-foreground text-background'
        )}
        aria-hidden="true"
      >
        {item.role === 'user' ? t.youInitial : tool[0]}
      </span>
      <div
        className={cn(
          'min-w-0 flex-1 rounded-[20px] px-4 py-3',
          item.role === 'user' ? 'bg-well' : 'border border-border'
        )}
      >
        <p className="text-section">
          {item.role === 'user' ? t.you : tool}
          {item.at && (
            <span className="ml-2 text-caption text-muted-foreground">
              {formatDateTime(item.at)}
            </span>
          )}
        </p>
        <p className="mt-1 text-body leading-relaxed whitespace-pre-wrap text-foreground/85 select-text">
          {item.text}
        </p>
      </div>
    </li>
  )
}
