import type { SessionMode } from '@src/sessions/types'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, FolderOpen, Play } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonWord } from '@/components/ui/skeleton'
import { homePath } from '@/lib/format'
import { useText } from '@/lib/i18n'
import {
  useNewSessionDraft,
  useSessions,
  useShowSessions,
  useStartSession,
} from '@/lib/sessions'
import { taskDetailQuery } from '@/lib/tasks'
import { text } from './session-new.text'
import { ModePicker } from './session-page'
import { text as pageText } from './session-page.text'
import { text as listText } from './sessions-page.text'
import { FolderDialog } from './task-folder'

/**
 * A new session Pacenote runs (V5, board Q11): from Todo's Continue, a task's,
 * its folder and first message written in for you to change; from Sessions,
 * any. Start runs Claude Code here and opens the session's page in its place.
 */
export function NewSessionPage({ task }: { task?: string }) {
  const t = useText(text)
  const l = useText(listText)
  const p = useText(pageText)
  const draft = useNewSessionDraft(task)
  const detail = useQuery({
    ...taskDetailQuery(task ?? ''),
    enabled: Boolean(task && window.pacenoteDesktop?.tasks),
  })
  const view = useSessions('todo').data
  const showSessions = useShowSessions()
  const start = useStartSession()
  const [folder, setFolder] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [mode, setMode] = useState<SessionMode>('default')
  const [choosing, setChoosing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string>()

  // What the task's draft says, until you change it
  const drafted = draft.data
  useEffect(() => {
    if (!drafted) return
    setFolder((current) => current ?? drafted.folder)
    setMessage((current) => current ?? drafted.prompt)
  }, [drafted])

  if (draft.data === undefined || (task && detail.data === undefined))
    return (
      <div className="mx-auto max-w-4xl px-10 py-9">
        <SkeletonWord width="14rem" />
      </div>
    )
  const taskView = detail.data?.task
  if (draft.data === null || (task && !taskView))
    return (
      <div className="mx-auto max-w-4xl px-10 py-9">
        <p className="text-copy text-muted-foreground">{t.notOpen}</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <a href="#/tasks">{t.backToTodo}</a>
        </Button>
      </div>
    )

  const said = message ?? ''
  // Pacenote runs it once Sessions on this Mac lists it
  const ready = Boolean(folder && said.trim()) && view?.on !== false
  const go = async () => {
    if (!ready || !folder || starting) return
    setStarting(true)
    setError(undefined)
    const result = await start({
      ...(task && { task }),
      folder,
      message: said,
      mode,
      ...(drafted?.marker && { marker: drafted.marker }),
    })
    setStarting(false)
    if (result.id)
      // Its page in this one's place: back goes where you came from
      window.location.replace(`#/sessions/${encodeURIComponent(result.id)}`)
    else setError(result.error)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void go()
  }
  const choose = async () => {
    if (taskView) return setChoosing(true)
    const check = await window.pacenoteDesktop?.tasks.chooseFolder()
    if (check && !check.error) setFolder(check.path)
    else if (check?.error) setError(check.error)
  }

  return (
    <ScrollArea className="h-full">
      <div className="@container mx-auto max-w-4xl px-10 pt-9 pb-10">
        <nav className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <a href="#/sessions" className="hover:text-foreground">
            {l.title}
          </a>
          <ChevronRight aria-hidden="true" className="size-3.5" />
          <span>{t.title}</span>
        </nav>
        <h1 data-page-title className="mt-2 text-title">
          {taskView?.title ?? t.title}
        </h1>
        <p className="mt-1.5 text-meta text-muted-foreground">
          {taskView ? (
            <a
              href={`#/tasks/${encodeURIComponent(taskView.id)}`}
              className="hover:text-foreground"
            >
              {t.fromTask(taskView.repo)}
            </a>
          ) : (
            t.lead
          )}
        </p>

        {view?.on === false && (
          <div className="mt-6 flex flex-col gap-2 rounded-[14px] bg-well px-4 py-3.5">
            <p className="text-section">{t.off}</p>
            <p className="text-meta text-muted-foreground">{t.offLead}</p>
            <Button
              size="sm"
              className="mt-1 self-start"
              onClick={() => void showSessions()}
            >
              {t.turnOn}
            </Button>
          </div>
        )}

        <dl className="mt-6 grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2.5 rounded-[14px] bg-well px-4 py-3.5 text-copy">
          <dt className="text-muted-foreground">{t.runIn}</dt>
          <dd>{t.here}</dd>
          <dt className="text-muted-foreground">{t.folder}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {folder ? (
              <span data-folder className="font-mono break-all">
                {homePath(folder)}
              </span>
            ) : (
              <span className="text-muted-foreground">{t.noFolder}</span>
            )}
            <Button
              type="button"
              size="xs"
              variant={folder ? 'ghost' : 'outline'}
              onClick={() => void choose()}
            >
              <FolderOpen />
              {folder ? t.change : t.choose}
            </Button>
          </dd>
        </dl>

        <form onSubmit={submit} className="mt-4">
          <div className="rounded-[14px] border border-input bg-background focus-within:ring-[3px] focus-within:ring-ring/40">
            <textarea
              aria-label={t.message}
              value={said}
              autoFocus={!task}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                // A long first message keeps Enter for its lines
                if (
                  event.key === 'Enter' &&
                  event.metaKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  void go()
                }
              }}
              rows={6}
              placeholder={t.placeholder}
              className="block max-h-[50vh] min-h-32 w-full resize-none bg-transparent px-4 pt-3 pb-1 font-mono text-meta leading-relaxed outline-none select-text placeholder:font-sans placeholder:text-muted-foreground [field-sizing:content]"
            />
            <div className="flex items-center gap-2 px-2.5 pb-2.5">
              <ModePicker
                mode={mode}
                onPick={async (picked) => {
                  setMode(picked)
                  return undefined
                }}
              />
              <span className="flex-1" />
              <span className="text-meta text-muted-foreground">{t.keys}</span>
              <Button type="submit" size="sm" disabled={!ready || starting}>
                <Play />
                {t.start}
              </Button>
            </div>
          </div>
          <InlineError error={error} className="mt-2" />
          <p className="mt-2 text-meta text-muted-foreground">{p.foot}</p>
        </form>
      </div>

      {taskView && (
        <FolderDialog
          task={taskView}
          tool="claude"
          open={choosing}
          action={t.useFolder}
          onClose={() => setChoosing(false)}
          onOpen={async (chosen) => {
            setFolder(chosen)
            setChoosing(false)
            return undefined
          }}
        />
      )}
    </ScrollArea>
  )
}
