import { handedParts, isHanded } from '@src/sessions/handed'
import type { CodexMode, HostTool, SessionMode } from '@src/sessions/types'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, FolderOpen, Pencil, Play, ScanEye } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Segmented } from '@/components/ui/segmented'
import { SkeletonBlock, SkeletonText } from '@/components/ui/skeleton'
import { remoteMac } from '@/lib/desktop'
import { homePath } from '@/lib/format'
import { useText } from '@/lib/i18n'
import { usePhone } from '@/lib/phone'
import { recentFolders } from '@/lib/session-rows'
import {
  useNewSessionDraft,
  useSessions,
  useSessionTools,
  useShowSessions,
  useStartSession,
} from '@/lib/sessions'
import { readStored, writeStored } from '@/lib/storage'
import { taskDetailQuery } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { HandedPartView, tasksHanded, Said } from './handed-task'
import { text } from './session-new.text'
import { ModePicker } from './session-page'
import { text as pageText } from './session-page.text'
import { text as listText } from './sessions-page.text'
import { FolderDialog } from './task-folder'

/** The tool you picked last for a new session (Z1) */
const TOOL_KEY = 'pacenote.sessions.tool'
const TOOL_NAMES: Record<HostTool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

/**
 * A new session Pacenote runs (V5, board Q11): from Todo's Continue, a task's,
 * its folder and first message written in for you to change; from Sessions,
 * any. Start runs Claude Code here, or Codex (Z1, board X1), and opens the
 * session's page in its place.
 */
