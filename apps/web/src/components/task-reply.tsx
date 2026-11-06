import { CLI_NAMES } from '@src/tasks/own-ai'
import type { TaskDetail } from '@src/tasks/types'
import { Copy, RotateCw } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { switchLine } from './own-ai-status'
import { PaceSpinner } from './pace-spinner'
import { text } from './task-row.text'

/**
 * A reply for you to send in the task's thread: drafted here for you to edit,
 * or left by a session. Copying it opens the thread; Pacenote never sends it.
 */

type Draft = Extract<TaskDetail['work'][number], { kind: 'draft' }>

/** Your reply as you edit it, or the AI drafting it from the thread */
export function ReplyDraft({
  drafting,
  reply,
  latestDraft,
  replyText,
  onReply,
  onCopy,
  onDraft,
}: {
  drafting: boolean
  /** Your reply as you edit it, none until you do */
  reply?: string
  /** The latest reply drafted for the task */
  latestDraft?: Draft
  /** The reply in the box */
  replyText: string
  onReply: (text: string) => void
  onCopy: (text: string) => void
  onDraft: () => void
}) {
  const t = useText(text)
  const replyId = useId()
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2.5">
      {drafting ? (
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <PaceSpinner writing className="size-6" />
          <span className="text-shimmer">{t.draftingReply}</span>
        </p>
      ) : (
        <>
          <label htmlFor={replyId} className="text-meta text-muted-foreground">
            {!latestDraft || reply !== undefined
              ? t.yourReply
              : latestDraft.copiedAt
                ? t.replyCopied(formatRelative(latestDraft.copiedAt))
                : t.replyDrafted(
                    formatRelative(latestDraft.at),
                    latestDraft.by && CLI_NAMES[latestDraft.by]
                  )}
            {latestDraft?.switched &&
              reply === undefined &&
              !latestDraft.copiedAt && (
                <span data-switch> · {switchLine(latestDraft.switched)}</span>
              )}
          </label>
          <textarea
            id={replyId}
            value={replyText}
            onChange={(event) => onReply(event.target.value)}
            rows={4}
            className="w-full resize-y rounded-[10px] border border-input bg-background px-3 py-2.5 text-body leading-relaxed outline-none select-text focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => onCopy(replyText)}
              disabled={!replyText.trim()}
            >
              <Copy />
              {t.copyAndOpen}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDraft}>
              <RotateCw />
              {t.draftAgain}
            </Button>
            <span className="ml-1 text-meta text-muted-foreground">
              {t.neverSends}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

/** The reply a session left for you to send, until you have copied one */
export function WaitingReply({
  reply,
  askedBy,
  onCopy,
  onEdit,
}: {
  reply: string
  /** Who waits for it in the thread */
  askedBy?: string
  onCopy: (text: string) => void
  /** Puts it in the reply box to edit first */
  onEdit: (text: string) => void
}) {
  const t = useText(text)
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card-accent px-3.5 py-3">
      <p className="flex items-center gap-2 text-body font-semibold">
        <PaceSpinner className="size-5" />
        {askedBy ? t.stillWaiting(askedBy) : t.replyWaiting}
      </p>
      <p className="text-body text-foreground/80 select-text">
        {t.sessionDrafted(reply)}
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => onCopy(reply)}>
          <Copy />
          {t.copyAndOpen}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(reply)}>
          {t.editFirst}
        </Button>
      </div>
    </div>
  )
}
