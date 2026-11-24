import type {
  SessionRow,
  SessionTalk,
  SessionWrapDraft,
  SessionWrapUp,
} from '@src/sessions/types'
import { CircleCheck, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { InlineError } from '@/components/ui/inline-error'
import { useText } from '@/lib/i18n'
import { useSessionActions } from '@/lib/sessions'
import { text } from './session-wrap.text'

/**
 * Whether you close it here: one Pacenote runs, or a Codex one its log alone
 * shows open. One open in the Claude app or a terminal closes there.
 */
export const closable = (row: SessionRow) =>
  row.state !== 'ended' && (row.where === 'pacenote' || row.tool === 'codex')

/** Whether its task waits to be wrapped up: linked, and open still */
const wrappable = (row: SessionRow) =>
  row.tool !== 'opencode' && !!row.task && !row.task.closed

/**
 * A session page's way out: Wrap up, for one that is a task's work, and
 * Close. The desktop app's alone: a device has neither.
 */
export function SessionEnd({ talk }: { talk: SessionTalk }) {
  const t = useText(text)
  const act = useSessionActions(talk.row.id)
  const [wrapping, setWrapping] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string>()
  const { row } = talk
  const { close, wrapDraft, wrapUp } = act
  const canClose = !!close && closable(row)
  const canWrap = !!wrapDraft && !!wrapUp && wrappable(row)
  if (!canClose && !canWrap) return null
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {canWrap && (
          <Button size="sm" variant="outline" onClick={() => setWrapping(true)}>
            <CircleCheck />
            {t.wrapUp}
          </Button>
        )}
        {canClose && (
          <Button
            size="sm"
            variant="ghost"
            title={row.where === 'pacenote' ? t.closeHint : t.closeHintLog}
            disabled={closing}
            onClick={async () => {
              setClosing(true)
              setError(await close())
              setClosing(false)
            }}
          >
            <X />
            {t.close}
          </Button>
        )}
      </div>
      <InlineError error={error} />
      {canWrap && (
        <WrapUpDialog
          task={row.task!.title}
          closable={canClose}
          open={wrapping}
          onClose={() => setWrapping(false)}
          onDraft={wrapDraft}
          onWrapUp={wrapUp}
        />
      )}
    </div>
  )
}

/**
 * Wrap up: your AI reads how the session ended, you change what was done as
 * you like, keep the things left as tasks, and the task closes with it; the
 * session too, unless you keep it open
 */
export function WrapUpDialog({
  task,
  closable,
  open,
  onClose,
  onDraft,
  onWrapUp,
}: {
  /** Its task's title */
  task: string
  /** Whether the session closes here with it */
  closable: boolean
  open: boolean
  onClose: () => void
  onDraft: () => Promise<SessionWrapDraft>
  onWrapUp: (how: SessionWrapUp) => Promise<string | undefined>
}) {
  const t = useText(text)
  const [draft, setDraft] = useState<SessionWrapDraft>()
  const [summary, setSummary] = useState<string>()
  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set())
  const [closeToo, setCloseToo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const id = useId()
  useEffect(() => {
    if (!open) return
    let gone = false
    setDraft(undefined)
    setSummary(undefined)
    setKeep(new Set())
    setCloseToo(true)
    setError(undefined)
    void onDraft().then((result) => {
      if (gone) return
      setDraft(result)
      if ('error' in result) {
        setError(result.error)
        setSummary((current) => current ?? '')
      } else {
        setSummary((current) => current ?? result.summary)
        setKeep(new Set(result.left))
      }
    })
    return () => {
      gone = true
    }
    // Once each time it opens, not again as the page refreshes
  }, [open])
  const writing = draft === undefined
  const read = draft && !('error' in draft) ? draft : undefined
  const toggle = (item: string) =>
    setKeep((was) => {
      const next = new Set(was)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })
  const wrap = async () => {
    setBusy(true)
    const failed = await onWrapUp({
      summary: summary ?? '',
      keep: (read?.left ?? []).filter((item) => keep.has(item)),
      close: closable && closeToo,
    })
    setBusy(false)
    if (failed) setError(failed)
    else onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[34rem] max-w-[calc(100vw-2rem)] gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-heading">{t.wrapTitle}</DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">
            {t.wrapNote(task)}
          </DialogDescription>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={id}
            className="text-meta font-medium text-muted-foreground"
          >
            {writing ? t.writing : read ? t.writtenBy(read.by) : t.doneLabel}
          </label>
          <textarea
            id={id}
            value={summary ?? ''}
            onChange={(event) => setSummary(event.target.value)}
            placeholder={t.donePlaceholder}
            rows={4}
            className="w-full resize-y rounded-[10px] border border-input bg-background px-3 py-2.5 text-body leading-relaxed outline-none select-text focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
          {read && !read.done && (
            <p className="text-meta text-muted-foreground">{t.notDone}</p>
          )}
        </div>
        {!!read?.left.length && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-meta font-medium text-muted-foreground">
              {t.leftLabel}
            </legend>
            {read.left.map((item) => (
              <label
                key={item}
                className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-body hover:bg-accent"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={keep.has(item)}
                  onChange={() => toggle(item)}
                />
                <span className="min-w-0 flex-1 select-text">{item}</span>
              </label>
            ))}
          </fieldset>
        )}
        {closable && (
          <label className="flex cursor-pointer items-center gap-2.5 text-body">
            <input
              type="checkbox"
              checked={closeToo}
              onChange={() => setCloseToo((was) => !was)}
            />
            {t.closeToo}
          </label>
        )}
        <InlineError error={error} />
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              {t.cancel}
            </Button>
          </DialogClose>
          {/* What you write goes, while your AI still reads it */}
          <Button size="sm" disabled={busy} onClick={() => void wrap()}>
            <CircleCheck />
            {t.wrapIt}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