export function NewSessionPage({
  task,
  group,
}: {
  task?: string
  /** A group of tasks the task is in: Continue here for all of them */
  group?: string
}) {
  const t = useText(text)
  const l = useText(listText)
  const p = useText(pageText)
  const phone = usePhone()
  const draft = useNewSessionDraft(task, group)
  const detail = useQuery({
    ...taskDetailQuery(task ?? ''),
    enabled: Boolean(task && window.pacenoteDesktop?.tasks),
  })
  const view = useSessions('todo').data
  const showSessions = useShowSessions()
  const start = useStartSession()
  const [folder, setFolder] = useState<string>()
  const [message, setMessage] = useState<string>()
  // A task's message as its cards, with a note of yours after it; or all of
  // it as text, to change any of it
  const [note, setNote] = useState('')
  const [asText, setAsText] = useState(false)
  const tools = useSessionTools().data
  const [picked, setPicked] = useState<HostTool>(() =>
    readStored(TOOL_KEY) === 'codex' ? 'codex' : 'claude'
  )
  const [mode, setMode] = useState<SessionMode>('default')
  const [codexMode, setCodexMode] = useState<CodexMode>('workspace')
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
    return <NewSkeleton phone={phone} />
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

  const mac = remoteMac()
  const remote = Boolean(mac)
  const written = message ?? ''
  const handed = isHanded(written)
  const asCards = handed && !asText
  const said =
    asCards && note.trim() ? `${written.trimEnd()}\n\n${note.trim()}` : written
  const asWritten = () => {
    setMessage(said)
    setNote('')
    setAsText(true)
  }
  // Claude Code or Codex, where the Mac says whether Codex can (a device
  // starts Claude Code sessions until its app asks)
  const tool: HostTool = tools && picked === 'codex' ? 'codex' : 'claude'
  const by = TOOL_NAMES[tool]
  const codexWhy =
    tools && !tools.codex.ready
      ? t.codexWhy[tools.codex.why ?? 'missing']
      : undefined
  // Pacenote runs it once Sessions on this Mac lists it
  const ready =
    Boolean(folder && said.trim()) &&
    view?.on !== false &&
    (tool !== 'codex' || Boolean(tools?.codex.ready))
  const pick = (chosen: HostTool) => {
    setPicked(chosen)
    writeStored(TOOL_KEY, chosen)
  }
  const go = async () => {
    if (!ready || !folder || starting) return
    setStarting(true)
    setError(undefined)
    const result = await start({
      tool,
      ...(task && { task }),
      folder,
      message: said,
      mode: tool === 'codex' ? codexMode : mode,
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
    // A task's folders, or from a device the ones the Mac knows (its file
    // dialog is the Mac's own)
    if (taskView || remote) return setChoosing(true)
    const check = await window.pacenoteDesktop?.tasks.chooseFolder()
    if (check && !check.error) setFolder(check.path)
    else if (check?.error) setError(check.error)
  }

  return (
    <ScrollArea className="h-full">
      <div className="@container mx-auto max-w-4xl px-10 pt-9 pb-10">
        <nav
          data-page-crumbs
          className="flex items-center gap-1.5 text-meta text-muted-foreground"
        >
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
          ) : mac ? (
            t.leadOn(mac)
          ) : (
            t.lead(by)
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
          {tools ? (
            <dd className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Segmented
                label={t.runIn}
                value={tool}
                onChange={pick}
                options={[
                  { value: 'claude', label: TOOL_NAMES.claude },
                  {
                    value: 'codex',
                    label: TOOL_NAMES.codex,
                    disabled: !tools.codex.ready && tool !== 'codex',
                  },
                ]}
              />
              <span>{mac ? t.onMac(mac) : t.hereInPacenote}</span>
              {codexWhy && (
                <span className="w-full text-meta text-muted-foreground">
                  {codexWhy}
                </span>
              )}
            </dd>
          ) : (
            <dd>{mac ? t.hereOn(mac) : t.here()}</dd>
          )}
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
            {asCards && <HandedPreview message={written} tool={by} />}
            <textarea
              aria-label={asCards ? t.note : t.message}
              value={asCards ? note : said}
              autoFocus={!task}
              onChange={(event) =>
                asCards
                  ? setNote(event.target.value)
                  : setMessage(event.target.value)
              }
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
              rows={asCards ? 2 : 6}
              placeholder={asCards ? t.notePlaceholder(by) : t.placeholder(by)}
              className={cn(
                'block max-h-[50vh] w-full resize-none bg-transparent px-4 pt-3 pb-1 leading-relaxed outline-none select-text placeholder:font-sans placeholder:text-muted-foreground [field-sizing:content]',
                asCards ? 'min-h-16 text-body' : 'min-h-32 font-mono text-meta'
              )}
            />
            <div className="flex items-center gap-2 px-2.5 pb-2.5">
              {tool === 'codex' ? (
                <ModePicker
                  tool="codex"
                  mode={codexMode}
                  onPick={async (chosen) => {
                    setCodexMode(chosen as CodexMode)
                    return undefined
                  }}
                />
              ) : (
                <ModePicker
                  mode={mode}
                  onPick={async (chosen) => {
                    setMode(chosen as SessionMode)
                    return undefined
                  }}
                />
              )}
              {handed && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => (asCards ? asWritten() : setAsText(false))}
                >
                  {asCards ? <Pencil /> : <ScanEye />}
                  {asCards ? t.editAsText : t.showAsCards}
                </Button>
              )}
              <span className="flex-1" />
              {!remote && (
                <span className="text-meta text-muted-foreground">
                  {t.keys}
                </span>
              )}
              <Button type="submit" size="sm" disabled={!ready || starting}>
                <Play />
                {t.start}
              </Button>
            </div>
          </div>
          <InlineError error={error} className="mt-2" />
          {/* A phone's lead says where it runs */}
          {!phone && (
            <p className="mt-2 text-meta text-muted-foreground">
              {mac ? p.footOn(mac, by) : p.foot[tool]}
            </p>
          )}
        </form>
      </div>

      {(taskView || remote) && (
        <FolderDialog
          task={taskView}
          folders={taskView ? undefined : recentFolders(view)}
          tool={tool}
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

/**
 * A task's first message as its session's page will show it: the task's
 * card, its group, what Pacenote asks of the AI folded, and anything you
 * wrote in it as Markdown
 */
function HandedPreview({ message, tool }: { message: string; tool: string }) {
  const parts = handedParts(message)
  const count = tasksHanded(parts)
  return (
    <div
      data-handed-preview
      className="mx-1.5 mt-1.5 flex flex-col gap-2 rounded-[11px] bg-well px-3 py-3"
    >
      {parts.map((part, index) =>
        part.kind === 'text' ? (
          <Said key={index} text={part.text} />
        ) : (
          <HandedPartView key={index} part={part} tool={tool} count={count} />
        )
      )}
    </div>
  )
}

/**
 * The page as it will be, while the Mac drafts it: its line, where it runs
 * and in which folder, and the box for its first message. A phone's bar has
 * its title.
 */
function NewSkeleton({ phone }: { phone: boolean }) {
  return (
    <div
      className="motion-skeleton mx-auto max-w-4xl px-10 pt-9 pb-10"
      aria-hidden="true"
    >
      {!phone && (
        <>
          <SkeletonText className="text-meta" width="9rem" />
          <SkeletonText className="mt-2 text-title" width="14rem" />
        </>
      )}
      <SkeletonText
        className={phone ? 'text-meta' : 'mt-1.5 text-meta'}
        width={phone ? '84%' : '22rem'}
      />
      <SkeletonBlock className="mt-6 h-[5.25rem] rounded-[14px]" />
      <SkeletonBlock className="mt-4 h-[10.5rem] rounded-[14px]" />
    </div>
  )
}
