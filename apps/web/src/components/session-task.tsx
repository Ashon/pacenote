import type { SessionRow } from '@src/sessions/types'
import { Search } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { InlineError } from '@/components/ui/inline-error'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { tasksToLink } from '@/lib/session-rows'
import { useTasks } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { text } from './sessions-page.text'

/** Link to a task: your open tasks, the session's repository's first */
export function LinkTaskDialog({
  s,
  onClose,
  onPick,
}: {
  s: SessionRow
  onClose: () => void
  /** Links it; what went wrong, or nothing */
  onPick: (task: string) => Promise<string | undefined>
}) {
  const t = useText(text)
  const tasks = useTasks().data?.tasks
  const [words, setWords] = useState('')
  const [error, setError] = useState<string>()
  const [linking, setLinking] = useState<string>()
  const shown = tasksToLink(tasks ?? [], s.repo, words)
  const pick = (task: string) => {
    setLinking(task)
    setError(undefined)
    void onPick(task).then((failed) => {
      setLinking(undefined)
      if (failed) setError(failed)
      else onClose()
    })
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[34rem] max-w-[calc(100vw-2rem)] gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-heading">{t.linkTitle}</DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">
            {t.linkLead(s.title)}
          </DialogDescription>
        </div>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            value={words}
            onChange={(event) => setWords(event.target.value)}
            placeholder={t.findTask}
            aria-label={t.findTask}
            className="pl-8"
          />
        </div>
        <ScrollArea className="max-h-[22rem]">
          {tasks === undefined ? (
            <p className="text-body text-muted-foreground">{t.reading}</p>
          ) : shown.length === 0 ? (
            <p className="text-body text-muted-foreground">{t.noTasks}</p>
          ) : (
            <ul aria-label={t.openTasks} className="flex flex-col">
              {shown.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    disabled={Boolean(linking)}
                    onClick={() => pick(task.id)}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60',
                      linking === task.id && 'bg-muted'
                    )}
                  >
                    <span className="text-row">{task.title}</span>
                    <span className="text-meta text-muted-foreground">
                      {[
                        task.repo,
                        task.askedBy && t.askedYou(task.askedBy),
                        formatRelative(task.postedAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <InlineError error={error} />
      </DialogContent>
    </Dialog>
  )
}
